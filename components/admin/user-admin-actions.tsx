"use client";

import { useCallback, useState } from "react";
import { Eye, KeyRound, LoaderCircle, LogOut, RefreshCcw, ShieldCheck, Trash2, UserCog } from "lucide-react";
import type { AdminActor, AdminUserRecord, SystemPermission } from "@/components/admin/types";
import { Modal } from "@/components/ui/modal";

const permissionLabels: Record<SystemPermission, string> = {
  VIEW_USERS: "사용자 목록 조회",
  CHANGE_NON_ADMIN_ROLES: "학생·교사 역할·소속 변경",
  SUSPEND_USERS: "학생·교사 정지·복구",
  REVOKE_USER_SESSIONS: "사용자 세션 해제",
  VIEW_ALL_BOARDS: "모든 비공개 패드 조회",
  EDIT_ANY_CONTENT: "모든 콘텐츠 수정",
  MODERATE_CONTENT: "모든 콘텐츠 숨김·복구",
  CREATE_CONTENT_ANYWHERE: "모든 패드에 콘텐츠 생성",
  MANAGE_BOARD_SETTINGS: "모든 패드 설정·멤버 관리",
  TRANSFER_BOARD_OWNERSHIP: "패드 소유권 이전",
  VIEW_USER_PII: "개인정보 원문 조회",
  VIEW_AUDIT_LOG: "감사 로그 조회",
};
const allPermissions = Object.keys(permissionLabels) as SystemPermission[];
const basicPreset: SystemPermission[] = ["VIEW_USERS", "CHANGE_NON_ADMIN_ROLES", "SUSPEND_USERS", "REVOKE_USER_SESSIONS", "VIEW_AUDIT_LOG"];
const operationsPreset: SystemPermission[] = [...basicPreset, "VIEW_ALL_BOARDS", "EDIT_ANY_CONTENT", "MODERATE_CONTENT", "MANAGE_BOARD_SETTINGS", "TRANSFER_BOARD_OWNERSHIP"];

type UserAdminActionsProps = {
  actor: AdminActor;
  user: AdminUserRecord;
  onClose: () => void;
  onUpdated: (user: AdminUserRecord) => void;
  onDeleted: (userId: string) => void;
  onAuditChanged: () => void;
};

async function responseJson(response: Response) {
  const result = await response.json().catch(() => ({ error: "서버 응답을 확인하지 못했습니다." }));
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result;
}

function useAdminAction(reason: string, setMessage: (message: string) => void, clearPii: () => void) {
  const [pending, setPending] = useState(false);
  const run = useCallback(async (missingReasonMessage: string, action: () => Promise<void>) => {
    if (reason.trim().length < 3) {
      setMessage(missingReasonMessage);
      return;
    }
    setPending(true);
    setMessage("");
    clearPii();
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }, [clearPii, reason, setMessage]);
  return { pending, run };
}

// 매 행에 무거운 상세 편집기를 렌더링하지 않고, 실제로 ⋯를 누른 사용자 한 명에 대해서만
// 권한·PII·세션·삭제 같은 드문 작업을 모달로 마운트합니다.
export function UserAdminActions({
  actor,
  user,
  onClose,
  onUpdated,
  onDeleted,
  onAuditChanged,
}: UserAdminActionsProps) {
  const [permissions, setPermissions] = useState<SystemPermission[]>(user.systemPermissions);
  const [isSchoolRepresentative, setIsSchoolRepresentative] = useState(user.isSchoolRepresentative);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pii, setPii] = useState<{
    loginIdentifier: string;
    loginType: "LOGIN_ID" | "KAKAO_EMAIL";
    name: string | null;
    image: string | null;
  } | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const clearPii = useCallback(() => { setPii(null); setTemporaryPassword(""); }, []);
  const { pending, run } = useAdminAction(reason, setMessage, clearPii);
  const actorPermissions = new Set(actor.systemPermissions);
  const targetIsNonAdmin = user.role === "STUDENT" || user.role === "TEACHER";
  const canRevokeSessions = actor.role === "SUPER_ADMIN"
    || (targetIsNonAdmin && actorPermissions.has("REVOKE_USER_SESSIONS"));
  const canViewPii = actor.role === "SUPER_ADMIN" || actorPermissions.has("VIEW_USER_PII");

  function togglePermission(permission: SystemPermission) {
    setPermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  }

  async function updatePermissions() {
    await run("권한 변경 사유를 3자 이상 입력해 주세요.", async () => {
      const result = await responseJson(await fetch(`/api/admin/users/${user.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions, reason }),
      }));
      onUpdated({ ...user, systemPermissions: result.permissions, authVersion: user.authVersion + 1 });
      onAuditChanged();
      setMessage("보조관리자 권한을 저장하고 기존 세션을 해제했습니다.");
      setReason("");
    });
  }

  async function updateRepresentative() {
    await run("대표교사 변경 사유를 3자 이상 입력해 주세요.", async () => {
      const result = await responseJson(await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSchoolRepresentative, reason }),
      }));
      onUpdated(result.user);
      onAuditChanged();
      setMessage("학교 대표교사 설정을 변경했습니다.");
      setReason("");
    });
  }

  async function revokeSessions() {
    await run("세션 해제 사유를 3자 이상 입력해 주세요.", async () => {
      await responseJson(await fetch(`/api/admin/users/${user.id}/revoke-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }));
      onUpdated({ ...user, authVersion: user.authVersion + 1 });
      onAuditChanged();
      setMessage("기존 로그인 세션을 모두 해제했습니다.");
      setReason("");
    });
  }

  async function resetPassword() {
    if (!window.confirm(`${user.name || "이 사용자"}의 비밀번호를 임시 비밀번호로 초기화할까요?\n기존 세션은 모두 해제됩니다.`)) return;
    await run("비밀번호 초기화 사유를 3자 이상 입력해 주세요.", async () => {
      const result = await responseJson(await fetch(`/api/admin/users/${user.id}/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }));
      setTemporaryPassword(result.temporaryPassword);
      onUpdated({ ...user, authVersion: result.authVersion, mustChangePassword: true });
      onAuditChanged();
      setMessage("임시 비밀번호를 발급하고 기존 로그인 세션을 모두 해제했습니다.");
      setReason("");
    });
  }

  async function viewPii() {
    await run("개인정보 조회 사유를 3자 이상 입력해 주세요.", async () => {
      const result = await responseJson(await fetch(`/api/admin/users/${user.id}/pii`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }));
      setPii(result.pii);
      onAuditChanged();
      setMessage("개인정보 원문은 이 모달에서만 일시적으로 표시됩니다.");
    });
  }

  async function deleteAccount() {
    if (reason.trim().length < 3) {
      setMessage("회원 삭제 사유를 3자 이상 입력해 주세요.");
      return;
    }
    if (!window.confirm(`${user.name || "이 회원"} 계정을 삭제할까요?\n개인정보와 로그인 권한이 제거되며 되돌릴 수 없습니다.`)) return;
    await run("회원 삭제 사유를 3자 이상 입력해 주세요.", async () => {
      await responseJson(await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }));
      onAuditChanged();
      onDeleted(user.id);
      onClose();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${user.name || "이름 없음"} 상세 작업`}
      description="자주 쓰는 권한·상태·소속은 목록에서 바로 바꾸고, 민감한 작업만 여기서 처리합니다."
      className="admin-user-actions-modal"
    >
      <div className="admin-user-actions">
        <section className="admin-user-summary">
          <span className={`admin-avatar ${user.status !== "ACTIVE" ? "suspended" : ""}`}>{(user.name || "?")[0]}</span>
          <div><b>{user.name || "이름 없음"}</b><span>{user.maskedLoginIdentifier}</span><small>소유 패드 {user.ownedBoardCount} · 참여 패드 {user.memberBoardCount} · 최근 로그인 {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString("ko-KR") : "없음"}</small></div>
        </section>

        <label className="admin-action-reason">
          <span>작업 사유</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} placeholder="감사 로그에 남을 구체적인 사유를 입력하세요." />
        </label>

        {actor.role === "SUPER_ADMIN" && user.role === "ADMIN" && (
          <section className="permission-editor" aria-labelledby={`permission-title-${user.id}`}>
            <div className="permission-heading"><div><ShieldCheck size={17} /><h3 id={`permission-title-${user.id}`}>보조관리자 시스템 권한</h3></div><div><button type="button" onClick={() => setPermissions(basicPreset)}>기본</button><button type="button" onClick={() => setPermissions(operationsPreset)}>전체 운영</button></div></div>
            <fieldset disabled={pending}>
              <legend className="sr-only">부여할 시스템 권한</legend>
              {allPermissions.map((permission) => <label key={permission}><input type="checkbox" checked={permissions.includes(permission)} onChange={() => togglePermission(permission)} /><span>{permissionLabels[permission]}</span></label>)}
            </fieldset>
            <button type="button" className="button soft full" onClick={() => void updatePermissions()} disabled={pending}><KeyRound size={16} />시스템 권한 저장</button>
          </section>
        )}

        {actor.role === "SUPER_ADMIN" && user.role === "TEACHER" && (
          <section className="admin-representative-setting">
            <div><UserCog size={17} /><span><b>학교 대표교사</b><small>자기 학교 안에서 학생·교사 배치와 반·부서를 관리할 수 있습니다.</small></span></div>
            <label><input type="checkbox" checked={isSchoolRepresentative} onChange={(event) => setIsSchoolRepresentative(event.target.checked)} disabled={pending} /><span>{isSchoolRepresentative ? "지정됨" : "지정 안 함"}</span></label>
            <button type="button" className="button soft" onClick={() => void updateRepresentative()} disabled={pending || isSchoolRepresentative === user.isSchoolRepresentative}>대표교사 설정 저장</button>
          </section>
        )}

        <section className="admin-sensitive-actions" aria-label="보안 작업">
          {canRevokeSessions && user.hasPasswordCredential && actor.id !== user.id ? <button type="button" className="button ghost" onClick={() => void resetPassword()} disabled={pending}><RefreshCcw size={15} />비밀번호 초기화</button> : null}
          {canRevokeSessions && <button type="button" className="button ghost" onClick={() => void revokeSessions()} disabled={pending}><LogOut size={15} />세션 모두 해제</button>}
          {canViewPii && <button type="button" className="button ghost" onClick={() => void viewPii()} disabled={pending}><Eye size={15} />개인정보 원문 보기</button>}
          {actor.role === "SUPER_ADMIN" && actor.id !== user.id && <button type="button" className="button danger" onClick={() => void deleteAccount()} disabled={pending}><Trash2 size={15} />회원 삭제</button>}
        </section>

        {pending && <p className="admin-action-pending"><LoaderCircle size={15} className="spin" />처리 중입니다.</p>}
        {message && <p className="admin-message" aria-live="polite">{message}</p>}
        {temporaryPassword ? <div className="admin-temporary-password" role="status"><span><b>임시 비밀번호</b><small>이 창을 닫으면 다시 확인할 수 없습니다.</small></span><code>{temporaryPassword}</code><button type="button" className="button soft" onClick={() => void navigator.clipboard.writeText(temporaryPassword)}>복사</button></div> : null}
        {pii && <dl className="pii-result"><div><dt>{pii.loginType === "KAKAO_EMAIL" ? "카카오 이메일" : "로그인 아이디"}</dt><dd>{pii.loginIdentifier}</dd></div><div><dt>이름</dt><dd>{pii.name || "없음"}</dd></div><div><dt>프로필 URL</dt><dd>{pii.image || "없음"}</dd></div></dl>}
        <p className="admin-policy-note">민감한 작업은 사유와 함께 감사 로그에 기록됩니다. 개인정보 원문은 필요한 확인을 마치면 모달을 닫아 주세요.</p>
      </div>
    </Modal>
  );
}
