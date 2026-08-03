"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Search, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { requestJson } from "@/lib/api-client";
import styles from "@/components/pad/settings/settings.module.css";

type Candidate = { id: string; role: string; name: string | null; loginIdentifier: string };

const roleLabel: Record<string, string> = {
  STUDENT: "학생",
  TEACHER: "교사",
  ADMIN: "관리자",
  SUPER_ADMIN: "전체관리자",
};

// 예전에는 window.prompt로 이메일을 아무거나 받아서 초대했습니다 — 누가 이미 있는지도 안
// 보이고, 다른 학교 사람도 그대로 초대됐습니다(사용자 피드백 "최악이다"). 같은 학교 소속만
// 검색해 보여주고(교사는 같은 학교, 학생 소유자는 같은 학급), 목록에서 바로 눌러 추가합니다.
export function MemberInvitePicker({ boardId, onInvited }: { boardId: string; onInvited: () => void | Promise<void> }) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) setLoading(true); });
    const timer = setTimeout(() => {
      fetch(`/api/boards/${boardId}/members/candidates?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((result) => {
          setCandidates(result.candidates ?? []);
          setNote(result.note ?? "");
        })
        .catch((reason) => { if (!(reason instanceof DOMException)) setError("후보를 불러오지 못했습니다."); })
        .finally(() => setLoading(false));
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [boardId, query]);

  async function invite(candidate: Candidate) {
    setInvitingId(candidate.id);
    setError("");
    try {
      await requestJson(`/api/boards/${boardId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: candidate.id, role: "MEMBER" }),
      });
      setCandidates((current) => current.filter((item) => item.id !== candidate.id));
      await onInvited();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "멤버를 추가하지 못했습니다.");
    } finally {
      setInvitingId(null);
    }
  }

  return (
    <div className={styles.inviteBox}>
      <label className={styles.inviteSearch}>
        <Search size={15} />
        <input className={styles.inviteSearchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="같은 학교·학급 구성원 검색" />
      </label>
      {note && <p className={styles.note}>{note}</p>}
      {error && <p className="form-error compact">{error}</p>}
      {loading && <p className={styles.note}><LoaderCircle size={13} className="spin" />찾는 중…</p>}
      {!loading && !note && candidates.length === 0 && (
        <p className={styles.note}>{query ? "일치하는 구성원이 없어요." : "초대할 수 있는 구성원이 없어요."}</p>
      )}
      {!loading && candidates.length > 0 && (
        <ul className={styles.inviteList}>
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <Avatar name={candidate.name} identifier={candidate.loginIdentifier} size="small" />
              <span className={styles.candidateCopy}><b>{candidate.name || "이름 없음"}</b><small>{candidate.loginIdentifier} · {roleLabel[candidate.role] ?? candidate.role}</small></span>
              <button type="button" className="button soft small" disabled={invitingId === candidate.id} onClick={() => invite(candidate)}>
                {invitingId === candidate.id ? <LoaderCircle size={13} className="spin" /> : <UserPlus size={13} />}
                추가
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
