import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { canDownloadAttachment, canModeratePosts, canReadEffectiveBoard, getEffectiveBoardAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveStoredFile } from "@/lib/files/paths";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(filename: string, download: boolean) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_").slice(0, 120) || "download";
  return `${download ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// 이미지·PDF·오디오·비디오만 인라인으로 열어도 안전합니다(브라우저가 스크립트로 실행할 수
// 없는 형식). 그 외 저장된 mimeType(과거에 저장된 값 포함, 업로드 검증 로직이 나중에 바뀌어도
// 방어선이 되도록)은 inline 요청이 와도 attachment로 강제해, 잘못 분류된 값이 브라우저에서
// 앱 출처의 HTML/JS로 렌더링되는 걸 막습니다.
const INLINE_SAFE_MIME_TYPES = new Set(["application/pdf"]);
const INLINE_SAFE_MIME_PREFIXES = ["image/", "video/", "audio/"];

function isInlineSafe(mimeType: string) {
  return INLINE_SAFE_MIME_TYPES.has(mimeType) || INLINE_SAFE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

function parseRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    const { attachmentId } = await params;
    const currentUser = await getCurrentUser();
    const prisma = getPrisma();
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        deletedAt: true,
        originalName: true,
        storagePath: true,
        thumbnailPath: true,
        mimeType: true,
        type: true,
        post: { select: { boardId: true, deletedAt: true, status: true, authorId: true } },
      },
    });
    if (!attachment || attachment.deletedAt || attachment.post.deletedAt) {
      return new Response("파일을 찾을 수 없습니다.", { status: 404 });
    }
    const access = await getEffectiveBoardAccess(attachment.post.boardId, currentUser);
    if (!access || !canReadEffectiveBoard(currentUser, access)) {
      return new Response("파일 접근 권한이 없습니다.", { status: 403 });
    }
    // 승인 대기·거절된 게시물의 첨부파일은 작성자 본인과 보드 관리자만 볼 수 있습니다(padupgrade.md 5.3).
    if (attachment.post.status !== "PUBLISHED") {
      const isAuthor = currentUser?.id === attachment.post.authorId;
      const isModerator = Boolean(currentUser && canModeratePosts(currentUser, access));
      if (!isAuthor && !isModerator) return new Response("파일 접근 권한이 없습니다.", { status: 403 });
    }

    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";
    if (download && !canDownloadAttachment(currentUser, access)) return new Response("파일 다운로드 권한이 없습니다.", { status: 403 });
    if (attachment.type === "LINK" || !attachment.storagePath) return new Response("로컬 파일이 없는 첨부입니다.", { status: 404 });
    const thumbnail = url.searchParams.get("variant") === "thumbnail" && attachment.thumbnailPath;
    const filePath = resolveStoredFile(thumbnail ? attachment.thumbnailPath! : attachment.storagePath);
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile()) return new Response("파일을 찾을 수 없습니다.", { status: 404 });
    const contentType = thumbnail ? "image/webp" : attachment.mimeType || "application/octet-stream";
    const baseHeaders = {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(attachment.originalName, download || !isInlineSafe(contentType)),
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      // max-age를 길게 주면 보드 멤버에서 제외되거나 첨부 다운로드 정책이 꺼진 뒤에도 그 시간
      // 동안 브라우저 캐시로 파일을 계속 볼 수 있습니다. no-cache는 캐시 자체는 허용하되 매번
      // 서버에 재검증을 요구하므로, 권한 변경이 즉시 반영되면서 304로 재전송 비용도 아낍니다.
      "Cache-Control": "private, no-cache, must-revalidate",
      // 파일은 UUID 저장명으로 한 번 쓰고 바뀌지 않으므로, 재검증은 변경 여부가 아니라 권한을
      // 다시 확인하기 위한 것입니다. ETag로 본문 재전송만 피합니다.
      ETag: `"${attachmentId}-${fileStat.size}-${fileStat.mtimeMs}"`,
    };
    const rangeHeader = request.headers.get("range");
    // 여기까지 왔다면 권한 검사는 모두 통과한 상태이므로, 내용이 그대로면 본문 없이 304만
    // 돌려줍니다. Range 요청은 부분 응답 규칙이 달라 그대로 처리합니다.
    if (!rangeHeader && request.headers.get("if-none-match") === baseHeaders.ETag) {
      return new Response(null, { status: 304, headers: baseHeaders });
    }
    if (rangeHeader) {
      const range = parseRange(rangeHeader, fileStat.size);
      if (!range) return new Response(null, { status: 416, headers: { ...baseHeaders, "Content-Range": `bytes */${fileStat.size}` } });
      const stream = createReadStream(filePath, { start: range.start, end: range.end });
      return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
        status: 206,
        headers: { ...baseHeaders, "Content-Length": String(range.end - range.start + 1), "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}` },
      });
    }
    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>, { headers: { ...baseHeaders, "Content-Length": String(fileStat.size) } });
  } catch (error) {
    console.error(error);
    return new Response("파일 처리 중 오류가 발생했습니다.", { status: 500 });
  }
}
