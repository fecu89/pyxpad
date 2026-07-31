import { open } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import type { AttachmentType } from "@/generated/prisma/client";
import type { StreamedUpload } from "@/lib/files/multipart";

const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".zip", ".hwp", ".hwpx",
  ".mp4", ".webm", ".mov", ".mp3", ".m4a", ".wav", ".ogg",
]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
// file-type은 매직바이트가 없는 형식(.txt)이나 낡은/드문 바이너리 형식(.hwp)을 감지하지 못할 수
// 있습니다. 이때 detected가 없다고 업로더가 보낸 멀티파트 파트의 Content-Type(file.mimeType)을
// 그대로 믿으면, 클라이언트가 완전히 임의의 값(예: text/html)을 채워 보낼 수 있고 그 값이 그대로
// DB에 저장돼 다운로드 응답의 Content-Type으로 다시 나갑니다 — inline으로 열람될 때 브라우저가
// 첨부파일을 앱 출처에서 HTML/JS로 렌더링하는 저장형 XSS로 이어집니다. 그래서 감지 실패 시에는
// 클라이언트 값 대신 확장자별로 우리가 아는 안전한 값만 씁니다.
const KNOWN_EXTENSION_MIME_TYPES: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".zip": "application/zip",
  ".hwp": "application/x-hwp",
  ".hwpx": "application/haansofthwpx",
};
const MEDIA_MIME_TYPES: Record<string, Set<string>> = {
  ".mp4": new Set(["video/mp4"]),
  ".webm": new Set(["video/webm", "audio/webm"]),
  ".mov": new Set(["video/quicktime"]),
  ".mp3": new Set(["audio/mpeg"]),
  ".m4a": new Set(["audio/mp4", "audio/x-m4a"]),
  ".wav": new Set(["audio/wav", "audio/x-wav"]),
  ".ogg": new Set(["audio/ogg", "application/ogg"]),
};

export class AttachmentLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentLimitError";
  }
}

async function detectFileType(file: StreamedUpload) {
  const handle = await open(/* turbopackIgnore: true */ file.temporaryPath, "r");
  try {
    const header = Buffer.allocUnsafe(Math.min(file.size, 8192));
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return fileTypeFromBuffer(header.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function classify(mime: string): AttachmentType {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("word") || mime.includes("presentation") || mime.includes("spreadsheet") || mime === "text/plain") return "DOCUMENT";
  return "FILE";
}

export function maxUploadBytes() {
  const configured = Number(process.env.MAX_UPLOAD_SIZE_MB ?? "30");
  const maxMb = Number.isFinite(configured) ? Math.min(1024, Math.max(1, Math.floor(configured))) : 30;
  return maxMb * 1024 * 1024;
}

export async function validateUploadedFile(file: StreamedUpload) {
  const maxBytes = maxUploadBytes();
  if (file.size <= 0) throw new Error("빈 파일은 업로드할 수 없습니다.");
  if (file.size > maxBytes) throw new Error(`파일은 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하만 업로드할 수 있습니다.`);

  const originalExtension = path.extname(file.originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(originalExtension)) throw new Error("허용되지 않은 파일 확장자입니다.");

  const detected = await detectFileType(file);
  if (IMAGE_EXTENSIONS.has(originalExtension)) {
    if (!detected?.mime.startsWith("image/")) throw new Error("이미지 파일의 실제 형식을 확인할 수 없습니다.");
    return { mimeType: "image/webp", extension: ".webp", attachmentType: "IMAGE" as const, isImage: true };
  }
  if (originalExtension === ".pdf" && detected?.mime !== "application/pdf") throw new Error("올바른 PDF 파일이 아닙니다.");

  const allowedMediaMimes = MEDIA_MIME_TYPES[originalExtension];
  if (allowedMediaMimes) {
    if (!detected) throw new Error("미디어 파일의 실제 형식을 확인할 수 없습니다.");
    const detectedMime = detected.mime;
    const claimedMime = file.mimeType.toLowerCase();
    // MediaRecorder(mode: "audio")가 만드는 File의 type은 recorder.mimeType을 그대로 쓰는데,
    // 브라우저가 "audio/webm;codecs=opus"처럼 코덱 파라미터를 붙여 돌려주는 경우가 흔합니다.
    // WebM 컨테이너는 오디오 전용이어도 EBML DocType만으로는 video/audio를 구분할 수 없어
    // file-type이 항상 "video/webm"으로 감지하므로, 정확히 "audio/webm"과만 비교하면
    // 코덱 파라미터가 붙은 실제 녹음 파일은 전부 걸러지지 못하고 VIDEO로 잘못 분류됐습니다.
    const claimedIsAudioWebm = claimedMime === "audio/webm" || claimedMime.startsWith("audio/webm;");
    const normalizedMime = originalExtension === ".webm"
      && detectedMime === "video/webm"
      && claimedIsAudioWebm
      ? "audio/webm"
      : detectedMime;
    if (!allowedMediaMimes.has(normalizedMime)) throw new Error("파일 확장자와 실제 미디어 형식이 일치하지 않습니다.");
    return {
      mimeType: normalizedMime,
      extension: originalExtension,
      attachmentType: classify(normalizedMime),
      isImage: false,
    };
  }

  const mimeType = detected?.mime || KNOWN_EXTENSION_MIME_TYPES[originalExtension] || "application/octet-stream";
  return { mimeType, extension: originalExtension, attachmentType: classify(mimeType), isImage: false };
}
