"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Archive, Clock3, FolderOpen, LayoutGrid, Menu, Plus, Search, ShieldCheck, Star, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { LogoutButton, ProfileButton } from "@/components/home/home-actions";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { DashboardFolder } from "@/lib/dashboard/types";

export type SidebarRecentBoard = { id: string; slug: string; title: string };
export type SidebarUser = { name: string | null; image: string | null; email: string | null };

export function AppSidebar({
  recentBoards = [],
  folders = [],
  user,
  canAccessAdmin = false,
}: {
  recentBoards?: SidebarRecentBoard[];
  folders?: DashboardFolder[];
  user: SidebarUser;
  canAccessAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) return;
      setNewFolderName("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  const link = (href: string, active: boolean, icon: React.ReactNode, label: string) => (
    <Link href={href} className={`app-sidebar-link${active ? " active" : ""}`} onClick={() => setOpen(false)}>{icon}{label}</Link>
  );

  return (
    <>
      <button
        type="button"
        className="app-sidebar-trigger"
        aria-label="메뉴 열기"
        aria-controls="app-sidebar"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={22} aria-hidden />
      </button>
      <button
        type="button"
        className="app-sidebar-backdrop"
        data-open={open}
        aria-label="메뉴 닫기"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />
      <aside
        id="app-sidebar"
        className="app-sidebar"
        data-open={open}
        aria-label="사이드바"
      >
        <div className="app-sidebar-heading">
          <Link href="/" className="app-sidebar-brand" onClick={() => setOpen(false)}>
            <Logo size={26} />
            <span>pyxpad</span>
          </Link>
          <button type="button" className="app-sidebar-close" aria-label="메뉴 닫기" onClick={() => setOpen(false)}>
            <X size={20} aria-hidden />
          </button>
        </div>
        <nav className="app-sidebar-nav" aria-label="주요 메뉴">
          {link("/", pathname === "/", <LayoutGrid size={17} aria-hidden />, "내 패드")}
          {link("/favorites", pathname === "/favorites", <Star size={17} aria-hidden />, "즐겨찾기")}
          {link("/search", pathname === "/search", <Search size={17} aria-hidden />, "검색")}
          {link("/archived", pathname === "/archived", <Archive size={17} aria-hidden />, "보관된 패드")}
        </nav>

        <div className="app-sidebar-section">
          <span className="app-sidebar-section-title"><FolderOpen size={13} aria-hidden />내 폴더</span>
          <div className="app-sidebar-list">
            {folders.map((folder) => (
              <Link
                key={folder.id}
                href={`/folders/${folder.id}`}
                className={`app-sidebar-list-link${pathname === `/folders/${folder.id}` ? " active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <span>{folder.name}</span>
                <small>{folder.boardIds.length}</small>
              </Link>
            ))}
          </div>
          <form className="app-sidebar-folder-create" onSubmit={createFolder}>
            <label>
              <span className="app-sidebar-visually-hidden">새 폴더 이름</span>
              <input value={newFolderName} maxLength={60} placeholder="새 폴더" onChange={(event) => setNewFolderName(event.target.value)} />
            </label>
            <button type="submit" aria-label="폴더 추가" disabled={!newFolderName.trim() || creating}><Plus size={14} aria-hidden /></button>
          </form>
        </div>

        <div className="app-sidebar-section">
          <span className="app-sidebar-section-title"><Clock3 size={13} aria-hidden />최근 방문</span>
          {recentBoards.length > 0
            ? <div className="app-sidebar-list">{recentBoards.map((board) => (
                <Link key={board.id} href={`/b/${board.slug}`} className="app-sidebar-list-link" onClick={() => setOpen(false)}><span>{board.title}</span></Link>
              ))}</div>
            : <p className="app-sidebar-empty">아직 방문한 패드가 없습니다.</p>}
        </div>

        <div className="app-sidebar-bottom">
          <ProfileButton name={user.name} image={user.image} email={user.email} />
          <div className="app-sidebar-bottom-actions">
            {canAccessAdmin && (
              <Link href="/admin" className="icon-button" aria-label="관리자" onClick={() => setOpen(false)}>
                <ShieldCheck size={17} aria-hidden />
              </Link>
            )}
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </aside>
    </>
  );
}
