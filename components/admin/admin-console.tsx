"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Building2, ChevronLeft, ChevronRight, Search, Shield, SlidersHorizontal, Users, X } from "lucide-react";
import { AuditLogList } from "@/components/admin/audit-log-list";
import { BulkUserActions, type BulkUpdateResult } from "@/components/admin/bulk-user-actions";
import { SchoolManager } from "@/components/admin/school-manager";
import { TeacherApprovalQueue } from "@/components/admin/teacher-approval-queue";
import type { AdminActor, AdminUserRecord, AuditLogRecord, SchoolDirectoryItem, TeacherApprovalRecord } from "@/components/admin/types";
import { UserAdminActions } from "@/components/admin/user-admin-actions";
import { UserInlineRow } from "@/components/admin/user-inline-row";
import { Logo } from "@/components/ui/logo";

const roleLabels = { SUPER_ADMIN: "전체관리자", ADMIN: "보조관리자", TEACHER: "교사", STUDENT: "학생" } as const;
const PAGE_SIZE_OPTIONS = [10, 50, 100] as const;
type UserFilters = { role: string; status: string; email: string; schoolId: string; schoolGroupId: string };

function pageWindow(page: number, totalPages: number) {
  const size = 5;
  const start = Math.max(1, Math.min(page - Math.floor(size / 2), totalPages - size + 1));
  const end = Math.min(totalPages, start + size - 1);
  const numbers: number[] = [];
  for (let value = Math.max(1, start); value <= end; value += 1) numbers.push(value);
  return numbers;
}

type AdminConsoleProps = {
  actor: AdminActor;
  canViewUsers: boolean;
  canViewAudit: boolean;
  canManageTeacherApprovals: boolean;
  initialTab: "users" | "approvals" | "audit" | "schools";
  initialUsers: AdminUserRecord[];
  initialTotalCount: number;
  initialPage: number;
  initialPageSize: number;
  initialLogs: AuditLogRecord[];
  initialAuditCursor: string | null;
  schools: SchoolDirectoryItem[];
  initialTeacherApprovals: TeacherApprovalRecord[];
  initialTeacherApprovalCount: number;
  initialTeacherApprovalPage: number;
  initialTeacherApprovalPageSize: number;
};

export function AdminConsole({ actor, canViewUsers, canViewAudit, canManageTeacherApprovals, initialTab, initialUsers, initialTotalCount, initialPage, initialPageSize, initialLogs, initialAuditCursor, schools, initialTeacherApprovals, initialTeacherApprovalCount, initialTeacherApprovalPage, initialTeacherApprovalPageSize }: AdminConsoleProps) {
  const isRepresentative = actor.role === "TEACHER" && actor.isSchoolRepresentative;
  const canManageSchools = actor.role === "SUPER_ADMIN" || isRepresentative;
  const [tab, setTab] = useState<"users" | "approvals" | "audit" | "schools">(initialTab);
  const [users, setUsers] = useState(initialUsers);
  const [directoryCount, setDirectoryCount] = useState(initialTotalCount);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("");
  const [schoolGroupFilter, setSchoolGroupFilter] = useState("");
  const [logs, setLogs] = useState(initialLogs);
  const [auditCursor, setAuditCursor] = useState(initialAuditCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [bulkNotice, setBulkNotice] = useState("");
  const [teacherApprovalCount, setTeacherApprovalCount] = useState(initialTeacherApprovalCount);
  const filterGroups = schools.find((school) => school.id === schoolFilter)?.groups ?? [];
  const filterClasses = filterGroups.filter((group) => group.type === "CLASS");
  const filterDepartments = filterGroups.filter((group) => group.type === "DEPARTMENT");
  const hasActiveFilters = Boolean(roleFilter || statusFilter || emailFilter.trim() || schoolFilter || schoolGroupFilter);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const selectableUserIds = users.filter((user) => user.id !== actor.id).map((user) => user.id);
  const actionUser = users.find((user) => user.id === actionUserId) ?? null;

  async function loadUsers(targetPage: number, targetPageSize: number, overrides: Partial<UserFilters> = {}) {
    setPending(true); setError("");
    try {
      const filters: UserFilters = {
        role: overrides.role ?? roleFilter,
        status: overrides.status ?? statusFilter,
        email: overrides.email ?? emailFilter,
        schoolId: overrides.schoolId ?? schoolFilter,
        schoolGroupId: overrides.schoolGroupId ?? schoolGroupFilter,
      };
      const query = new URLSearchParams({ page: String(targetPage), pageSize: String(targetPageSize) });
      if (filters.role) query.set("role", filters.role);
      if (filters.status) query.set("status", filters.status);
      if (filters.email.trim()) query.set("email", filters.email.trim());
      if (filters.schoolId) query.set("schoolId", filters.schoolId);
      if (filters.schoolGroupId) query.set("schoolGroupId", filters.schoolGroupId);
      const response = await fetch(`/api/admin/users?${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "사용자 목록을 불러오지 못했습니다.");
      setUsers(result.users);
      setTotalCount(result.totalCount);
      if (!filters.role && !filters.status && !filters.email.trim() && !filters.schoolId && !filters.schoolGroupId) {
        setDirectoryCount(result.totalCount);
      }
      setPage(result.page);
      setPageSize(result.pageSize);
      setActionUserId(null);
      setSelectedIds(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "사용자 목록을 불러오지 못했습니다.");
    } finally { setPending(false); }
  }

  async function loadAudit(reset: boolean) {
    if (!canViewAudit) return;
    setPending(true); setError("");
    try {
      const query = new URLSearchParams({ limit: "25" });
      if (!reset && auditCursor) query.set("cursor", auditCursor);
      const response = await fetch(`/api/admin/audit-logs?${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "감사 로그를 불러오지 못했습니다.");
      setLogs((current) => reset ? result.logs : [...current, ...result.logs]);
      setAuditCursor(result.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "감사 로그를 불러오지 못했습니다.");
    } finally { setPending(false); }
  }

  function searchUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadUsers(1, pageSize);
  }

  function changeRoleFilter(nextRole: string) {
    const selectedGroup = filterGroups.find((group) => group.id === schoolGroupFilter);
    const incompatibleGroup = Boolean(selectedGroup) && (
      (nextRole === "STUDENT" && selectedGroup?.type !== "CLASS")
      || (nextRole === "TEACHER" && selectedGroup?.type !== "DEPARTMENT")
      || nextRole === "ADMIN"
      || nextRole === "SUPER_ADMIN"
    );
    const nextSchoolGroupId = incompatibleGroup ? "" : schoolGroupFilter;
    setRoleFilter(nextRole);
    if (incompatibleGroup) setSchoolGroupFilter("");
    void loadUsers(1, pageSize, { role: nextRole, schoolGroupId: nextSchoolGroupId });
  }

  function changeStatusFilter(nextStatus: string) {
    setStatusFilter(nextStatus);
    void loadUsers(1, pageSize, { status: nextStatus });
  }

  function changeSchoolFilter(nextSchoolId: string) {
    setSchoolFilter(nextSchoolId);
    setSchoolGroupFilter("");
    void loadUsers(1, pageSize, { schoolId: nextSchoolId, schoolGroupId: "" });
  }

  function changeSchoolGroupFilter(nextSchoolGroupId: string) {
    setSchoolGroupFilter(nextSchoolGroupId);
    void loadUsers(1, pageSize, { schoolGroupId: nextSchoolGroupId });
  }

  function clearEmailFilter() {
    setEmailFilter("");
    void loadUsers(1, pageSize, { email: "" });
  }

  function resetFilters() {
    setRoleFilter("");
    setStatusFilter("");
    setEmailFilter("");
    setSchoolFilter("");
    setSchoolGroupFilter("");
    void loadUsers(1, pageSize, { role: "", status: "", email: "", schoolId: "", schoolGroupId: "" });
  }

  function changePageSize(nextPageSize: number) {
    void loadUsers(1, nextPageSize);
  }

  function updateUser(updated: AdminUserRecord) {
    setUsers((current) => current.map((user) => user.id === updated.id ? updated : user));
  }

  function deleteUser(userId: string) {
    const nextTotalCount = Math.max(0, totalCount - 1);
    const nextPage = Math.min(page, Math.max(1, Math.ceil(nextTotalCount / pageSize)));
    setUsers((current) => current.filter((user) => user.id !== userId));
    setTotalCount(nextTotalCount);
    setDirectoryCount((current) => Math.max(0, current - 1));
    setActionUserId(null);
    setSelectedIds((current) => { const next = new Set(current); next.delete(userId); return next; });
    void loadUsers(nextPage, pageSize);
  }

  function toggleSelected(userId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => current.size === selectableUserIds.length ? new Set() : new Set(selectableUserIds));
  }

  function onBulkApplied(result: BulkUpdateResult) {
    setSelectedIds(new Set());
    if (result.deleted) setDirectoryCount((current) => Math.max(0, current - result.updated.length));
    const changedLabel = result.deleted ? "삭제" : "변경";
    setBulkNotice(result.skipped.length
      ? `${result.updated.length}명 ${changedLabel}, ${result.skipped.length}명은 권한·조건이 맞지 않아 건너뛰었습니다.`
      : `${result.updated.length}명을 ${changedLabel}했습니다.`);
    void loadUsers(page, pageSize);
    void loadAudit(true);
  }

  const selectedList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return (
    <main className="admin-page">
      <header className="admin-nav">
        <Link href="/" className="brand"><Logo size={29} /><span>pyxpad</span></Link>
        <div className="admin-nav-title"><Shield size={17} /><span>관리자 센터</span></div>
        <Link href="/" className="button ghost"><ArrowLeft size={16} />패드로 돌아가기</Link>
      </header>
      <div className="admin-workspace">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-heading"><span>ADMIN MENU</span><b>관리 메뉴</b></div>
          <nav className="admin-sidebar-nav" aria-label="관리자 기능">
            {canViewUsers && <button type="button" aria-current={tab === "users" ? "page" : undefined} onClick={() => setTab("users")}><span className="admin-sidebar-icon"><Users size={17} /></span><span><b>사용자 관리</b><small>계정·권한·소속</small></span><em>{directoryCount}</em></button>}
            {canManageTeacherApprovals && <button type="button" aria-current={tab === "approvals" ? "page" : undefined} onClick={() => setTab("approvals")}><span className="admin-sidebar-icon"><BadgeCheck size={17} /></span><span><b>교사 가입 요청</b><small>학교·부서 승인</small></span><em data-alert={teacherApprovalCount > 0}>{teacherApprovalCount}</em></button>}
            {canManageSchools && <button type="button" aria-current={tab === "schools" ? "page" : undefined} onClick={() => setTab("schools")}><span className="admin-sidebar-icon"><Building2 size={17} /></span><span><b>소속 관리</b><small>학교·반·부서</small></span><em>{schools.length}</em></button>}
            {canViewAudit && <button type="button" aria-current={tab === "audit" ? "page" : undefined} onClick={() => setTab("audit")}><span className="admin-sidebar-icon"><Shield size={17} /></span><span><b>감사 로그</b><small>중요 작업 기록</small></span></button>}
          </nav>
          <div className="admin-sidebar-actor">
            <span className="admin-avatar small">{(actor.name || "?")[0]}</span>
            <div><b>{actor.name || "관리자"}</b><span>{roleLabels[actor.role]} · 권한 {actor.role === "SUPER_ADMIN" ? "전체" : `${actor.systemPermissions.length}개`}</span></div>
          </div>
          <p className="admin-sidebar-note">민감한 작업은 사유와 함께 감사 로그에 기록됩니다.</p>
        </aside>
        <div className="admin-workspace-content">
          {error && <p className="admin-global-error" role="alert">{error}</p>}

          {tab === "users" && canViewUsers && (
        <section className="admin-panel admin-user-list-panel">
          <header className="admin-panel-header"><div><span className="admin-kicker">DIRECTORY</span><h2>사용자</h2><p>이메일로 찾거나 역할과 소속으로 목록을 좁혀보세요.</p></div></header>
          <form className="admin-user-search" onSubmit={searchUsers}>
            <div className="admin-search-main">
              <div className="admin-search-field">
                <Search size={17} aria-hidden />
                <label htmlFor="admin-user-email-search" className="sr-only">이메일 정확 검색</label>
                <input id="admin-user-email-search" type="email" value={emailFilter} onChange={(event) => setEmailFilter(event.target.value)} placeholder="전체 이메일 주소 입력" autoComplete="off" />
                {emailFilter && <button type="button" className="admin-search-clear" onClick={clearEmailFilter} disabled={pending} aria-label="이메일 검색어 지우기"><X size={15} /></button>}
              </div>
              <button className="button primary admin-search-submit" disabled={pending}><Search size={15} />사용자 찾기</button>
            </div>
            <div className="admin-filter-row" aria-label="사용자 목록 필터">
              <span className="admin-filter-heading"><SlidersHorizontal size={14} />세부 필터</span>
              <label><span className="sr-only">역할 필터</span><select value={roleFilter} onChange={(event) => changeRoleFilter(event.target.value)} disabled={pending}><option value="">모든 권한</option><option value="SUPER_ADMIN">전체관리자</option><option value="ADMIN">보조관리자</option><option value="TEACHER">교사</option><option value="STUDENT">학생</option></select></label>
              <label><span className="sr-only">상태 필터</span><select value={statusFilter} onChange={(event) => changeStatusFilter(event.target.value)} disabled={pending}><option value="">모든 상태</option><option value="ACTIVE">활성</option><option value="SUSPENDED">정지</option></select></label>
              <label><span className="sr-only">학교 필터</span><select value={schoolFilter} onChange={(event) => changeSchoolFilter(event.target.value)} disabled={pending}><option value="">모든 학교</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
              <label>
                <span className="sr-only">반 또는 부서 필터</span>
                <select value={schoolGroupFilter} onChange={(event) => changeSchoolGroupFilter(event.target.value)} disabled={pending || !schoolFilter}>
                  <option value="">모든 반·부서</option>
                  {roleFilter !== "TEACHER" && roleFilter !== "ADMIN" && roleFilter !== "SUPER_ADMIN" && filterClasses.length > 0 && <optgroup label="학생 반">{filterClasses.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</optgroup>}
                  {roleFilter !== "STUDENT" && roleFilter !== "ADMIN" && roleFilter !== "SUPER_ADMIN" && filterDepartments.length > 0 && <optgroup label="교사 부서">{filterDepartments.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</optgroup>}
                </select>
              </label>
              <div className="admin-filter-meta">
                <span className="admin-filter-result">결과 <b>{totalCount}</b>명</span>
                <button type="button" className="admin-filter-reset" onClick={resetFilters} disabled={pending || !hasActiveFilters}><X size={13} />전체 초기화</button>
              </div>
            </div>
          </form>

          {selectedList.length > 0 && (
            <BulkUserActions actor={actor} selectedIds={selectedList} schools={schools} onClose={() => setSelectedIds(new Set())} onApplied={onBulkApplied} />
          )}
          {bulkNotice && <p className="admin-bulk-notice" role="status">{bulkNotice}</p>}

          <div className="admin-table-wrap">
            <table className="admin-user-table">
              <thead><tr><th className="admin-checkbox-col"><input type="checkbox" checked={selectableUserIds.length > 0 && selectedIds.size === selectableUserIds.length} onChange={toggleSelectAll} disabled={selectableUserIds.length === 0} aria-label="이 페이지의 전체 사용자 선택" /></th><th>사용자</th><th>권한</th><th>상태</th><th>학교·소속</th><th>패드</th><th><span className="sr-only">상세 작업</span></th></tr></thead>
              <tbody>{users.map((user) => (
                <UserInlineRow
                  key={user.id}
                  actor={actor}
                  user={user}
                  schools={schools}
                  selected={selectedIds.has(user.id)}
                  onToggleSelected={() => toggleSelected(user.id)}
                  onUpdated={updateUser}
                  onOpenActions={() => setActionUserId(user.id)}
                />
              ))}</tbody>
            </table>
            {!users.length && <p className="admin-empty">조건에 맞는 사용자가 없습니다.</p>}
          </div>

          <div className="admin-pagination">
            <label className="admin-page-size">페이지당<select value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))} disabled={pending}>{PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}명</option>)}</select></label>
            <div className="admin-page-nav">
              <button type="button" className="icon-button" onClick={() => void loadUsers(page - 1, pageSize)} disabled={pending || page <= 1} aria-label="이전 페이지"><ChevronLeft size={16} /></button>
              {pageWindow(page, totalPages).map((value) => (
                <button type="button" key={value} className={value === page ? "admin-page-current" : undefined} onClick={() => void loadUsers(value, pageSize)} disabled={pending} aria-current={value === page ? "page" : undefined}>{value}</button>
              ))}
              <button type="button" className="icon-button" onClick={() => void loadUsers(page + 1, pageSize)} disabled={pending || page >= totalPages} aria-label="다음 페이지"><ChevronRight size={16} /></button>
            </div>
            <span className="admin-page-total">총 {totalCount}명 · {page} / {totalPages}페이지</span>
          </div>
        </section>
          )}

          {tab === "schools" && canManageSchools && <SchoolManager schools={schools} canManageSchoolLevel={actor.role === "SUPER_ADMIN"} onAuditChanged={() => void loadAudit(true)} />}

          {tab === "approvals" && canManageTeacherApprovals && (
            <TeacherApprovalQueue
              initialRequests={initialTeacherApprovals}
              initialTotalCount={initialTeacherApprovalCount}
              initialPage={initialTeacherApprovalPage}
              initialPageSize={initialTeacherApprovalPageSize}
              onCountChanged={setTeacherApprovalCount}
              onAuditChanged={() => void loadAudit(true)}
            />
          )}

          {tab === "audit" && canViewAudit && <div><AuditLogList logs={logs} hasMore={Boolean(auditCursor)} pending={pending} onLoadMore={() => void loadAudit(false)} onRefresh={() => void loadAudit(true)} /></div>}
        </div>
      </div>
      {actionUser && (
        <UserAdminActions
          key={actionUser.id}
          actor={actor}
          user={actionUser}
          onClose={() => setActionUserId(null)}
          onUpdated={updateUser}
          onDeleted={deleteUser}
          onAuditChanged={() => void loadAudit(true)}
        />
      )}
    </main>
  );
}
