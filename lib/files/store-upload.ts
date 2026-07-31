import "server-only";

import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { AttachmentType } from "@/generated/prisma/client";
import { createStoredFilename, normalizeOriginalFilename } from "@/lib/files/filename";
import { streamMultipartFile } from "@/lib/files/multipart";
import { toStoragePath } from "@/lib/files/paths";
import { withImageProcessingSlot } from "@/lib/files/processing-queue";
import { maxUploadBytes, validateUploadedFile } from "@/lib/files/validation";

export async function storeAttachmentUpload(
  request: Request,
  directory: string,
  options: { allowedTypes?: AttachmentType[] } = {},
) {
  let incomingPath: string | null = null;
  let processingPath: string | null = null;
  let completedPath: string | null = null;
  let thumbnailProcessingPath: string | null = null;
  let thumbnailPath: string | null = null;
  try {
    const uploaded = await streamMultipartFile(request, directory, maxUploadBytes());
    incomingPath = uploaded.temporaryPath;
    const validated = await validateUploadedFile(uploaded);
    if (options.allowedTypes && !options.allowedTypes.includes(validated.attachmentType)) {
      throw new Error("이 위치에 첨부할 수 없는 파일 형식입니다.");
    }
    const { baseName, storedName } = createStoredFilename(validated.extension);
    const originalName = normalizeOriginalFilename(uploaded.originalName, validated.extension);
    completedPath = path.join(/* turbopackIgnore: true */ directory, storedName);
    let width: number | null = null;
    let height: number | null = null;

    if (validated.isImage) {
      processingPath = `${completedPath}.uploading`;
      const thumbnailDirectory = path.join(/* turbopackIgnore: true */ directory, "thumbnails");
      await mkdir(/* turbopackIgnore: true */ thumbnailDirectory, { recursive: true });
      thumbnailPath = path.join(/* turbopackIgnore: true */ thumbnailDirectory, `${baseName}.webp`);
      thumbnailProcessingPath = `${thumbnailPath}.uploading`;
      const output = await withImageProcessingSlot(async () => {
        const converted = await sharp(incomingPath!, { failOn: "error", limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 })
          .toFile(processingPath!);
        await sharp(processingPath!, { failOn: "error" })
          .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 76, effort: 3 })
          .toFile(thumbnailProcessingPath!);
        return converted;
      });
      width = output.width;
      height = output.height;
      await rename(/* turbopackIgnore: true */ processingPath, completedPath);
      processingPath = null;
      await rename(/* turbopackIgnore: true */ thumbnailProcessingPath, thumbnailPath);
      thumbnailProcessingPath = null;
      await unlink(/* turbopackIgnore: true */ incomingPath);
      incomingPath = null;
    } else {
      await rename(/* turbopackIgnore: true */ incomingPath, completedPath);
      incomingPath = null;
    }

    const fileInfo = await stat(/* turbopackIgnore: true */ completedPath);
    const storedPath = completedPath;
    const storedThumbnailPath = thumbnailPath;
    completedPath = null;
    thumbnailPath = null;
    return {
      data: {
        type: validated.attachmentType,
        originalName,
        storedName,
        storagePath: toStoragePath(storedPath),
        thumbnailPath: storedThumbnailPath ? toStoragePath(storedThumbnailPath) : null,
        mimeType: validated.mimeType,
        fileSize: fileInfo.size,
        width,
        height,
      },
      async cleanup() {
        await unlink(/* turbopackIgnore: true */ storedPath).catch(() => undefined);
        if (storedThumbnailPath) await unlink(/* turbopackIgnore: true */ storedThumbnailPath).catch(() => undefined);
      },
    };
  } catch (error) {
    if (incomingPath) await unlink(/* turbopackIgnore: true */ incomingPath).catch(() => undefined);
    if (processingPath) await unlink(/* turbopackIgnore: true */ processingPath).catch(() => undefined);
    if (completedPath) await unlink(/* turbopackIgnore: true */ completedPath).catch(() => undefined);
    if (thumbnailProcessingPath) await unlink(/* turbopackIgnore: true */ thumbnailProcessingPath).catch(() => undefined);
    if (thumbnailPath) await unlink(/* turbopackIgnore: true */ thumbnailPath).catch(() => undefined);
    throw error;
  }
}
