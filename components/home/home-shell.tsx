import "server-only";

import Link from "next/link";
import { ArchiveRestore } from "lucide-react";
import type { ArchivedBoardSummary } from "@/lib/dashboard/types";
import { Logo } from "@/components/ui/logo";
import { LoginButton } from "@/components/home/home-actions";
import { PurgeBoardButton, RestoreBoardButton } from "@/components/home/board-archive-actions";
import styles from "@/components/home/pad-dashboard.module.css";

export function Brand() {
  return <Link href="/" className="brand"><Logo size={29} /><span>pyxpad</span></Link>;
}

// 비로그인 사용자에게 보이는 전부입니다(마케팅 히어로는 "광고 필요 없다"는 피드백으로 제거).
// 로그인·OAuth 오류 처리는 이 컴포넌트를 감싸는 app/(dashboard)/page.tsx의
// HomeAuthActionsProvider가 맡습니다.
export function HomeAccessGate() {
  return (
    <main className="access-page">
      <nav className="access-nav"><Brand /></nav>
      <section className="access-card">
        <div className="pb-10">
          <h1>로그인하고 시작하세요</h1>
          <p className="access-description">카카오 계정으로 로그인하면 나만의 패드를 만들고 참여할 수 있어요.</p>
        </div>
        <div className="access-actions"><LoginButton className="button primary large">카카오로 시작하기</LoginButton></div>
      </section>
    </main>
  );
}

// 홈("/") 화면 안에 함께 묻혀 있어서 "찾기 어렵다"는 피드백을 받아, 사이드바 전용 항목 +
// /archived 라우트로 뺐습니다(app/(dashboard)/archived/page.tsx). 그 페이지의 유일한
// 내용이라 보관된 패드가 없어도 빈 화면 대신 안내 문구를 보여줍니다.
export function ArchivedBoards({ boards, userId, isSuperAdmin }: { boards: ArchivedBoardSummary[]; userId: string; isSuperAdmin: boolean }) {
  return (
    <section className={styles.root}>
      <header className={styles.heading}><div><span className={styles.eyebrow}>30-DAY RETENTION</span><h1>보관된 패드</h1><p className={styles.headingDescription}>보관 후 30일 안에는 복구할 수 있고, 패드 소유자 또는 전체관리자는 언제든 영구 삭제할 수 있습니다.</p></div></header>
      {boards.length === 0 ? (
        <p className="archived-boards-empty">보관된 패드가 없습니다. 패드 설정의 &ldquo;패드 보관&rdquo;으로 보관하면 여기에 나타나요.</p>
      ) : (
        <div className="archived-pad-grid">
          {boards.map((board) => {
            const canPurge = isSuperAdmin || board.owner.id === userId;
            return (
              <article key={board.id} className="archived-board-card">
                <span className="archive-icon"><ArchiveRestore size={19} /></span>
                <div><h3>{board.title}</h3><p>{board.owner.name || "PyxPad"} · {board.restorable ? `${board.remainingDays}일 남음` : "복구 기간 종료"}</p></div>
                <div className="archived-board-actions">
                  {board.restorable && <RestoreBoardButton boardId={board.id} />}
                  {canPurge
                    ? <PurgeBoardButton board={{ id: board.id, title: board.title }} />
                    : !board.restorable && <small>패드 소유자 또는 전체관리자만 영구 삭제할 수 있습니다.</small>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
