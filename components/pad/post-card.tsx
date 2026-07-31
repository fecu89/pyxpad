"use client";
/* eslint-disable react-hooks/refs */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, type KeyboardEventHandler } from "react";
import { useParams, useRouter } from "next/navigation";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Clock3, FileText, GripVertical, MessageCircle, Paperclip, Pin, Play, XCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ReactionBar } from "@/components/pad/reactions/reaction-bar";
import type { PadCapabilities, PostData, ReactionKey } from "@/components/pad/types";
import { boardPostRoutePath } from "@/lib/board/route-paths";
import { getLinkCardThumbnail, getLinkSourceHost } from "@/lib/link-preview/link-card";
import type { ReactionCounts } from "@/lib/reactions/types";

function excerpt(body: string) {
  return body.replace(/[#*_>`\-[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 132);
}

function findPostCover(post: Pick<PostData, "attachments">) {
  for (const attachment of post.attachments) {
    if (attachment.type === "IMAGE") {
      return {
        src: `/files/${attachment.id}?variant=thumbnail`,
        alt: attachment.altText || attachment.originalName,
        link: false,
        video: false,
        title: null,
        host: null,
      };
    }
    if (attachment.type === "LINK") {
      const thumbnail = getLinkCardThumbnail(attachment.externalUrl, attachment.previewImageUrl);
      if (thumbnail) {
        return {
          src: thumbnail.src,
          alt: "",
          link: true,
          video: thumbnail.isYouTube,
          title: attachment.originalName,
          host: getLinkSourceHost(attachment.externalUrl),
        };
      }
    }
  }
  return null;
}

export function PostCard({
  post,
  sectionId,
  reactionPolicy,
  capabilities,
  currentUserId,
  dragDisabled,
  showAuthor,
  showTimestamp,
}: {
  post: PostData;
  sectionId: string;
  reactionPolicy: "SINGLE" | "MULTIPLE";
  capabilities: PadCapabilities;
  currentUserId: string | null;
  dragDisabled: boolean;
  showAuthor: boolean;
  showTimestamp: boolean;
}) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const postHref = boardPostRoutePath(slug, post.id);
  const sortable = useSortable({ id: `post:${post.id}`, data: { type: "post", postId: post.id, sectionId }, disabled: dragDisabled });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  // 카드 전체가 눌러서-끌기(mouse/touch) 대상이라 sortable.listeners를 article에 통째로 스프레드하면
  // 카드에 포커스가 있을 때 Enter/Space가 "글 열기"와 dnd-kit의 "키보드 드래그 시작"으로 충돌합니다.
  // onKeyDown만 따로 떼어 아래의 전용 그립 아이콘(키보드 포커스 전용)에 붙여 분리합니다.
  const { onKeyDown: dragKeyDown, ...dragPointerListeners } = sortable.listeners ?? {};
  const dragHandleKeyDown = dragKeyDown as KeyboardEventHandler<HTMLSpanElement> | undefined;
  // 드래그가 끝나자마자 뒤따라오는 click 이벤트가 그대로 카드 열기로 이어지는 걸 막습니다
  // (long-press로 순서를 바꾼 직후 게시물이 툭 열려버리는 문제 방지).
  const wasDraggingRef = useRef(false);
  useEffect(() => {
    if (sortable.isDragging) wasDraggingRef.current = true;
  }, [sortable.isDragging]);
  const isOwnPost = Boolean(currentUserId && currentUserId === post.author.id);
  const cover = findPostCover(post);

  async function toggleReaction(key: ReactionKey, active: boolean): Promise<ReactionCounts> {
    const response = await fetch(`/api/posts/${post.id}/reactions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, active }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "반응을 저장하지 못했습니다.");
    return result.reactionCounts;
  }

  return (
    <article
      ref={sortable.setNodeRef}
      style={style}
      className={`post-card ${sortable.isDragging ? "dragging" : ""}`}
      {...sortable.attributes}
      {...dragPointerListeners}
      aria-disabled={undefined}
      aria-label={`게시물 열기: ${post.title || "제목 없는 생각"}`}
      onClick={(event) => {
        if (wasDraggingRef.current) { wasDraggingRef.current = false; return; }
        if (!(event.target as HTMLElement).closest("button, a, input, textarea, select")) router.push(postHref);
      }}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); router.push(postHref); } }}
    >
      <div className="post-card-meta">{showAuthor && <><Avatar name={post.author.name} image={post.author.image} /><span>{post.author.name || "이름 없는 친구"}</span></>}{post.isPinned && <span className="pin"><Pin size={12} />고정</span>}{isOwnPost && post.status === "PENDING" && <span className="post-status pending" title="관리자 승인을 기다리고 있어요."><Clock3 size={12} />승인 대기</span>}{isOwnPost && post.status === "REJECTED" && <span className="post-status rejected" title={post.moderationReason ? `거절 사유: ${post.moderationReason}` : "거절됨"}><XCircle size={12} />거절됨</span>}{!isOwnPost && capabilities.moderatePosts && post.status === "PENDING" && <span className="post-status review-needed" title="승인이 필요한 글이에요."><Clock3 size={12} />검토 필요</span>}{!dragDisabled && <span className="drag-handle" role="button" tabIndex={0} aria-label="게시물 순서 이동 (스페이스바로 드래그 시작)" onKeyDown={dragHandleKeyDown}><GripVertical size={16} /></span>}</div>
      {cover && (
        <div className={`post-cover-frame ${cover.link ? "link" : ""} ${cover.video ? "video" : ""}`}>
          <img className="post-cover" src={cover.src} alt={cover.alt} loading="lazy" referrerPolicy={cover.link ? "no-referrer" : undefined} draggable={false} />
          {cover.video && <span className="post-cover-play" aria-hidden><Play size={20} fill="currentColor" /></span>}
          {cover.link && (
            <span className="post-cover-origin" aria-hidden>
              <strong>{cover.title}</strong>
              {cover.host && <small>{cover.host}</small>}
            </span>
          )}
        </div>
      )}
      <div className="post-card-copy">{post.title && <h3>{post.title}</h3>}{post.body && <p>{excerpt(post.body)}</p>}</div>
      {post.attachments.length > 0 && <div className="post-files"><span>{post.attachments.some((item) => item.type === "IMAGE") ? <Paperclip size={14} /> : <FileText size={14} />}{post.attachments.length}개 첨부</span></div>}
      <footer><ReactionBar counts={post.reactionCounts} viewerReactions={post.viewerReactions} policy={reactionPolicy} canReact={capabilities.react} onToggle={toggleReaction} /><span><MessageCircle size={16} />{post.commentCount || "댓글"}</span>{showTimestamp && <time dateTime={post.createdAt}>{new Intl.DateTimeFormat("ko", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(post.createdAt))}</time>}</footer>
    </article>
  );
}
