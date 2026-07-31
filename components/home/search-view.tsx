"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PadGrid, sortPads } from "@/components/home/pad-grid";
import styles from "@/components/home/pad-dashboard.module.css";
import type { DashboardBoard, DashboardFolder } from "@/lib/dashboard/types";

// 예전에는 대시보드 본문 툴바에 검색 입력이 붙어 있었는데, 사이드바의 독립 라우트로 옮겼습니다.
// 검색 대상·방식(제목과 소유자 이름을 대상으로 한 클라이언트 필터)은 그대로입니다 — 서버가
// 이미 권한 필터를 통과한 패드만 내려주므로 여기서 추가 권한 검사는 필요 없습니다.
export function SearchView({
  boards,
  folders,
  canCreateBoard,
}: {
  boards: DashboardBoard[];
  folders: DashboardFolder[];
  canCreateBoard: boolean;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("ko");
  const results = useMemo(
    () => (normalized
      ? sortPads(boards.filter((board) => `${board.title} ${board.owner.name ?? ""}`.toLocaleLowerCase("ko").includes(normalized)), "UPDATED_DESC")
      : []),
    [boards, normalized],
  );

  return (
    <section className={styles.root}>
      <header className={styles.heading}>
        <div><span className={styles.eyebrow}>SEARCH</span><h1>패드 검색</h1></div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} aria-hidden />
          <span className={styles.visuallyHidden}>패드 검색</span>
          <input type="search" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 소유자 검색" />
        </label>
      </div>

      {!normalized
        ? <div className={styles.empty}><Search size={27} aria-hidden /><b>검색어를 입력해 주세요</b><small>내가 접근할 수 있는 패드를 제목과 소유자 이름으로 찾습니다.</small></div>
        : results.length > 0
          ? <PadGrid boards={results} folders={folders} canCreateBoard={canCreateBoard} />
          : <div className={styles.empty}><Search size={27} aria-hidden /><b>“{query.trim()}” 검색 결과가 없습니다</b><small>다른 검색어로 시도해 보세요.</small></div>}
    </section>
  );
}
