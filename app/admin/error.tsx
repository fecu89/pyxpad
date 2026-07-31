"use client";

import Link from "next/link";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="empty-page">
      <span className="empty-illustration" aria-hidden>!</span>
      <h1>관리자 정보를 불러오지 못했습니다</h1>
      <p>권한 또는 데이터베이스 연결을 다시 확인해 주세요.</p>
      <div className="access-actions"><button type="button" className="button primary" onClick={reset}>다시 시도</button><Link className="button ghost" href="/">홈으로</Link></div>
    </main>
  );
}
