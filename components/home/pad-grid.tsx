"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Archive, ChevronRight, Copy, Ellipsis, Folder, Globe2, LayoutTemplate, Link2, LockKeyhole, Plus, Star } from "lucide-react";
import { CreateBoardButton } from "@/components/home/create-board-actions";
import { PadReuseDialog } from "@/components/home/pad-reuse-dialog";
import styles from "@/components/home/pad-dashboard.module.css";
import type { DashboardBoard, DashboardFolder, TemplateBoard } from "@/lib/dashboard/types";

export const scopeLabel = { PRIVATE: "비공개", LINK: "링크", PUBLIC: "공개" } as const;

export type DashboardSort = "UPDATED_DESC" | "TITLE_ASC";

export function sortPads<T extends { title: string; updatedAt: string }>(boards: T[], sort: DashboardSort) {
  return [...boards].sort((left, right) => sort === "TITLE_ASC"
    ? left.title.localeCompare(right.title, "ko")
    : Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

// 내 패드·즐겨찾기·검색·폴더 화면이 공유하는 카드 그리드입니다. 카드에 붙는 액션(즐겨찾기,
// 폴더 담기, 복제, 템플릿 표시)이 전부 여기 모여 있어서, 화면마다 어떤 패드 목록을 넘길지만
// 정하면 됩니다.
export function PadGrid({
  boards,
  folders,
  canCreateBoard,
  withCreateTile = false,
  headingLevel = 2,
}: {
  boards: DashboardBoard[];
  folders: DashboardFolder[];
  canCreateBoard: boolean;
  withCreateTile?: boolean;
  headingLevel?: 2 | 3;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reuseBoard, setReuseBoard] = useState<TemplateBoard | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    function closeMenu(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          setOpenMenuId(null);
          setOpenFolderMenuId(null);
        }
        return;
      }
      const menu = event.target instanceof Element ? event.target.closest("[data-pad-card-menu]") : null;
      if (menu?.getAttribute("data-pad-card-menu") !== openMenuId) {
        setOpenMenuId(null);
        setOpenFolderMenuId(null);
      }
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, [openMenuId]);

  async function mutate(key: string, input: RequestInfo | URL, init: RequestInit) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(input, init);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
      router.refresh();
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function toggleFavorite(board: Pick<TemplateBoard, "id" | "isFavorite">) {
    setOpenMenuId(null);
    setOpenFolderMenuId(null);
    await mutate(`favorite-${board.id}`, `/api/boards/${board.id}/favorite`, { method: board.isFavorite ? "DELETE" : "PUT" });
  }

  async function toggleTemplate(board: DashboardBoard) {
    setOpenMenuId(null);
    setOpenFolderMenuId(null);
    await mutate(`template-${board.id}`, `/api/boards/${board.id}/template`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isTemplate: !board.isTemplate }),
    });
  }

  async function setBoardFolder(boardId: string, folderId: string, included: boolean) {
    await mutate(`folder-${folderId}-${boardId}`, "/api/dashboard", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set-board", folderId, boardId, included }),
    });
  }

  async function archiveBoard(board: DashboardBoard) {
    if (!window.confirm(`“${board.title}” 패드를 보관함으로 옮길까요?\n30일 안에는 보관된 패드에서 복구할 수 있습니다.`)) return;
    setOpenMenuId(null);
    setOpenFolderMenuId(null);
    await mutate(`archive-${board.id}`, `/api/boards/${board.id}`, { method: "DELETE" });
  }

  return (
    <>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.grid}>
        {withCreateTile && canCreateBoard && (
          <CreateBoardButton className={styles.createTile}>
            <span className={styles.createTileIcon}><Plus size={22} /></span>
            <span>새 패드 만들기</span>
          </CreateBoardButton>
        )}
        {boards.map((board) => (
          <article className={styles.card} data-menu-open={openMenuId === board.id} data-has-cover={Boolean(board.backgroundImageUrl)} key={board.id}>
            <Link href={`/b/${board.slug}`} className={styles.cardLink}>
              {board.backgroundImageUrl && (
                <div className={styles.cardCover}>
                  <img src={board.backgroundImageUrl} alt="" loading="lazy" />
                </div>
              )}
              <div className={styles.cardBody}>
                <div className={styles.cardTop}>
                  <span className={styles.badges}>
                    <span className={styles.badge}>
                      {board.discoveryScope === "PRIVATE"
                        ? <LockKeyhole size={12} aria-hidden />
                        : board.discoveryScope === "LINK"
                          ? <Link2 size={12} aria-hidden />
                          : <Globe2 size={12} aria-hidden />}
                      {scopeLabel[board.discoveryScope]}
                    </span>
                    {board.isTemplate && <span className={styles.templateBadge}><LayoutTemplate size={12} aria-hidden />템플릿</span>}
                  </span>
                  {board.isFavorite && <span className={styles.favoriteMark} aria-label="즐겨찾기"><Star size={14} fill="currentColor" aria-hidden /></span>}
                </div>
                {headingLevel === 3
                  ? <h3 className={styles.cardTitle}>{board.title}</h3>
                  : <h2 className={styles.cardTitle}>{board.title}</h2>}
                <footer className={styles.cardFooter}>
                  <span>{board.owner.name || "PyxPad"}</span>
                  <span>{board._count.sections}개 섹션 · {board._count.posts}개 글</span>
                </footer>
              </div>
            </Link>
            <div className={styles.moreMenu} data-pad-card-menu={board.id}>
              <button
                type="button"
                className={styles.moreTrigger}
                aria-label={`${board.title} 옵션`}
                aria-expanded={openMenuId === board.id}
                aria-controls={`pad-card-menu-${board.id}`}
                onClick={() => {
                  setOpenFolderMenuId(null);
                  setOpenMenuId((current) => current === board.id ? null : board.id);
                }}
              >
                <Ellipsis size={18} aria-hidden />
              </button>
              {openMenuId === board.id && (
                <div className={styles.morePanel} id={`pad-card-menu-${board.id}`} role="group" aria-label={`${board.title} 패드 옵션`}>
                  <button type="button" aria-pressed={board.isFavorite} disabled={busy === `favorite-${board.id}`} onClick={() => void toggleFavorite(board)}>
                    <Star size={15} fill={board.isFavorite ? "currentColor" : "none"} aria-hidden />
                    <span>{board.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}</span>
                  </button>
                  <div className={styles.folderMenu}>
                    <button
                      type="button"
                      className={styles.folderTrigger}
                      aria-expanded={openFolderMenuId === board.id}
                      aria-controls={`pad-card-folders-${board.id}`}
                      onClick={() => setOpenFolderMenuId((current) => current === board.id ? null : board.id)}
                    >
                      <Folder size={15} aria-hidden /><span>폴더에 담기</span><ChevronRight size={14} aria-hidden />
                    </button>
                    {openFolderMenuId === board.id && <div className={styles.folderOptions} id={`pad-card-folders-${board.id}`} role="group" aria-label={`${board.title} 폴더 선택`}>
                      {folders.length
                        ? folders.map((folder) => (
                            <label key={folder.id}>
                              <input
                                type="checkbox"
                                checked={board.folderIds.includes(folder.id)}
                                disabled={busy === `folder-${folder.id}-${board.id}`}
                                onChange={(event) => void setBoardFolder(board.id, folder.id, event.target.checked)}
                              />
                              {folder.name}
                            </label>
                          ))
                        : <small>사이드바에서 폴더를 먼저 만들어 주세요.</small>}
                    </div>}
                  </div>
                  {canCreateBoard && (
                    <button type="button" onClick={() => { setOpenMenuId(null); setReuseBoard(board); }}>
                      <Copy size={15} aria-hidden /><span>패드 복제</span>
                    </button>
                  )}
                  {board.canManageTemplate && (
                    <button type="button" aria-pressed={board.isTemplate} disabled={busy === `template-${board.id}`} onClick={() => void toggleTemplate(board)}>
                      <LayoutTemplate size={15} aria-hidden /><span>{board.isTemplate ? "템플릿 표시 해제" : "템플릿으로 표시"}</span>
                    </button>
                  )}
                  {board.relation === "OWNED" && (
                    <button type="button" className={styles.archiveAction} disabled={busy === `archive-${board.id}`} onClick={() => void archiveBoard(board)}>
                      <Archive size={15} aria-hidden /><span>보관함으로 이동</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {reuseBoard && <PadReuseDialog board={reuseBoard} onClose={() => setReuseBoard(null)} />}
    </>
  );
}
