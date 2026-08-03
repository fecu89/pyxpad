"use client";

import { useCallback, useId, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import { Camera, FileText, Film, Image as ImageIcon, Link2, LoaderCircle, Mic, Paperclip, SlidersHorizontal, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { attachmentAccept, prepareAttachmentFiles } from "@/components/pad/attachments/file-rules";
import { MediaCapture } from "@/components/pad/attachments/media-capture";
import { UploadQueueList } from "@/components/pad/attachments/upload-queue-list";
import { useAttachmentUploadQueue } from "@/components/pad/attachments/use-attachment-upload-queue";
import { DraftRecovery } from "@/components/pad/composer/draft-status";
import { LinkPreviewInput } from "@/components/pad/composer/link-preview-input";
import { usePostDraft } from "@/components/pad/composer/use-post-draft";
import { PostCustomFieldsInput } from "@/components/pad/settings/post-custom-fields-input";
import type { PostFieldConfig, PostFieldValues } from "@/components/pad/settings/types";
import { Modal } from "@/components/ui/modal";
import type { PostData } from "@/components/pad/types";
import type { LinkPreview } from "@/lib/link-preview/types";

function initialCustomValues(post?: PostData): PostFieldValues {
  if (!post?.customFieldValues) return {};
  return Object.fromEntries(Object.entries(post.customFieldValues.fields).map(([id, stored]) => [id, stored.value]));
}

function linkHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function PostComposer({ open, onClose, sectionId, sectionTitle, fieldConfig, post }: {
  open: boolean;
  onClose: () => void;
  sectionId: string;
  sectionTitle: string;
  fieldConfig: PostFieldConfig;
  post?: PostData;
}) {
  const router = useRouter();
  const formId = useId();
  const queue = useAttachmentUploadQueue({ concurrency: 3 });
  const draft = usePostDraft({
    scope: post ? `post:${post.id}` : `section:${sectionId}:new`,
    initialTitle: post?.title ?? "",
    initialBody: post?.body ?? "",
    enabled: open,
  });
  const [customValues, setCustomValues] = useState<PostFieldValues>(() => initialCustomValues(post));
  const [links, setLinks] = useState<LinkPreview[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [savedTarget, setSavedTarget] = useState<{ id: string; version: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeComposer = useCallback(() => {
    queue.reset();
    setLinks([]);
    setCaptureOpen(false);
    setLinkOpen(false);
    setMoreToolsOpen(false);
    setError("");
    setFileError("");
    setDragging(false);
    setSavedTarget(null);
    setCustomValues(initialCustomValues(post));
    onClose();
  }, [onClose, post, queue]);

  function addFiles(incoming: File[]) {
    const prepared = prepareAttachmentFiles(incoming, queue.items.map((item) => item.file));
    if (prepared.accepted.length) queue.addFiles(prepared.accepted);
    setFileError(prepared.rejected.join(" "));
  }

  function handlePaste(event: ClipboardEvent<HTMLFormElement>) {
    const pasted = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (pasted.length) addFiles(pasted);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function openFilePicker(accept = attachmentAccept) {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = accept;
    input.click();
  }

  function toggleCapture() {
    setCaptureOpen((current) => !current);
    setLinkOpen(false);
    setMoreToolsOpen(false);
  }

  function toggleLinks() {
    setLinkOpen((current) => !current);
    setCaptureOpen(false);
    setMoreToolsOpen(false);
  }

  function toggleMoreTools() {
    setMoreToolsOpen((current) => !current);
    setCaptureOpen(false);
    setLinkOpen(false);
  }

  function closeToolPanels() {
    setCaptureOpen(false);
    setLinkOpen(false);
    setMoreToolsOpen(false);
  }

  function addLinks(previews: LinkPreview[]) {
    setLinks((current) => {
      const urls = new Set(current.map((item) => item.url));
      return [...current, ...previews.filter((preview) => {
        if (urls.has(preview.url)) return false;
        urls.add(preview.url);
        return true;
      })];
    });
  }

  async function saveLink(postId: string, preview: LinkPreview) {
    const response = await fetch(`/api/posts/${postId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: preview.url,
        title: preview.title,
        description: preview.description ?? "",
        previewImageUrl: preview.image,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "링크를 첨부하지 못했습니다.");
    return result;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const pendingAttachmentCount = post?.attachments.length ?? 0;
    const totalPlannedAttachments = pendingAttachmentCount + queue.items.filter((item) => item.status !== "cancelled").length + links.length;
    if (totalPlannedAttachments > 20) {
      setError("게시물에는 파일과 링크를 합쳐 최대 20개까지 첨부할 수 있습니다.");
      return;
    }
    if (fieldConfig.attachment.visible && fieldConfig.attachment.required && totalPlannedAttachments < 1) {
      setError("첨부 파일 또는 링크를 하나 이상 추가해 주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const target = savedTarget ?? (post ? { id: post.id, version: post.version } : null);
      const response = await fetch(target ? `/api/posts/${target.id}` : `/api/sections/${sectionId}/posts`, {
        method: target ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.value.title,
          body: draft.value.body,
          fieldConfigVersion: fieldConfig.version,
          customFieldValues: customValues,
          ...(target ? { version: target.version, isPinned: formData.get("isPinned") === "on" } : {}),
        }),
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || "글을 저장하지 못했습니다.");
      const postId = target?.id ?? saved.post.id;
      let version = saved.post.version as number;
      setSavedTarget({ id: postId, version });

      const uploadResult = await queue.start(postId);
      const failedLinks: LinkPreview[] = [];
      let savedLinkCount = 0;
      for (const preview of links) {
        try {
          await saveLink(postId, preview);
          savedLinkCount += 1;
        } catch {
          failedLinks.push(preview);
        }
      }
      setLinks(failedLinks);
      const failedNames = uploadResult.failed.map((item) => item.file.name);
      if (failedNames.length || failedLinks.length) {
        throw new Error(`글은 저장됐지만 일부 첨부에 실패했습니다. 아래 항목을 재시도해 주세요.${failedNames.length ? ` 파일: ${failedNames.join(", ")}` : ""}${failedLinks.length ? ` 링크: ${failedLinks.map((item) => item.title).join(", ")}` : ""}`);
      }

      const finalizedCount = pendingAttachmentCount + uploadResult.successful.length + queue.items.filter((item) => item.status === "success").length + savedLinkCount;
      const finalResponse = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, attachmentCount: finalizedCount }),
      });
      const finalized = await finalResponse.json();
      if (!finalResponse.ok) throw new Error(finalized.error || "첨부 필수 조건을 확인하지 못했습니다.");
      version = finalized.post.version;
      setSavedTarget({ id: postId, version });
      draft.markSaved();
      closeComposer();
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "글을 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const queuedFileCount = queue.items.filter((item) => item.status !== "cancelled").length;
  const remainingLinkSlots = Math.max(0, 20 - (post?.attachments.length ?? 0) - queuedFileCount - links.length);
  const selectedLinkUrls = [
    ...(post?.attachments.flatMap((attachment) => attachment.type === "LINK" && attachment.externalUrl ? [attachment.externalUrl] : []) ?? []),
    ...links.map((link) => link.url),
  ];
  const submitLabel = submitting ? (post ? "수정 중" : "게시 중") : savedTarget ? "다시 게시하기" : post ? "수정하기" : "게시하기";

  return (
    <Modal
      open={open}
      onClose={closeComposer}
      title={post ? `${sectionTitle} 게시물 수정` : `${sectionTitle}에 게시물 작성`}
      className="composer-modal"
      variant="composer"
      headerAction={<button type="submit" form={formId} className="button primary composer-header-submit" disabled={submitting || queue.isUploading}>{submitting && <LoaderCircle className="spin" size={16} />}{submitLabel}</button>}
    >
      <form id={formId} className="composer-form" onSubmit={submit} onPaste={handlePaste}>
        <div className="composer-editor-scroll" onPointerDown={closeToolPanels} onFocusCapture={closeToolPanels}>
          {draft.availableDraft && <DraftRecovery savedAt={draft.availableDraft.savedAt} onRestore={draft.restoreDraft} onDiscard={draft.discardDraft} />}
          {fieldConfig.title.visible && <label className="composer-title-field">제목 {fieldConfig.title.required ? <span>필수</span> : <span>선택</span>}<input value={draft.value.title} onChange={(event) => draft.setValue((current) => ({ ...current, title: event.target.value }))} placeholder={fieldConfig.title.placeholder} maxLength={200} required={fieldConfig.title.required} autoFocus /></label>}
          {fieldConfig.body.visible && <label className="composer-body-field">내용<textarea value={draft.value.body} onChange={(event) => draft.setValue((current) => ({ ...current, body: event.target.value }))} placeholder={fieldConfig.body.placeholder} rows={12} maxLength={20000} required={fieldConfig.body.required} /></label>}
          <PostCustomFieldsInput config={fieldConfig} values={customValues} onChange={setCustomValues} />
          {post && <label className="check-label"><input type="checkbox" name="isPinned" defaultChecked={post.isPinned} /> 섹션 위에 고정하기</label>}
          {fieldConfig.attachment.visible && <>
          <UploadQueueList items={queue.items} onCancel={queue.cancel} onRemove={queue.remove} onRetry={(id) => { const targetId = savedTarget?.id ?? post?.id; if (targetId) void queue.retry(targetId, id); }} />
            {links.length > 0 && (
              <section className="composer-links composer-selected-links"><header><span><Link2 size={15} /><b>추가할 링크</b></span><small>{links.length}개</small></header><ul aria-label="추가할 링크">{links.map((link) => <li key={link.url}><span className="composer-link-icon"><Link2 size={14} /></span><span className="composer-link-copy"><b>{link.title}</b><small>{link.siteName || linkHostname(link.url)}</small></span><button type="button" onClick={() => setLinks((current) => current.filter((item) => item.url !== link.url))} aria-label={`${link.title} 링크 제거`}><X size={13} /></button></li>)}</ul></section>
            )}
          </>}
          {fileError && <p className="form-error" role="alert">{fileError}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        {fieldConfig.attachment.visible && (captureOpen || linkOpen || moreToolsOpen) && <section className="composer-tool-panel" aria-label="첨부 도구 옵션">
          {captureOpen && <MediaCapture onCapture={(file) => addFiles([file])} onClose={() => setCaptureOpen(false)} />}
          {linkOpen && <section className="composer-links"><header><span><Link2 size={15} /><b>링크 첨부</b></span><small>{links.length ? `${links.length}개 추가 대기` : "여러 개를 한 번에"}</small></header><LinkPreviewInput selectedUrls={selectedLinkUrls} remainingSlots={remainingLinkSlots} onSelect={addLinks} /></section>}
          {moreToolsOpen && <div className="composer-more-tools"><button type="button" onClick={() => openFilePicker(".mp3,.m4a,.wav,.ogg")}><Mic size={20} /><span><b>음성 파일</b><small>MP3, M4A, WAV, OGG</small></span></button><button type="button" onClick={() => openFilePicker(".mp4,.webm,.mov")}><Film size={20} /><span><b>영상 파일</b><small>MP4, WebM, MOV</small></span></button><button type="button" onClick={() => openFilePicker(".pdf,.docx,.pptx,.xlsx,.txt,.zip,.hwp,.hwpx")}><FileText size={20} /><span><b>문서 파일</b><small>PDF, Office, HWP, ZIP</small></span></button><div className={`composer-drop-target ${dragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={handleDrop}><Paperclip size={18} /><span><b>{dragging ? "여기에 놓으세요" : "파일 끌어놓기"}</b><small>첨부 파일은 최대 30MB</small></span></div></div>}
        </section>}

        {fieldConfig.attachment.visible && <input ref={fileInputRef} type="file" multiple accept={attachmentAccept} className="composer-hidden-file" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />}
        <div className="composer-bottom">
          {fieldConfig.attachment.visible && <div className="composer-tool-dock" role="toolbar" aria-label="게시물 첨부 도구"><button type="button" onClick={() => openFilePicker()}><Upload size={21} /><span>파일</span></button><button type="button" onClick={() => openFilePicker(".jpg,.jpeg,.png,.webp,.gif")}><ImageIcon size={21} /><span>이미지</span></button><button type="button" data-active={captureOpen} aria-pressed={captureOpen} onClick={toggleCapture}><Camera size={21} /><span>촬영</span></button><button type="button" data-active={linkOpen} aria-pressed={linkOpen} onClick={toggleLinks}><Link2 size={21} /><span>링크</span></button><button type="button" data-active={moreToolsOpen} aria-pressed={moreToolsOpen} onClick={toggleMoreTools}><SlidersHorizontal size={21} /><span>모든 도구</span></button></div>}
        </div>
      </form>
    </Modal>
  );
}
