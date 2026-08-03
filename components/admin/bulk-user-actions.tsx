"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Trash2, Users, X } from "lucide-react";
import type { AdminActor, AdminUserRecord, SchoolDirectoryItem, UserRole, UserStatus } from "@/components/admin/types";

export type BulkUpdateResult = { updated: string[]; deleted?: string[]; skipped: { userId: string; reason: string }[] };

async function responseJson(response: Response) {
  const result = await response.json().catch(() => ({ error: "서버 응답을 확인하지 못했습니다." }));
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result;
}

// 역할·상태·학교·반/부서 수정과 전체관리자 전용 일괄 삭제를 한 선택 바에서 처리합니다.
// 삭제는 소유 패드·마지막 전체관리자 같은 안전 조건을 API가 대상별로 다시 검사합니다.
export function BulkUserActions({ actor, selectedIds, selectedUsers, schools, onClose, onApplied }: {
  actor: AdminActor;
  selectedIds: string[];
  selectedUsers: AdminUserRecord[];
  schools: SchoolDirectoryItem[];
  onClose: () => void;
  onApplied: (result: BulkUpdateResult) => void;
}) {
  // 대표교사는 역할·상태를 일괄 변경할 수 없습니다(app/api/admin/users/bulk/route.ts와 짝을 맞춤) — 소속만.
  const isRepresentative = actor.role === "TEACHER" && actor.isSchoolRepresentative;
  const [changeRole, setChangeRole] = useState(false);
  const [role, setRole] = useState<UserRole>("STUDENT");
  const [changeStatus, setChangeStatus] = useState(false);
  const [status, setStatus] = useState<UserStatus>("ACTIVE");
  const [changeOrganization, setChangeOrganization] = useState(false);
  const [schoolId, setSchoolId] = useState("");
  const [schoolGroupId, setSchoolGroupId] = useState("");
  const [moveStudents, setMoveStudents] = useState(false);
  const [moveSchoolId, setMoveSchoolId] = useState("");
  const [moveSchoolGroupId, setMoveSchoolGroupId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const groupType = role === "STUDENT" ? "CLASS" : role === "TEACHER" ? "DEPARTMENT" : null;
  const availableGroups = schools.find((school) => school.id === schoolId)?.groups.filter((group) => !groupType || group.type === groupType) ?? [];
  const canMoveStudents = selectedUsers.length > 0
    && selectedUsers.every((user) => user.role === "STUDENT")
    && (actor.role === "SUPER_ADMIN"
      || (actor.role === "ADMIN" && actor.systemPermissions.includes("CHANGE_NON_ADMIN_ROLES"))
      || (actor.role === "TEACHER" && actor.isSchoolRepresentative));
  const moveClasses = schools.find((school) => school.id === moveSchoolId)?.groups.filter((group) => group.type === "CLASS") ?? [];
  const noFieldSelected = !changeRole && !changeStatus && !changeOrganization && !moveStudents;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (noFieldSelected) return setError("변경할 항목을 하나 이상 선택해 주세요.");
    if (!reason.trim()) return setError("변경 사유를 입력해 주세요.");
    setPending(true);
    setError("");
    try {
      if (moveStudents) {
        if (!moveSchoolGroupId) throw new Error("이동할 반을 선택해 주세요.");
        const movedResult = await responseJson(await fetch("/api/admin/students/move", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: selectedIds, schoolGroupId: moveSchoolGroupId, reason }),
        })) as { moved: { userId: string }[] };
        onApplied({ updated: movedResult.moved.map(({ userId }) => userId), skipped: [] });
        return;
      }
      const result = await responseJson(await fetch("/api/admin/users/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: selectedIds,
          reason,
          ...(changeRole ? { role } : {}),
          ...(changeStatus ? { status } : {}),
          ...(changeOrganization ? { schoolId: schoolId || null, schoolGroupId: schoolGroupId || null } : {}),
        }),
      }));
      onApplied(result as BulkUpdateResult);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "일괄 수정에 실패했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function deleteSelected() {
    if (reason.trim().length < 3) return setError("삭제 사유를 3자 이상 입력해 주세요.");
    if (!window.confirm(`${selectedIds.length}명의 계정을 삭제할까요?\n개인정보가 제거되고 즉시 로그아웃되며, 이 작업은 되돌릴 수 없습니다.`)) return;
    setPending(true);
    setError("");
    try {
      const result = await responseJson(await fetch("/api/admin/users/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedIds, reason }),
      }));
      onApplied(result as BulkUpdateResult);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "회원을 일괄 삭제하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="admin-bulk-bar" onSubmit={submit}>
      <div className="admin-bulk-summary"><Users size={15} />{selectedIds.length}명 선택됨</div>
      {!isRepresentative && (
        <>
          <label className="admin-bulk-field">
            <input type="checkbox" checked={changeRole} onChange={(event) => { setChangeRole(event.target.checked); if (event.target.checked) setMoveStudents(false); }} disabled={pending} />
            역할
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} disabled={!changeRole || pending}>
              <option value="STUDENT">학생</option>
              <option value="TEACHER">교사</option>
              <option value="ADMIN">보조관리자</option>
              <option value="SUPER_ADMIN">전체관리자</option>
            </select>
          </label>
          <label className="admin-bulk-field">
            <input type="checkbox" checked={changeStatus} onChange={(event) => { setChangeStatus(event.target.checked); if (event.target.checked) setMoveStudents(false); }} disabled={pending} />
            상태
            <select value={status} onChange={(event) => setStatus(event.target.value as UserStatus)} disabled={!changeStatus || pending}>
              <option value="ACTIVE">활성</option>
              <option value="SUSPENDED">정지</option>
            </select>
          </label>
        </>
      )}
      <label className="admin-bulk-field">
        <input type="checkbox" checked={changeOrganization} onChange={(event) => { setChangeOrganization(event.target.checked); if (event.target.checked) setMoveStudents(false); }} disabled={pending} />
        소속
        <select value={schoolId} onChange={(event) => { setSchoolId(event.target.value); setSchoolGroupId(""); }} disabled={!changeOrganization || pending}>
          <option value="">학교 선택</option>
          {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
        </select>
        <select value={schoolGroupId} onChange={(event) => setSchoolGroupId(event.target.value)} disabled={!changeOrganization || pending || !schoolId}>
          <option value="">반·부서 선택</option>
          {availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      {canMoveStudents ? (
        <label className="admin-bulk-field student-class-move-field">
          <input
            type="checkbox"
            checked={moveStudents}
            onChange={(event) => {
              const checked = event.target.checked;
              setMoveStudents(checked);
              if (checked) { setChangeRole(false); setChangeStatus(false); setChangeOrganization(false); }
            }}
            disabled={pending}
          />
          반 이동
          <select value={moveSchoolId} onChange={(event) => { setMoveSchoolId(event.target.value); setMoveSchoolGroupId(""); }} disabled={!moveStudents || pending}>
            <option value="">학교 선택</option>
            {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </select>
          <select value={moveSchoolGroupId} onChange={(event) => setMoveSchoolGroupId(event.target.value)} disabled={!moveStudents || pending || !moveSchoolId}>
            <option value="">도착 반 선택</option>
            {moveClasses.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <small>빈 번호를 앞에서부터 자동 배정</small>
        </label>
      ) : null}
      <input className="admin-bulk-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="변경·삭제 사유" maxLength={500} disabled={pending} />
      <button type="submit" className="button primary" disabled={pending || noFieldSelected || (moveStudents && !moveSchoolGroupId)}>{pending ? <LoaderCircle size={15} className="spin" /> : null}{moveStudents ? "이동" : "적용"}</button>
      {actor.role === "SUPER_ADMIN" && <button type="button" className="button danger admin-bulk-delete" disabled={pending} onClick={() => void deleteSelected()}><Trash2 size={15} />선택 회원 삭제</button>}
      <button type="button" className="icon-button" onClick={onClose} disabled={pending} aria-label="선택 해제"><X size={16} /></button>
      {error && <p className="form-error compact admin-bulk-error">{error}</p>}
    </form>
  );
}
