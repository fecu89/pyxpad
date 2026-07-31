"use client";

import { Check, FileText, RotateCcw, Square, X } from "lucide-react";
import styles from "@/components/pad/attachments/upload-queue-list.module.css";
import type { AttachmentUploadItem } from "@/components/pad/attachments/types";

function formatSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.ceil(size / 1024))}KB`;
}

const statusLabel = {
  queued: "대기",
  uploading: "업로드 중",
  success: "완료",
  error: "실패",
  cancelled: "취소됨",
};

export function UploadQueueList({
  items,
  onCancel,
  onRemove,
  onRetry,
}: {
  items: AttachmentUploadItem[];
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <ul className={styles.list} aria-label={`첨부 파일 ${items.length}개`}>
      {items.map((item) => (
        <li className={styles.item} key={item.id}>
          <span className={styles.icon}>
            {item.status === "success" ? <Check className={styles.complete} size={16} /> : <FileText size={16} />}
          </span>
          <span className={styles.copy}>
            <span className={styles.nameRow}>
              <strong>{item.file.name}</strong>
              <span>{formatSize(item.file.size)} · {statusLabel[item.status]}</span>
            </span>
            {(item.status === "queued" || item.status === "uploading") && (
              <span
                className={styles.progressTrack}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.progress}
                aria-label={`${item.file.name} 업로드 진행률`}
              >
                <span className={styles.progressBar} style={{ width: `${item.progress}%` }} />
              </span>
            )}
            {item.error && <span className={styles.error}>{item.error}</span>}
          </span>
          <span className={styles.actions}>
            {item.status === "uploading" && (
              <button type="button" onClick={() => onCancel(item.id)} aria-label={`${item.file.name} 업로드 취소`}>
                <Square size={13} />
              </button>
            )}
            {(item.status === "error" || item.status === "cancelled") && (
              <button type="button" onClick={() => onRetry(item.id)} aria-label={`${item.file.name} 다시 시도`}>
                <RotateCcw size={14} />
              </button>
            )}
            {item.status !== "uploading" && (
              <button type="button" onClick={() => onRemove(item.id)} aria-label={`${item.file.name} 목록에서 제거`}>
                <X size={14} />
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
