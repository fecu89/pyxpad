"use client";

// 검증 "방식"은 댓글 첨부(comment-attachment-input.tsx)처럼 확장자 추정이 아니라 실제
// MIME 타입으로 판정합니다. 다만 게시물은 서버가 이미지·비디오·오디오·PDF·문서·zip·hwp 등
// 폭넓은 형식과 개당 20개까지 허용하므로(app/api/posts/[postId]/attachments/route.ts,
// lib/files/validation.ts), 댓글의 "이미지·음성 4개"로 범위를 좁히지 않고 게시물이 실제
// 지원하는 형식·개수는 그대로 유지한 채 타입별 용량 상한만 둡니다.
//
// hwp/hwpx나 일부 오피스 문서는 브라우저가 file.type을 비워서 주는 경우가 흔해, MIME이
// 비어 있거나 알려진 형식과 매치되지 않으면 확장자로 한 번 더 확인합니다(서버는 어차피
// 실제 파일 시그니처로 다시 검증하므로, 클라이언트 검사는 사용자 실수를 빨리 알려주는
// 역할이면 충분합니다).
type Category = "IMAGE" | "VIDEO" | "AUDIO" | "PDF" | "DOCUMENT" | "ARCHIVE" | "HWP";

const mimeTypesByCategory: Record<Category, Set<string>> = {
  IMAGE: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  VIDEO: new Set(["video/mp4", "video/webm", "video/quicktime"]),
  AUDIO: new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm"]),
  PDF: new Set(["application/pdf"]),
  DOCUMENT: new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ]),
  ARCHIVE: new Set(["application/zip", "application/x-zip-compressed"]),
  HWP: new Set([]), // 브라우저가 신뢰할 만한 MIME을 안 줘서 항상 확장자로만 판정합니다.
};

const extensionsByCategory: Record<Category, Set<string>> = {
  IMAGE: new Set(["jpg", "jpeg", "png", "webp", "gif"]),
  VIDEO: new Set(["mp4", "webm", "mov"]),
  AUDIO: new Set(["mp3", "m4a", "wav", "ogg"]),
  PDF: new Set(["pdf"]),
  DOCUMENT: new Set(["docx", "pptx", "xlsx", "txt"]),
  ARCHIVE: new Set(["zip"]),
  HWP: new Set(["hwp", "hwpx"]),
};

// 서버 기본 업로드 상한(30MB, MAX_UPLOAD_SIZE_MB)을 넘지 않는 선에서 형식별로 나눕니다.
// 이미지·음성은 댓글과 같은 값을 씁니다.
const capBytesByCategory: Record<Category, number> = {
  IMAGE: 10 * 1024 * 1024,
  AUDIO: 20 * 1024 * 1024,
  VIDEO: 30 * 1024 * 1024,
  PDF: 30 * 1024 * 1024,
  DOCUMENT: 30 * 1024 * 1024,
  ARCHIVE: 30 * 1024 * 1024,
  HWP: 30 * 1024 * 1024,
};

const pastedImageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const attachmentAccept = [
  ".jpg", ".jpeg", ".png", ".webp", ".gif",
  ".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".zip", ".hwp", ".hwpx",
  ".mp4", ".webm", ".mov",
  ".mp3", ".m4a", ".wav", ".ogg",
].join(",");

// 게시물 첨부 개당 최대 20개(app/api/posts/[postId]/attachments/route.ts와 동일).
export const maximumAttachmentCount = 20;

function extension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

export function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

function classify(file: File): Category | null {
  const mime = file.type.toLowerCase();
  if (mime) {
    for (const category of Object.keys(mimeTypesByCategory) as Category[]) {
      if (mimeTypesByCategory[category].has(mime)) return category;
    }
  }
  const ext = extension(file);
  for (const category of Object.keys(extensionsByCategory) as Category[]) {
    if (extensionsByCategory[category].has(ext)) return category;
  }
  return null;
}

function normalizePastedFile(file: File, index: number) {
  if (classify(file)) return file;
  const normalizedExtension = pastedImageExtensions[file.type];
  if (!normalizedExtension) return file;
  return new File(
    [file],
    `붙여넣은_이미지_${new Date().toISOString().replaceAll(":", "-")}_${index + 1}.${normalizedExtension}`,
    { type: file.type, lastModified: file.lastModified || Date.now() },
  );
}

export function prepareAttachmentFiles(
  incoming: File[],
  existing: File[] = [],
  maximumCount = maximumAttachmentCount,
) {
  const accepted: File[] = [];
  const rejected: string[] = [];
  const known = new Set(existing.map(fileKey));
  let total = existing.length;
  incoming.map(normalizePastedFile).forEach((file) => {
    if (total >= maximumCount) {
      rejected.push(`게시물에는 첨부를 ${maximumCount}개까지만 추가할 수 있습니다.`);
      return;
    }
    if (file.size <= 0) {
      rejected.push(`${file.name || "파일"}: 빈 파일은 첨부할 수 없습니다.`);
      return;
    }
    const category = classify(file);
    if (!category) {
      rejected.push(`${file.name || "파일"}: 지원하지 않는 파일 형식입니다.`);
      return;
    }
    const maximumBytes = capBytesByCategory[category];
    if (file.size > maximumBytes) {
      rejected.push(`${file.name}: ${Math.floor(maximumBytes / 1024 / 1024)}MB 이하 파일만 첨부할 수 있습니다.`);
      return;
    }
    const key = fileKey(file);
    if (known.has(key)) return;
    known.add(key);
    accepted.push(file);
    total += 1;
  });
  return { accepted, rejected };
}
