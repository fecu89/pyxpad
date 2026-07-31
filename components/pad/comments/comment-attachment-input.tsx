"use client";

import { useState, type ChangeEvent } from "react";
import { FileAudio, Image as ImageIcon, Paperclip, Trash2 } from "lucide-react";
import styles from "@/components/pad/comments/threaded-comments.module.css";
import { fileKey } from "@/components/pad/attachments/file-rules";

const maximumAttachmentCount = 4;
const maximumImageBytes = 10 * 1024 * 1024;
const maximumAudioBytes = 20 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const allowedAudioTypes = new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm"]);

function formatSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.ceil(size / 1024))}KB`;
}

export function CommentAttachmentInput({
  files,
  disabled = false,
  onChange,
}: {
  files: File[];
  disabled?: boolean;
  onChange: (files: File[]) => void;
}) {
  const [error, setError] = useState("");

  function appendFiles(incoming: File[]) {
    const next = [...files];
    const known = new Set(files.map(fileKey));
    const rejected: string[] = [];
    for (const file of incoming) {
      if (next.length >= maximumAttachmentCount) {
        rejected.push(`댓글에는 첨부를 ${maximumAttachmentCount}개까지만 추가할 수 있습니다.`);
        break;
      }
      const isImage = allowedImageTypes.has(file.type);
      const isAudio = allowedAudioTypes.has(file.type);
      if (!isImage && !isAudio) {
        rejected.push(`${file.name || "파일"}: 이미지 또는 음성 파일만 첨부할 수 있습니다.`);
        continue;
      }
      const maximumBytes = isImage ? maximumImageBytes : maximumAudioBytes;
      if (file.size <= 0 || file.size > maximumBytes) {
        rejected.push(`${file.name || "파일"}: ${maximumBytes / 1024 / 1024}MB 이하 파일만 첨부할 수 있습니다.`);
        continue;
      }
      const key = fileKey(file);
      if (known.has(key)) continue;
      known.add(key);
      next.push(file);
    }
    onChange(next);
    setError(Array.from(new Set(rejected)).join(" "));
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    appendFiles(Array.from(event.target.files ?? []));
    event.currentTarget.value = "";
  }

  function removeFile(target: File) {
    onChange(files.filter((file) => file !== target));
    setError("");
  }

  return (
    <div className={styles.attachmentInput}>
      <div className={styles.attachmentTools}>
        <label className={styles.attachmentButton} aria-disabled={disabled}>
          <Paperclip size={13} /> 이미지·음성
          <input
            className={styles.fileInput}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif,.mp3,.m4a,.wav,.ogg,.webm"
            multiple
            disabled={disabled}
            onChange={selectFiles}
          />
        </label>
      </div>
      {files.length > 0 && (
        <ul className={styles.pendingAttachments} aria-label={`댓글 첨부 ${files.length}개`}>
          {files.map((file) => (
            <li key={fileKey(file)}>
              {file.type.startsWith("image/") ? <ImageIcon size={14} /> : <FileAudio size={14} />}
              <span><strong>{file.name}</strong><small>{formatSize(file.size)}</small></span>
              <button type="button" disabled={disabled} onClick={() => removeFile(file)} aria-label={`${file.name} 첨부 제거`}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className={styles.attachmentError} role="alert">{error}</p>}
    </div>
  );
}
