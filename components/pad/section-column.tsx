"use client";
/* eslint-disable react-hooks/refs */

import { useEffect, useRef, useState, type FormEvent, type KeyboardEventHandler } from "react";
import { useRouter } from "next/navigation";
import { CSS } from "@dnd-kit/utilities";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, GripHorizontal, LoaderCircle, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { PostCard } from "@/components/pad/post-card";
import { PostComposer } from "@/components/pad/post-composer";
import type { PostFieldConfig } from "@/components/pad/settings/types";
import type { PadCapabilities, SectionData } from "@/components/pad/types";
import { requestJson } from "@/lib/api-client";

export function SectionColumn({ section, capabilities, currentUserId, fieldConfig, reactionPolicy, showAuthor, showTimestamp, accentColor, index, filtering, onLoadMore }: {
  section: SectionData;
  capabilities: PadCapabilities;
  currentUserId: string | null;
  fieldConfig: PostFieldConfig;
  reactionPolicy: "SINGLE" | "MULTIPLE";
  showAuthor: boolean;
  showTimestamp: boolean;
  accentColor?: string | null;
  index: number;
  filtering: boolean;
  onLoadMore?: (sectionId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const hasMorePosts = section.posts.length < section.totalPostCount;
  const menuRef = useRef<HTMLDivElement>(null);

  // pad-more-menu.tsx와 같은 바깥 클릭 감지 패턴. 이게 없으면 메뉴를 연 채로 다른 곳을
  // 클릭해도(다른 카드, 스크롤, 다른 섹션 메뉴 열기) 계속 열려 있는 상태로 남습니다.
  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  async function loadMore() {
    if (!onLoadMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await onLoadMore(section.id);
    } finally {
      setLoadingMore(false);
    }
  }
  const canManage = capabilities.manageBoard;
  const canPost = !!currentUserId && capabilities.createPost;
  const sortable = useSortable({ id: `section:${section.id}`, data: { type: "section", sectionId: section.id }, disabled: !canManage || filtering });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  // post-card.tsx와 같은 이유로 onKeyDown만 따로 떼어 키보드 전용 그립 아이콘에 붙입니다 — 헤더
  // 전체가 포인터/터치 드래그 대상이라, 리스너를 통째로 붙이면 헤더에 포커스가 있을 때 Space가
  // "더블클릭 편집"과 무관하게 dnd-kit의 키보드 드래그 시작으로 먼저 먹힐 수 있습니다.
  const { onKeyDown: dragKeyDown, ...dragPointerListeners } = sortable.listeners ?? {};
  const dragHandleKeyDown = dragKeyDown as KeyboardEventHandler<HTMLSpanElement> | undefined;

  async function updateSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/sections/${section.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: data.get("title"), description: data.get("description") }) });
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "섹션을 수정하지 못했습니다.");
    }
    setEditing(false);
    router.refresh();
  }

  async function deleteSection() {
    if (!window.confirm(`‘${section.title}’ 섹션과 안의 게시물을 삭제할까요?`)) return;
    try {
      await requestJson(`/api/sections/${section.id}`, { method: "DELETE" });
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "섹션을 삭제하지 못했습니다.");
    }
    router.refresh();
  }

  return (
    <>
      <section id={`section-${section.id}`} ref={sortable.setNodeRef} style={style} className={`section-column column-${index % 5} ${sortable.isDragging ? "dragging" : ""}`}>
        <header className="section-header" {...sortable.attributes} {...dragPointerListeners}>
          <div onDoubleClick={() => canManage && setEditing(true)} title={canManage ? "더블클릭하면 제목·안내 문구를 바꿀 수 있어요" : undefined}>
            <h2>{section.title}</h2>
          </div>
          <span className="section-count">{section.totalPostCount}</span>
          <div className="section-header-actions">
            {canManage && !filtering && <span className="drag-handle" role="button" tabIndex={0} aria-label="섹션 순서 이동 (스페이스바로 드래그 시작)" onKeyDown={dragHandleKeyDown}><GripHorizontal size={15} /></span>}
            {canManage && <div className="section-menu-wrap" ref={menuRef}><button className="icon-button small" onClick={() => setMenuOpen((value) => !value)} aria-label="섹션 메뉴"><MoreHorizontal size={17} /></button>{menuOpen && <div className="mini-menu"><button onClick={() => { setEditing(true); setMenuOpen(false); }}><Pencil size={14} />수정</button><button className="danger-text" onClick={deleteSection}><Trash2 size={14} />삭제</button></div>}</div>}
          </div>
        </header>
        <button type="button" className="section-add-trigger" style={accentColor ? { background: accentColor } : undefined} title={canPost ? "이 섹션에 게시 추가" : currentUserId ? "읽기 전용 섹션이에요" : "로그인 후 글을 쓸 수 있어요"} onClick={() => setComposing(true)} disabled={!canPost}><Plus size={20} /></button>
        <div className="post-list">
          <SortableContext items={section.posts.map((post) => `post:${post.id}`)} strategy={verticalListSortingStrategy}>
            {section.posts.map((post) => <PostCard key={post.id} post={post} sectionId={section.id} reactionPolicy={reactionPolicy} showAuthor={showAuthor} showTimestamp={showTimestamp} capabilities={capabilities} currentUserId={currentUserId} dragDisabled={filtering || !currentUserId || (!capabilities.editAnyPost && (!capabilities.editOwnContent || post.author.id !== currentUserId))} />)}
          </SortableContext>
          {!section.posts.length && <div className="section-empty"><span><Sparkles size={20} /></span><b>아직 조용한 공간이에요</b><p>첫 번째 생각을 남겨보세요.</p></div>}
          {hasMorePosts && onLoadMore && <button type="button" className="load-more-posts" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <LoaderCircle size={14} className="spin" /> : <ChevronDown size={14} />}{loadingMore ? "불러오는 중..." : `더 보기 (${section.totalPostCount - section.posts.length})`}</button>}
        </div>
      </section>
      {composing && <PostComposer open={composing} onClose={() => setComposing(false)} sectionId={section.id} sectionTitle={section.title} fieldConfig={fieldConfig} />}
      <Modal open={editing} onClose={() => setEditing(false)} title="섹션 다듬기" description="제목과 안내 문구를 바꿀 수 있어요.">
        <form className="stack-form" onSubmit={updateSection}><label>섹션 제목<input name="title" defaultValue={section.title} required maxLength={80} /></label><label>안내 문구<textarea name="description" defaultValue={section.description ?? ""} rows={3} maxLength={240} /></label>{error && <p className="form-error">{error}</p>}<button className="button primary full">변경 내용 저장</button></form>
      </Modal>
    </>
  );
}
