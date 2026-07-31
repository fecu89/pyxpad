import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";

export type StreamedUpload = {
  temporaryPath: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export async function streamMultipartFile(request: Request, directory: string, maxBytes: number): Promise<StreamedUpload> {
  if (!request.body) throw new Error("업로드 데이터가 없습니다.");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new Error("multipart/form-data 형식만 지원합니다.");
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes + 1024 * 1024) throw new Error("업로드 파일이 허용 크기를 초과했습니다.");

  await mkdir(/* turbopackIgnore: true */ directory, { recursive: true });
  const temporaryPath = path.join(/* turbopackIgnore: true */ directory, `${randomUUID()}.incoming`);
  const headers = Object.fromEntries(request.headers.entries());
  let upload: StreamedUpload | null = null;
  let truncated = false;
  let tooManyFiles = false;
  let writePromise: Promise<void> | null = null;

  try {
    const parser = Busboy({ headers, defParamCharset: "utf8", limits: { files: 1, fields: 0, parts: 1, fileSize: maxBytes } });
    parser.on("filesLimit", () => { tooManyFiles = true; });
    parser.on("file", (fieldName, file, info) => {
      if (fieldName !== "file" || upload) {
        file.resume();
        return;
      }
      upload = { temporaryPath, originalName: info.filename, mimeType: info.mimeType, size: 0 };
      file.on("data", (chunk: Buffer) => { if (upload) upload.size += chunk.length; });
      file.on("limit", () => { truncated = true; });
      writePromise = pipeline(file, createWriteStream(/* turbopackIgnore: true */ temporaryPath, { flags: "wx" }));
    });

    await new Promise<void>((resolve, reject) => {
      const input = Readable.fromWeb(request.body as unknown as NodeReadableStream);
      const abort = () => input.destroy(new Error("업로드가 취소되었습니다."));
      request.signal.addEventListener("abort", abort, { once: true });
      input.once("error", reject);
      parser.once("error", reject);
      parser.once("close", () => {
        request.signal.removeEventListener("abort", abort);
        resolve();
      });
      input.pipe(parser);
    });

    if (writePromise) await writePromise;
    if (!upload) throw new Error("업로드할 파일이 없습니다.");
    if (truncated) throw new Error("업로드 파일이 허용 크기를 초과했습니다.");
    if (tooManyFiles) throw new Error("파일은 한 번에 하나씩 업로드해 주세요.");
    return upload;
  } catch (error) {
    await unlink(/* turbopackIgnore: true */ temporaryPath).catch(() => undefined);
    throw error;
  }
}
