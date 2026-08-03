"use client";

import { useState } from "react";
import { LoaderCircle, MoreHorizontal } from "lucide-react";
import { StudentNumberEditor } from "@/components/admin/student-number-editor";
import type { AdminActor, AdminUserRecord, SchoolDirectoryItem, UserRole, UserStatus } from "@/components/admin/types";

const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "전체관리자",
  ADMIN: "보조관리자",
  TEACHER: "교사",
  STUDENT: "학생",
};

type UserInlineRowProps = {
  actor: AdminActor;
  user: AdminUserRecord;
  schools: SchoolDirectoryItem[];
  selected: boolean;
  selectionDisabled: boolean;
  onToggleSelected: () => void;
  onUpdated: (user: AdminUserRecord) => void;
  onOpenActions: () => void;
};

type InlineDraft = {
  role: UserRole;
  status: UserStatus;
  schoolId: string;
  schoolGroupId: string;
};

function draftFromUser(user: AdminUserRecord): InlineDraft {
  return {
    role: user.role,
    status: user.status,
    schoolId: user.school?.id ?? "",
    schoolGroupId: user.schoolGroup?.id ?? "",
  };
}

function groupType(role: UserRole) {
  if (role === "STUDENT") return "CLASS";
  if (role === "TEACHER") return "DEPARTMENT";
  return null;
}

async function responseJson(response: Response) {
  const result = await response.json().catch(() => ({ error: "서버 응답을 확인하지 못했습니다." }));
  if (!response.ok) throw new Error(result.error || "사용자 정보를 변경하지 못했습니다.");
  return result;
}

// 목록에서 가장 자주 하는 네 가지 수정만 셀 안에 남깁니다. 각 select는 바뀐 필드와 연동된
// 학교·반/부서만 PATCH하고, 서버 응답 DTO가 돌아오면 부모 목록을 갱신합니다.
export function UserInlineRow({
  actor,
  user,
  schools,
  selected,
  selectionDisabled,
  onToggleSelected,
  onUpdated,
  onOpenActions,
}: UserInlineRowProps) {
  const [optimisticDraft, setOptimisticDraft] = useState<InlineDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const draft = optimisticDraft ?? draftFromUser(user);
  const actorPermissions = new Set(actor.systemPermissions);
  const targetIsNonAdmin = user.role === "STUDENT" || user.role === "TEACHER";
  const isSelf = actor.id === user.id;
  const canManageAsRepresentative = actor.role === "TEACHER"
    && actor.isSchoolRepresentative
    && targetIsNonAdmin
    && actor.school?.id === user.school?.id;
  const canChangeRole = !isSelf && (
    actor.role === "SUPER_ADMIN"
    || (targetIsNonAdmin && actorPermissions.has("CHANGE_NON_ADMIN_ROLES"))
  );
  const canChangeStatus = !isSelf && (
    actor.role === "SUPER_ADMIN"
    || (targetIsNonAdmin && actorPermissions.has("SUSPEND_USERS"))
  );
  const canChangeSchool = !isSelf && (
    actor.role === "SUPER_ADMIN"
    || (targetIsNonAdmin && actorPermissions.has("CHANGE_NON_ADMIN_ROLES"))
  );
  const canChangeGroup = canChangeSchool || (!isSelf && canManageAsRepresentative);
  const canChangeStudentNumber = user.role === "STUDENT" && (
    actor.role === "SUPER_ADMIN"
    || (actor.role === "ADMIN" && actorPermissions.has("VIEW_USERS"))
    || (actor.role === "TEACHER" && actor.school?.id === user.school?.id)
  );
  const canRevokeSessions = actor.role === "SUPER_ADMIN"
    || (targetIsNonAdmin && actorPermissions.has("REVOKE_USER_SESSIONS"));
  const canViewPii = actor.role === "SUPER_ADMIN" || actorPermissions.has("VIEW_USER_PII");
  const canOpenActions = canRevokeSessions
    || canViewPii
    || (actor.role === "SUPER_ADMIN" && (user.role === "ADMIN" || user.role === "TEACHER" || !isSelf));
  const roleOptions: UserRole[] = actor.role === "SUPER_ADMIN"
    ? ["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT"]
    : targetIsNonAdmin
      ? ["TEACHER", "STUDENT"]
      : [user.role];
  const expectedGroupType = groupType(draft.role);
  const selectedSchool = schools.find((school) => school.id === draft.schoolId) ?? null;
  const availableGroups = selectedSchool?.groups.filter((group) => group.type === expectedGroupType) ?? [];

  async function save(
    nextDraft: InlineDraft,
    patch: Partial<Pick<InlineDraft, "role" | "status">> & {
      schoolId?: string | null;
      schoolGroupId?: string | null;
    },
    label: string,
  ) {
    setOptimisticDraft(nextDraft);
    setPending(true);
    setNotice("");
    try {
      const result = await responseJson(await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...patch,
          reason: `관리자 사용자 목록에서 ${label} 직접 변경`,
        }),
      }));
      onUpdated(result.user);
      setOptimisticDraft(null);
      setNotice("저장됨");
    } catch (error) {
      setOptimisticDraft(null);
      setNotice(error instanceof Error ? error.message : "변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  function changeRole(nextRole: UserRole) {
    const nextGroupType = groupType(nextRole);
    const nextSchool = schools.find((school) => school.id === draft.schoolId) ?? schools[0] ?? null;
    const nextSchoolGroupId = nextGroupType
      ? nextSchool?.groups.find((group) => group.type === nextGroupType)?.id ?? ""
      : "";
    if (nextGroupType && (!nextSchool || !nextSchoolGroupId)) {
      setNotice(nextRole === "STUDENT" ? "선택할 수 있는 반이 없습니다." : "선택할 수 있는 부서가 없습니다.");
      return;
    }
    const nextDraft = {
      ...draft,
      role: nextRole,
      schoolId: nextSchool?.id ?? "",
      schoolGroupId: nextSchoolGroupId,
    };
    void save(nextDraft, {
      role: nextRole,
      schoolId: nextDraft.schoolId || null,
      schoolGroupId: nextDraft.schoolGroupId || null,
    }, "권한");
  }

  function changeStatus(nextStatus: UserStatus) {
    void save({ ...draft, status: nextStatus }, { status: nextStatus }, "계정 상태");
  }

  function changeSchool(nextSchoolId: string) {
    const school = schools.find((item) => item.id === nextSchoolId) ?? null;
    const nextSchoolGroupId = expectedGroupType
      ? school?.groups.find((group) => group.type === expectedGroupType)?.id ?? ""
      : "";
    if (expectedGroupType && (!school || !nextSchoolGroupId)) {
      setNotice(expectedGroupType === "CLASS" ? "이 학교에는 선택할 반이 없습니다." : "이 학교에는 선택할 부서가 없습니다.");
      return;
    }
    const nextDraft = { ...draft, schoolId: nextSchoolId, schoolGroupId: nextSchoolGroupId };
    void save(nextDraft, {
      schoolId: nextSchoolId || null,
      schoolGroupId: nextSchoolGroupId || null,
    }, "학교·소속");
  }

  function changeSchoolGroup(nextSchoolGroupId: string) {
    void save({ ...draft, schoolGroupId: nextSchoolGroupId }, { schoolGroupId: nextSchoolGroupId || null }, "반·부서");
  }

  return (
    <tr className={selected ? "selected" : undefined}>
      <td className="admin-checkbox-col">
        <input type="checkbox" checked={selected} onChange={onToggleSelected} disabled={isSelf || selectionDisabled} aria-label={`${user.name || "이름 없음"} 선택`} />
      </td>
      <td>
        <div className="admin-user-identity">
          <span className={`admin-avatar small ${user.status !== "ACTIVE" ? "suspended" : ""}`}>{(user.name || "?")[0]}</span>
          <span><b>{user.name || "이름 없음"}</b><small>{user.maskedLoginIdentifier}</small>{user.mustChangePassword ? <em className="password-pending">비밀번호 변경 대기</em> : null}{notice && <em data-error={notice !== "저장됨"}>{notice}</em>}</span>
        </div>
      </td>
      <td>
        {canChangeRole
          ? <select className="admin-inline-select role" value={draft.role} onChange={(event) => changeRole(event.target.value as UserRole)} disabled={pending} aria-label={`${user.name || "사용자"} 권한`}>{roleOptions.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select>
          : <span className={`role-badge ${user.role.toLowerCase()}`}>{roleLabels[user.role]}</span>}
      </td>
      <td>
        {canChangeStatus
          ? <select className="admin-inline-select status" value={draft.status} onChange={(event) => changeStatus(event.target.value as UserStatus)} disabled={pending} aria-label={`${user.name || "사용자"} 계정 상태`}><option value="ACTIVE">활성</option><option value="SUSPENDED">정지</option></select>
          : <span className={`status-dot ${user.status.toLowerCase()}`}>{user.status === "ACTIVE" ? "활성" : "정지"}</span>}
      </td>
      <td>
        <div className="admin-inline-organization">
          {canChangeSchool
            ? <select className="admin-inline-select" value={draft.schoolId} onChange={(event) => changeSchool(event.target.value)} disabled={pending} aria-label={`${user.name || "사용자"} 학교`}><option value="">학교 없음</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select>
            : <span>{user.school?.name ?? "미지정"}</span>}
          {canChangeGroup
            ? <select className="admin-inline-select" value={draft.schoolGroupId} onChange={(event) => changeSchoolGroup(event.target.value)} disabled={pending || !expectedGroupType || !draft.schoolId} aria-label={`${user.name || "사용자"} ${expectedGroupType === "CLASS" ? "반" : "부서"}`}><option value="">{expectedGroupType ? "소속 선택" : "해당 없음"}</option>{availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
            : <small>{user.schoolGroup?.name ?? "소속 없음"}</small>}
          {user.role === "STUDENT" ? canChangeStudentNumber ? (
            <StudentNumberEditor
              userId={user.id}
              userName={user.name || "학생"}
              initialValue={user.studentNumber}
              source="사용자 관리"
              onSaved={onUpdated}
            />
          ) : <small className="admin-student-number">{user.studentNumber ? `${user.studentNumber}번` : "번호 미지정"}</small> : null}
        </div>
      </td>
      <td className="admin-board-count"><b>{user.ownedBoardCount + user.memberBoardCount}</b><small>소유 {user.ownedBoardCount}</small></td>
      <td className="admin-row-actions">
        <button type="button" className="icon-button small" onClick={onOpenActions} disabled={!canOpenActions || pending} aria-label={`${user.name || "사용자"} 상세 작업`}>
          {pending ? <LoaderCircle size={15} className="spin" /> : <MoreHorizontal size={17} />}
        </button>
      </td>
    </tr>
  );
}
