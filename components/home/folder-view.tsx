"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Pencil, SortAsc, Trash2 } from "lucide-react";
import { PadGrid, sortPads, type DashboardSort } from "@/components/home/pad-grid";
import styles from "@/components/home/pad-dashboard.module.css";
import type { DashboardBoard, DashboardFolder } from "@/lib/dashboard/types";

// 폴더 칩 줄이 사이드바로 옮겨가면서, 폴더 하나하나가 이 화면(/folders/[folderId])을 갖습니다.
// 이름 변경·삭제도 여기서 합니다(예전에는 대시보드 본문의 칩에 붙어 있었습니다).
export function FolderView({
  folder,
  folders,
  boards,
  canCreateBoard,
}: {
  folder: DashboardFolder;
  folders: DashboardFolder[];
  boards: DashboardBoard[];
  canCreateBoard: boolean;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<DashboardSort>("UPDATED_DESC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folderBoards = useMemo(
    () => sortPads(boards.filter((board) => board.folderIds.includes(folder.id)), sort),
    [boards, folder.id, sort],
  );

  async function mutate(input: RequestInfo | URL, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(input, init);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function renameFolder() {
    const name = window.prompt("새 폴더 이름", folder.name)?.trim();
    if (!name || name === folder.name) return;
    const result = await mutate("/api/dashboard", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rename", folderId: folder.id, name }),
    });
    if (result) router.refresh();
  }

  async function deleteFolder() {
    if (!window.confirm(`“${folder.name}” 폴더를 삭제할까요? 패드는 삭제되지 않습니다.`)) return;
    const result = await mutate(`/api/dashboard?folderId=${encodeURIComponent(folder.id)}`, { method: "DELETE" });
    if (result) router.push("/");
  }

  return (
    <section className={styles.root}>
      <header className={styles.heading}>
        <div><span className={styles.eyebrow}>FOLDER</span><h1>{folder.name}</h1></div>
        <div className={styles.folderActions}>
          <button type="button" className="button soft" disabled={busy} onClick={() => void renameFolder()}><Pencil size={15} />이름 변경</button>
          <button type="button" className="button danger" disabled={busy} onClick={() => void deleteFolder()}><Trash2 size={15} />폴더 삭제</button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.sort}><SortAsc size={15} aria-hidden /><span className={styles.visuallyHidden}>패드 정렬</span><select value={sort} onChange={(event) => setSort(event.target.value as DashboardSort)}><option value="UPDATED_DESC">최근 수정순</option><option value="TITLE_ASC">이름순</option></select></label>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}

      {folderBoards.length > 0
        ? <PadGrid boards={folderBoards} folders={folders} canCreateBoard={canCreateBoard} />
        : <div className={styles.empty}><FolderOpen size={27} aria-hidden /><b>이 폴더에 담긴 패드가 없습니다</b><small>패드 카드의 폴더 버튼에서 이 폴더를 선택하면 여기에 모입니다.</small></div>}
    </section>
  );
}
