"use client";

import { useState } from "react";
import { BadgeCheck, Building2, Check, ChevronLeft, ChevronRight, Clock3, LoaderCircle, School, X } from "lucide-react";
import type { TeacherApprovalRecord } from "@/components/admin/types";
import { Avatar } from "@/components/ui/avatar";

type ReviewState = { requestId: string; action: "APPROVE" | "REJECT" } | null;
const KOREAN_DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export function TeacherApprovalQueue({
  initialRequests,
  initialTotalCount,
  initialPage,
  initialPageSize,
  onCountChanged,
  onAuditChanged,
}: {
  initialRequests: TeacherApprovalRecord[];
  initialTotalCount: number;
  initialPage: number;
  initialPageSize: number;
  onCountChanged: (count: number) => void;
  onAuditChanged: () => void;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [page, setPage] = useState(initialPage);
  const [review, setReview] = useState<ReviewState>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const totalPages = Math.max(1, Math.ceil(totalCount / initialPageSize));

  async function load(targetPage: number) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/teacher-approvals?page=${targetPage}&pageSize=${initialPageSize}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "교사 가입 요청을 불러오지 못했습니다.");
      setRequests(result.requests);
      setTotalCount(result.totalCount);
      setPage(result.page);
      onCountChanged(result.totalCount);
      setReview(null);
      setReason("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "교사 가입 요청을 불러오지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  function beginReview(requestId: string, action: "APPROVE" | "REJECT") {
    setReview({ requestId, action });
    setReason("");
    setError("");
  }

  async function submitReview() {
    if (!review) return;
    if (reason.trim().length < 3) {
      setError("처리 사유를 3자 이상 입력해 주세요.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/teacher-approvals/${review.requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: review.action, reason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "교사 가입 요청을 처리하지 못했습니다.");
      const nextCount = Math.max(0, totalCount - 1);
      const nextPage = Math.min(page, Math.max(1, Math.ceil(nextCount / initialPageSize)));
      setTotalCount(nextCount);
      onCountChanged(nextCount);
      setReview(null);
      setReason("");
      onAuditChanged();
      await load(nextPage);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "교사 가입 요청을 처리하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="admin-panel admin-approval-panel" aria-labelledby="teacher-approval-title">
      <header className="admin-panel-header">
        <div>
          <span className="admin-kicker">TEACHER VERIFICATION</span>
          <h2 id="teacher-approval-title">교사 가입 요청</h2>
          <p>학교와 부서를 확인한 뒤 교사 권한을 연결하거나 사유와 함께 반려합니다.</p>
        </div>
        <button type="button" className="button ghost" disabled={pending} onClick={() => void load(page)}>
          {pending ? <LoaderCircle size={15} className="spin" aria-hidden /> : <Clock3 size={15} aria-hidden />}새로고침
        </button>
      </header>

      {error && <p className="admin-global-error" role="alert">{error}</p>}
      {requests.length ? (
        <ul className="admin-approval-list">
          {requests.map((request) => {
            const isReviewing = review?.requestId === request.id;
            return (
              <li key={request.id}>
                <div className="admin-approval-person">
                  <Avatar name={request.user.name} image={request.user.image} />
                  <span><b>{request.user.name || "이름 없음"}</b><small>{request.user.maskedLoginIdentifier}</small></span>
                </div>
                <div className="admin-approval-placement">
                  <span><School size={14} aria-hidden /><small>학교</small><b>{request.school.name}</b></span>
                  <span><Building2 size={14} aria-hidden /><small>부서</small><b>{request.schoolGroup.name}</b></span>
                </div>
                <time dateTime={request.requestedAt}>
                  {KOREAN_DATE_TIME.format(new Date(request.requestedAt))}
                </time>
                <div className="admin-approval-actions">
                  <button type="button" className="button soft" disabled={pending} onClick={() => beginReview(request.id, "REJECT")}><X size={15} aria-hidden />반려</button>
                  <button type="button" className="button primary" disabled={pending} onClick={() => beginReview(request.id, "APPROVE")}><BadgeCheck size={15} aria-hidden />승인</button>
                </div>
                {isReviewing && (
                  <div className="admin-approval-review">
                    <label>
                      <span>{review.action === "APPROVE" ? "승인 사유" : "반려 사유"}</span>
                      <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder={review.action === "APPROVE" ? "예: 재직 교사 확인 완료" : "신청 정보를 다시 확인해야 하는 이유"} autoFocus />
                      <small>{reason.length}/500</small>
                    </label>
                    <div>
                      <button type="button" className="button ghost" disabled={pending} onClick={() => { setReview(null); setReason(""); }}>취소</button>
                      <button type="button" className={review.action === "APPROVE" ? "button primary" : "button danger"} disabled={pending || reason.trim().length < 3} onClick={() => void submitReview()}>
                        {pending ? <LoaderCircle size={15} className="spin" aria-hidden /> : review.action === "APPROVE" ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
                        {review.action === "APPROVE" ? "교사로 승인" : "신청 반려"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="admin-approval-empty">
          <span><BadgeCheck size={24} aria-hidden /></span>
          <b>대기 중인 교사 가입 요청이 없습니다.</b>
          <p>새 신청이 들어오면 이곳에서 학교와 부서를 확인할 수 있습니다.</p>
        </div>
      )}

      {totalCount > 0 && (
        <footer className="admin-approval-pagination">
          <span>총 {totalCount}건</span>
          <div>
            <button type="button" className="icon-button" disabled={pending || page <= 1} onClick={() => void load(page - 1)} aria-label="이전 페이지"><ChevronLeft size={16} /></button>
            <b>{page} / {totalPages}</b>
            <button type="button" className="icon-button" disabled={pending || page >= totalPages} onClick={() => void load(page + 1)} aria-label="다음 페이지"><ChevronRight size={16} /></button>
          </div>
        </footer>
      )}
    </section>
  );
}
