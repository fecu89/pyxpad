"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, LoaderCircle, MessageCircle, Pencil, Pin, Trash2 } from "lucide-react";
import { AttachmentViewer } from "@/components/pad/attachments/attachment-viewer";
import type { AttachmentMetadataInput, AttachmentViewData } from "@/components/pad/attachments/types";
import { ThreadedComments } from "@/components/pad/comments/threaded-comments";
import type { CommentMentionCandidate, ThreadCommentData } from "@/components/pad/comments/types";
import { PostComposer } from "@/components/pad/post-composer";
import { ReactionBar } from "@/components/pad/reactions/reaction-bar";
import { PostCustomFieldsDisplay } from "@/components/pad/settings/post-custom-fields-display";
import type { PostFieldValues } from "@/components/pad/settings/types";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PostBody } from "@/components/pad/post-body";
import type { PadCapabilities, PadData, PostData, ReactionKey, SectionData } from "@/components/pad/types";
import { boardRoutePath } from "@/lib/board/route-paths";
import type { ReactionCounts } from "@/lib/reactions/types";
import { requestJson } from "@/lib/api-client";

function readCustomValues(post: PostData): PostFieldValues {
  if (!post.customFieldValues) return {};
  return Object.fromEntries(Object.entries(post.customFieldValues.fields).map(([id, stored]) => [id, stored.value]));
}

type PostPageStyle = CSSProperties & { "--post-accent"?: string };

const safeColorPattern = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

export function PostDetailPage({
  board,
  section,
  post,
  capabilities,
  currentUserId,
}: {
  board: PadData;
  section: SectionData;
  post: PostData;
  capabilities: PadCapabilities;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const boardHref = boardRoutePath(board.slug);
  const canEdit = Boolean(currentUserId && (capabilities.editAnyPost || (capabilities.editOwnContent && currentUserId === post.author.id)));
  const mentionCandidates = useMemo<CommentMentionCandidate[]>(() => {
    const candidates = new Map<string, CommentMentionCandidate>();
    if (board.owner.name) candidates.set(board.owner.id, { id: board.owner.id, name: board.owner.name });
    for (const member of board.members) {
      if (member.user.name) candidates.set(member.user.id, { id: member.user.id, name: member.user.name });
    }
    return Array.from(candidates.values());
  }, [board.members, board.owner.id, board.owner.name]);
  const pageStyle: PostPageStyle = safeColorPattern.test(board.accentColor ?? "")
    ? { "--post-accent": board.accentColor! }
    : {};
  const [editing, setEditing] = useState(false);
  const [comments, setComments] = useState<ThreadCommentData[]>([]);
  const [attachments, setAttachments] = useState<AttachmentViewData[]>(post.attachments);
  const [loading, setLoading] = useState(false);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [movePending, setMovePending] = useState(false);

  // 댓글은 대댓글 깊이와 무관하게 최신 20개를 한 흐름으로 불러옵니다. 새 댓글을 올린 뒤 첨부파일이
  // 붙은 최신 상태를 반영하려고 첫 페이지를 다시 불러오며, 이전 페이지는 필요할 때 다시 펼칩니다.
  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson<{ comments: ThreadCommentData[]; hasMore: boolean; nextCursor: string | null }>(`/api/posts/${post.id}/comments`);
      setComments(result.comments);
      setHasMoreComments(result.hasMore);
      setCommentsCursor(result.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [post.id]);

  const loadMoreComments = useCallback(async () => {
    if (!commentsCursor || loadingMoreComments) return;
    setLoadingMoreComments(true);
    try {
      const result = await requestJson<{ comments: ThreadCommentData[]; hasMore: boolean; nextCursor: string | null }>(`/api/posts/${post.id}/comments?cursor=${encodeURIComponent(commentsCursor)}`);
      setComments((current) => [...result.comments, ...current]);
      setHasMoreComments(result.hasMore);
      setCommentsCursor(result.nextCursor);
    } finally {
      setLoadingMoreComments(false);
    }
  }, [commentsCursor, loadingMoreComments, post.id]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setAttachments(post.attachments);
      setError("");
      void loadComments().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "댓글을 불러오지 못했습니다."); });
    });
    return () => { active = false; };
  }, [loadComments, post.attachments]);

  async function createComment(body: string, parentId: string | null, files: File[], mentionedUserIds: string[]) {
    const result = await requestJson<{ comment: ThreadCommentData }>(`/api/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parentId, mentionedUserIds }),
    });
    setComments((current) => [...current, result.comment]);
    const failed: string[] = [];
    for (const file of files) {
      const payload = new FormData();
      payload.append("file", file);
      const upload = await fetch(`/api/comments/${result.comment.id}/attachments`, { method: "POST", body: payload });
      if (!upload.ok) failed.push(file.name);
    }
    await loadComments();
    if (failed.length) throw new Error(`댓글은 저장됐지만 다음 파일은 올리지 못했습니다: ${failed.join(", ")}`);
  }

  async function updateComment(commentId: string, body: string, mentionedUserIds: string[]) {
    const result = await requestJson<{ comment: Partial<ThreadCommentData> }>(`/api/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, mentionedUserIds }),
    });
    setComments((current) => current.map((comment) => comment.id === commentId ? { ...comment, ...result.comment } : comment));
  }

  async function deleteComment(commentId: string) {
    await requestJson(`/api/comments/${commentId}`, { method: "DELETE" });
    setComments((current) => current.filter((comment) => comment.id !== commentId));
  }

  async function deletePost() {
    if (!window.confirm("이 게시물을 삭제할까요? 첨부파일과 댓글도 패드에서 사라집니다.")) return;
    try {
      await requestJson(`/api/posts/${post.id}`, { method: "DELETE" });
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "게시물을 삭제하지 못했습니다.");
    }
    router.replace(boardHref);
    router.refresh();
  }

  async function deleteAttachment(attachment: AttachmentViewData) {
    if (!window.confirm("이 파일을 삭제할까요?")) return;
    await requestJson(`/api/attachments/${attachment.id}`, { method: "DELETE" });
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    router.refresh();
  }

  async function updateAttachmentMetadata(attachmentId: string, value: AttachmentMetadataInput) {
    const result = await requestJson<{ attachment: Partial<AttachmentViewData> }>(`/api/attachments/${attachmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    setAttachments((current) => current.map((item) => item.id === attachmentId ? { ...item, ...result.attachment } : item));
    router.refresh();
  }

  // 위/아래 버튼을 빠르게 연타하면 같은 stale attachments 배열을 기준으로 두 요청이 겹쳐 나가
  // 나중에 도착한 응답이 앞선 이동을 덮어쓸 수 있었습니다. 요청이 끝날 때까지 버튼을 막습니다.
  async function moveAttachment(attachmentId: string, direction: "up" | "down") {
    if (movePending) return;
    const previous = attachments;
    const index = previous.findIndex((item) => item.id === attachmentId);
    const target = index + (direction === "up" ? -1 : 1);
    if (index < 0 || target < 0 || target >= previous.length) return;
    const next = [...previous];
    [next[index], next[target]] = [next[target], next[index]];
    setAttachments(next);
    setMovePending(true);
    try {
      await requestJson(`/api/posts/${post.id}/attachments/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachmentIds: next.map((item) => item.id) }) });
    } catch (reason) {
      setAttachments(previous);
      setError(reason instanceof Error ? reason.message : "첨부 순서를 바꾸지 못했습니다.");
    } finally {
      setMovePending(false);
    }
  }

  async function toggleReaction(key: ReactionKey, active: boolean): Promise<ReactionCounts> {
    const result = await requestJson<{ reactionCounts: ReactionCounts }>(`/api/posts/${post.id}/reactions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, active }) });
    return result.reactionCounts;
  }

  return (
    <main className="post-page" data-font={board.font} style={pageStyle}>
      <header className="post-page-nav">
        <Link href={boardHref} className="post-page-back" aria-label="패드로 돌아가기"><ArrowLeft size={18} /><span>패드로 돌아가기</span></Link>
        <Link href="/" className="post-page-brand" aria-label="PyxPad 홈"><Logo size={23} /><b>pyxpad</b></Link>
        <ThemeToggle />
      </header>

      <div className="post-page-shell">
        <nav className="post-page-breadcrumb" aria-label="현재 위치">
          <Link href={boardHref}>{board.title}</Link>
          <ChevronRight size={14} aria-hidden />
          <span>{section.title}</span>
        </nav>

        <div className="post-page-layout">
          <article className="post-page-article">
            <header className="post-page-heading">
              <div className="post-page-labels">
                <span className="post-section-label">{section.title}</span>
                {post.isPinned && <span className="pinned-label"><Pin size={12} />상단 고정</span>}
                {post.status !== "PUBLISHED" && <span className={`post-page-status ${post.status.toLowerCase()}`}>{post.status === "PENDING" ? "승인 대기" : "게시 거절"}</span>}
              </div>
              <h1>{post.title || "제목 없는 생각"}</h1>
              <div className="post-page-author">
                <Avatar name={post.author.name} image={post.author.image} size="medium" />
                <span><b>{post.author.name || "익명의 친구"}</b><time dateTime={post.createdAt}>{new Intl.DateTimeFormat("ko", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(post.createdAt))}</time></span>
              </div>
            </header>

            <div className="post-page-body">
              <PostBody body={post.body || "내용이 아직 없어요."} />
              <PostCustomFieldsDisplay config={board.postFieldConfig} values={readCustomValues(post)} />
              {attachments.length > 0 && <AttachmentViewer attachments={attachments} canDownload={capabilities.downloadAttachments} canEdit={canEdit} movePending={movePending} onDelete={deleteAttachment} onMove={moveAttachment} onUpdateMetadata={updateAttachmentMetadata} />}
              <ReactionBar counts={post.reactionCounts} viewerReactions={post.viewerReactions} policy={board.reactionPolicy} canReact={capabilities.react} onToggle={toggleReaction} />
              <div className="detail-stats"><span><MessageCircle size={16} /> 댓글 {Math.max(post.commentCount, comments.length)}</span></div>
              {canEdit && <div className="detail-owner-actions"><button type="button" className="button soft" onClick={() => setEditing(true)}><Pencil size={15} />수정</button><button type="button" className="button danger" onClick={deletePost}><Trash2 size={15} />삭제</button></div>}
            </div>
          </article>

          <aside className="comments-panel post-page-comments">
            <header><MessageCircle size={18} /><b>함께 나눈 이야기</b><span>{comments.length}</span></header>
            <div className="comments-scroll">
              {loading && !comments.length ? <div className="comments-empty"><LoaderCircle className="spin" />댓글을 불러오는 중</div> : <ThreadedComments comments={comments} currentUserId={currentUserId} canComment={capabilities.comment} canEditOwn={capabilities.editOwnContent} canModerate={capabilities.moderateComments} mentionCandidates={mentionCandidates} hasMore={hasMoreComments} loadingMore={loadingMoreComments} onLoadMore={loadMoreComments} onCreate={createComment} onUpdate={updateComment} onDelete={deleteComment} />}
              {error && <p className="form-error compact" role="alert">{error}</p>}
            </div>
          </aside>
        </div>
      </div>

      {editing && <PostComposer open={editing} onClose={() => setEditing(false)} sectionId={section.id} sectionTitle={section.title} fieldConfig={board.postFieldConfig} post={post} />}
    </main>
  );
}
