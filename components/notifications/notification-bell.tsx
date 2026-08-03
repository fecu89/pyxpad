"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { boardPostRoutePath, boardRoutePath } from "@/lib/board/route-paths";

type NotificationDTO = {
  id: string;
  type: "POST_COMMENTED" | "REACTION_ON_POST" | "MEMBER_JOINED" | "ACCESS_REQUEST_RECEIVED" | "ACCESS_REQUEST_APPROVED" | "ACCESS_REQUEST_REJECTED" | "POST_APPROVED" | "POST_REJECTED" | "POST_PENDING_REVIEW" | "COMMENT_MENTIONED" | "TEACHER_APPROVAL_REQUESTED" | "TEACHER_APPROVAL_APPROVED" | "TEACHER_APPROVAL_REJECTED";
  readAt: string | null;
  createdAt: string;
  actor: { id: string; name: string | null } | null;
  board: { slug: string; title: string } | null;
  post: { id: string; title: string | null } | null;
  commentId: string | null;
};

function describe(item: NotificationDTO) {
  const actor = item.actor?.name || "누군가";
  const boardTitle = item.board?.title || "패드";
  const postTitle = item.post?.title ? `"${item.post.title}"` : "내 글";
  switch (item.type) {
    case "POST_COMMENTED": return `${actor}님이 ${postTitle}에 댓글을 남겼어요`;
    case "COMMENT_MENTIONED": return `${actor}님이 ${postTitle}의 댓글에서 나를 언급했어요`;
    case "REACTION_ON_POST": return `${actor}님이 ${postTitle}에 반응했어요`;
    case "MEMBER_JOINED": return `${actor}님이 ${boardTitle}에 참여했어요`;
    case "ACCESS_REQUEST_RECEIVED": return `${actor}님이 ${boardTitle} 접근을 요청했어요`;
    case "ACCESS_REQUEST_APPROVED": return `${boardTitle} 접근 요청이 승인되었어요`;
    case "ACCESS_REQUEST_REJECTED": return `${boardTitle} 접근 요청이 거절되었어요`;
    case "POST_APPROVED": return `${postTitle}이(가) 승인되었어요`;
    case "POST_REJECTED": return `${postTitle}이(가) 거절되었어요`;
    case "POST_PENDING_REVIEW": return `${boardTitle}에 승인 대기 글이 있어요`;
    case "TEACHER_APPROVAL_REQUESTED": return `${actor}님이 교사 가입 승인을 요청했어요`;
    case "TEACHER_APPROVAL_APPROVED": return "교사 가입 요청이 승인되었어요";
    case "TEACHER_APPROVAL_REJECTED": return "교사 가입 요청이 반려되었어요";
    default: return "새 알림이 있어요";
  }
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  // SSE 이벤트·읽음처리·모두읽음이 거의 동시에 load()를 부를 수 있어, 응답이 "보낸 순서"가
  // 아니라 "도착한 순서"로 반영되면 최신 알림이 온 뒤에 더 오래된 응답이 덮어쓸 수 있었습니다.
  // 요청마다 순번을 매겨 가장 최근에 보낸 요청의 응답만 반영합니다.
  const loadSeq = useRef(0);

  async function load() {
    const seq = ++loadSeq.current;
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const result = await response.json();
    if (seq !== loadSeq.current) return;
    setItems(result.notifications);
    setUnreadCount(result.unreadCount);
  }

  useEffect(() => {
    async function initialLoad() {
      await load();
    }
    void initialLoad();
    const source = new EventSource("/api/notifications/events");
    source.addEventListener("notification", () => void load());
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function openNotification(item: NotificationDTO) {
    if (!item.readAt) {
      await fetch(`/api/notifications/${item.id}`, { method: "PATCH" });
      void load();
    }
    setOpen(false);
    if (item.board) {
      const target = item.post
        ? `${boardPostRoutePath(item.board.slug, item.post.id)}${item.commentId ? `#comment-${encodeURIComponent(item.commentId)}` : ""}`
        : boardRoutePath(item.board.slug);
      router.push(target);
      router.refresh();
    } else if (item.type === "TEACHER_APPROVAL_REQUESTED") {
      router.push("/admin?tab=approvals");
      router.refresh();
    } else if (item.type === "TEACHER_APPROVAL_APPROVED") {
      router.push("/dashboard");
      router.refresh();
    } else if (item.type === "TEACHER_APPROVAL_REJECTED") {
      router.push("/onboarding");
      router.refresh();
    }
  }

  async function readAll() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    void load();
  }

  return (
    <div className="notification-bell" ref={panelRef}>
      <button type="button" className="icon-button" aria-label="알림" onClick={() => setOpen((value) => !value)}>
        <Bell size={17} />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="notification-panel" role="dialog" aria-label="알림">
          <header>
            <b>알림</b>
            {unreadCount > 0 && <button type="button" onClick={readAll}><Check size={13} />모두 읽음</button>}
          </header>
          {items.length ? (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={item.readAt ? "" : "unread"} onClick={() => openNotification(item)}>
                    <span>{describe(item)}</span>
                    <small>{relativeTime(item.createdAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notification-empty">아직 알림이 없어요.</p>
          )}
        </div>
      )}
    </div>
  );
}
