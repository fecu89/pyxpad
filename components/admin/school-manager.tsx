"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, ChevronDown, CornerDownRight, GraduationCap, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, UserRoundCog, Users, X } from "lucide-react";
import { GroupMemberDisclosure } from "@/components/admin/group-member-disclosure";
import type { SchoolDirectoryItem } from "@/components/admin/types";

type SchoolGroup = SchoolDirectoryItem["groups"][number];
type SchoolTeacher = SchoolDirectoryItem["teachers"][number];

async function responseJson(response: Response) {
  const result = await response.json().catch(() => ({ error: "서버 응답을 확인하지 못했습니다." }));
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result;
}

function SchoolRepresentativeManager({ schoolId, teachers, canManage, onChanged }: {
  schoolId: string;
  teachers: SchoolTeacher[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const representatives = teachers.filter((teacher) => teacher.isSchoolRepresentative);
  const candidates = teachers.filter((teacher) => !teacher.isSchoolRepresentative);
  const [teacherId, setTeacherId] = useState(candidates[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function changeRepresentative(target: SchoolTeacher, enabled: boolean) {
    if (reason.trim().length < 3) {
      setMessage("변경 사유를 3자 이상 입력해 주세요.");
      return;
    }
    setPendingId(target.id);
    setMessage("");
    try {
      await responseJson(await fetch(`/api/admin/users/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSchoolRepresentative: enabled, reason: reason.trim() }),
      }));
      setReason("");
      setTeacherId("");
      setMessage(enabled ? "학교 대표교사를 지정했습니다." : "학교 대표교사 지정을 해제했습니다.");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "대표교사 지정을 변경하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  const selectedTeacher = candidates.find((teacher) => teacher.id === teacherId) ?? null;

  return (
    <section className="school-representative-manager" aria-labelledby={`${schoolId}-representative-title`}>
      <header>
        <span><ShieldCheck size={16} /></span>
        <div><h3 id={`${schoolId}-representative-title`}>학교 대표교사</h3><p>학생 계정 발급과 학교 소속 관리를 맡을 교사를 지정합니다.</p></div>
        <em>{representatives.length}명</em>
      </header>
      <div className="school-representative-list">
        {representatives.length ? representatives.map((teacher) => (
          <div key={teacher.id}>
            <span className="school-representative-avatar">{(teacher.name || "?")[0]}</span>
            <span><b>{teacher.name || "이름 없음"}</b><small>{teacher.departmentName || "부서 미지정"}</small></span>
            <em><ShieldCheck size={11} />대표교사</em>
            {canManage ? <button type="button" className="icon-button small" onClick={() => void changeRepresentative(teacher, false)} disabled={pendingId !== null} aria-label={`${teacher.name || "교사"} 대표교사 해제`}>{pendingId === teacher.id ? <LoaderCircle size={14} className="spin" /> : <X size={14} />}</button> : null}
          </div>
        )) : <p>지정된 학교 대표교사가 없습니다.</p>}
      </div>
      {canManage ? (
        <div className="school-representative-controls">
          <label><span>대표로 지정할 교사</span><select value={teacherId} onChange={(event) => setTeacherId(event.target.value)} disabled={pendingId !== null || candidates.length === 0}><option value="">교사 선택</option>{candidates.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name || "이름 없음"}{teacher.departmentName ? ` · ${teacher.departmentName}` : ""}</option>)}</select></label>
          <label><span>변경 사유</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="예: 학생 계정 관리 담당 지정" maxLength={500} disabled={pendingId !== null} /></label>
          <button type="button" className="button soft" onClick={() => selectedTeacher && void changeRepresentative(selectedTeacher, true)} disabled={!selectedTeacher || reason.trim().length < 3 || pendingId !== null}><UserRoundCog size={14} />대표 지정</button>
        </div>
      ) : null}
      {message ? <p className="school-representative-message" role="status">{message}</p> : null}
    </section>
  );
}

function DepartmentRow({ schoolId, group, canManageGroup, onChanged }: { schoolId: string; group: SchoolGroup; canManageGroup: boolean; onChanged: () => void }) {
  const [name, setName] = useState(group.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dirty = name.trim() !== group.name;

  async function save() {
    if (!dirty || pending) return;
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${schoolId}/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      }));
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`‘${group.name}’ 부서를 삭제할까요?${group.userCount > 0 ? `\n\n${group.userCount}명의 소속 정보가 초기화됩니다.` : ""}`)) return;
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${schoolId}/groups/${group.id}`, { method: "DELETE" }));
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "삭제하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <li className="school-group-row">
      {canManageGroup
        ? <input value={name} onChange={(event) => setName(event.target.value)} disabled={pending} maxLength={100} aria-label={`${group.name} 부서 이름`} />
        : <span className="school-group-name"><Briefcase size={13} />{group.name}</span>}
      <GroupMemberDisclosure schoolId={schoolId} groupId={group.id} groupName={group.name} groupType={group.type} userCount={group.userCount} />
      {canManageGroup ? <button type="button" className="icon-button small" onClick={save} disabled={!dirty || pending} aria-label={`${group.name} 저장`}>{pending ? <LoaderCircle size={14} className="spin" /> : <Pencil size={14} />}</button> : null}
      {canManageGroup ? <button type="button" className="icon-button small" onClick={remove} disabled={pending || group.isDefault} title={group.isDefault ? "서비스 초기 소속 데이터로 보호됩니다." : undefined} aria-label={group.isDefault ? "기본 부서 삭제 불가" : "부서 삭제"}><Trash2 size={14} /></button> : null}
      {error ? <small className="form-error compact">{error}</small> : null}
    </li>
  );
}

function ClassRow({ schoolId, group, canManageGroup, legacy = false, onChanged }: { schoolId: string; group: SchoolGroup; canManageGroup: boolean; legacy?: boolean; onChanged: () => void }) {
  const [grade, setGrade] = useState(group.grade ?? 1);
  const [classNumber, setClassNumber] = useState(group.classNumber ?? 1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dirty = classNumber !== group.classNumber || (legacy && grade !== group.grade);

  async function save() {
    if (!dirty || pending) return;
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${schoolId}/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legacy ? { grade, classNumber } : { classNumber }),
      }));
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "학급을 변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`‘${group.name}’ 학급을 삭제할까요?${group.userCount > 0 ? `\n\n${group.userCount}명의 소속 정보가 초기화됩니다.` : ""}`)) return;
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${schoolId}/groups/${group.id}`, { method: "DELETE" }));
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "학급을 삭제하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <li className="school-class-row">
      <div className="school-class-number-fields" data-legacy={legacy}>
        <span className="school-hierarchy-branch" aria-hidden><CornerDownRight size={14} /></span>
        {canManageGroup ? (
          <>
            {legacy ? <label><span>학년</span><input type="number" min={1} max={12} value={grade} onChange={(event) => setGrade(Number(event.target.value))} disabled={pending} /></label> : null}
            <label><span>반</span><input type="number" min={1} max={99} value={classNumber} onChange={(event) => setClassNumber(Number(event.target.value))} disabled={pending} /></label>
          </>
        ) : <b className="school-class-name">{group.classNumber ? `${group.classNumber}반` : group.name}</b>}
      </div>
      <GroupMemberDisclosure schoolId={schoolId} groupId={group.id} groupName={group.name} groupType={group.type} userCount={group.userCount} />
      {canManageGroup ? <button type="button" className="icon-button small" onClick={save} disabled={!dirty || pending} aria-label={`${group.name} 저장`}>{pending ? <LoaderCircle size={14} className="spin" /> : <Pencil size={14} />}</button> : null}
      {canManageGroup ? <button type="button" className="icon-button small" onClick={remove} disabled={pending || group.isDefault} title={group.isDefault ? "서비스 초기 소속 데이터로 보호됩니다." : undefined} aria-label={group.isDefault ? "기본 학급 삭제 불가" : `${group.name} 삭제`}><Trash2 size={14} /></button> : null}
      {error ? <small className="form-error compact">{error}</small> : null}
    </li>
  );
}

function AddClassForm({ schoolId, onChanged }: { schoolId: string; onChanged: () => void }) {
  const [grade, setGrade] = useState(1);
  const [classNumber, setClassNumber] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${schoolId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "CLASS", grade, classNumber }),
      }));
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "학급을 추가하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="school-class-add" onSubmit={submit}>
      <label><span>학년</span><input type="number" min={1} max={12} value={grade} onChange={(event) => setGrade(Number(event.target.value))} disabled={pending} /></label>
      <label><span>반</span><input type="number" min={1} max={99} value={classNumber} onChange={(event) => setClassNumber(Number(event.target.value))} disabled={pending} /></label>
      <button type="submit" className="button soft" disabled={pending}><Plus size={14} />학급 추가</button>
      {error ? <small className="form-error compact">{error}</small> : null}
    </form>
  );
}

function AddDepartmentForm({ schoolId, onChanged }: { schoolId: string; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${schoolId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "DEPARTMENT", name: name.trim() }),
      }));
      setName("");
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "부서를 추가하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="school-group-add" onSubmit={submit}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 3학년부" maxLength={100} disabled={pending} aria-label="새 교사 부서 이름" />
      <button type="submit" className="button soft" disabled={pending || !name.trim()}><Plus size={14} />부서 추가</button>
      {error ? <small className="form-error compact">{error}</small> : null}
    </form>
  );
}

function ClassSection({ schoolId, groups, canManageGroups, onChanged }: { schoolId: string; groups: SchoolGroup[]; canManageGroups: boolean; onChanged: () => void }) {
  const gradeNumbers = [...new Set(groups.map((group) => group.grade).filter((grade): grade is number => grade !== null))].sort((a, b) => a - b);
  const legacyGroups = groups.filter((group) => group.grade === null || group.classNumber === null);
  const userCount = groups.reduce((count, group) => count + group.userCount, 0);

  return (
    <section className="school-group-section school-class-section" data-type="class" aria-labelledby={`${schoolId}-class-title`}>
      <header className="school-group-section-header">
        <span className="school-group-section-icon"><GraduationCap size={17} /></span>
        <div><h3 id={`${schoolId}-class-title`}>학생 학급</h3><p>학년 아래에 반을 두고 학생을 배정합니다.</p></div>
        <span className="school-group-section-count">{groups.length}개 · {userCount}명</span>
      </header>
      {gradeNumbers.length || legacyGroups.length ? (
        <div className="school-grade-list">
          {gradeNumbers.map((grade) => {
            const classes = groups.filter((group) => group.grade === grade).sort((a, b) => (a.classNumber ?? 0) - (b.classNumber ?? 0));
            return (
              <section className="school-grade-card" key={grade} aria-label={`${grade}학년`}>
                <header><b>{grade}학년</b><span>{classes.length}개 반 · {classes.reduce((sum, item) => sum + item.userCount, 0)}명</span></header>
                <ul>{classes.map((group) => <ClassRow key={group.id} schoolId={schoolId} group={group} canManageGroup={canManageGroups} onChanged={onChanged} />)}</ul>
              </section>
            );
          })}
          {legacyGroups.length ? (
            <section className="school-grade-card legacy" aria-label="학년 미지정 학급">
              <header><b>학년 미지정</b><span>한 번 저장하면 새 계층으로 이동합니다.</span></header>
              <ul>{legacyGroups.map((group) => <ClassRow key={group.id} schoolId={schoolId} group={group} canManageGroup={canManageGroups} legacy onChanged={onChanged} />)}</ul>
            </section>
          ) : null}
        </div>
      ) : <p className="admin-empty compact">등록된 학생 학급이 없습니다.</p>}
      {canManageGroups ? <AddClassForm schoolId={schoolId} onChanged={onChanged} /> : null}
    </section>
  );
}

function DepartmentSection({ schoolId, groups, canManageGroups, onChanged }: { schoolId: string; groups: SchoolGroup[]; canManageGroups: boolean; onChanged: () => void }) {
  const userCount = groups.reduce((count, group) => count + group.userCount, 0);
  return (
    <section className="school-group-section" data-type="department" aria-labelledby={`${schoolId}-department-title`}>
      <header className="school-group-section-header">
        <span className="school-group-section-icon"><Briefcase size={17} /></span>
        <div><h3 id={`${schoolId}-department-title`}>교사 부서</h3><p>교사를 업무 부서 단위로 배정합니다.</p></div>
        <span className="school-group-section-count">{groups.length}개 · {userCount}명</span>
      </header>
      {groups.length
        ? <ul className="school-group-list">{groups.map((group) => <DepartmentRow key={group.id} schoolId={schoolId} group={group} canManageGroup={canManageGroups} onChanged={onChanged} />)}</ul>
        : <p className="admin-empty compact">등록된 교사 부서가 없습니다.</p>}
      {canManageGroups ? <AddDepartmentForm schoolId={schoolId} onChanged={onChanged} /> : null}
    </section>
  );
}

function SchoolRow({ school, expanded, canManageSchoolLevel, canManageSchoolGroups, onToggle, onChanged }: {
  school: SchoolDirectoryItem;
  expanded: boolean;
  canManageSchoolLevel: boolean;
  canManageSchoolGroups: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(school.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dirty = name.trim() !== school.name;
  const classGroups = school.groups.filter((group) => group.type === "CLASS");
  const departmentGroups = school.groups.filter((group) => group.type === "DEPARTMENT");
  const gradeCount = new Set(classGroups.map((group) => group.grade).filter((grade) => grade !== null)).size;

  async function save() {
    if (!dirty || pending) return;
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${school.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      }));
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    const groupCount = school.groups.length;
    if (!window.confirm(`‘${school.name}’ 학교를 삭제할까요?${school.userCount > 0 || groupCount > 0 ? `\n\n학급·부서 ${groupCount}개가 함께 삭제되고, ${school.userCount}명의 소속 정보가 초기화됩니다.` : ""}`)) return;
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${school.id}`, { method: "DELETE" }));
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "삭제하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <li className="school-row-wrap">
      <div className="school-row">
        <button type="button" className="icon-button small" onClick={onToggle} aria-expanded={expanded} aria-label={`${school.name} 소속 목록 ${expanded ? "접기" : "펼치기"}`}><ChevronDown size={16} className={expanded ? "rotated" : ""} /></button>
        <Building2 size={16} />
        {canManageSchoolLevel
          ? <input value={name} onChange={(event) => setName(event.target.value)} disabled={pending} maxLength={100} aria-label={`${school.name} 학교 이름`} />
          : <b className="school-name">{school.name}</b>}
        <span className="school-group-count"><Users size={12} />{school.userCount}명 · {gradeCount}개 학년 · {classGroups.length}개 반 · 교사 부서 {departmentGroups.length}{school.isDefault ? " · 기본" : ""}</span>
        {canManageSchoolLevel ? (
          <>
            <button type="button" className="icon-button small" onClick={save} disabled={!dirty || pending} aria-label={`${school.name} 학교 이름 저장`}>{pending ? <LoaderCircle size={14} className="spin" /> : <Pencil size={14} />}</button>
            <button type="button" className="icon-button small" onClick={remove} disabled={pending || school.isDefault} title={school.isDefault ? "서비스 초기 학교 데이터로 보호됩니다." : undefined} aria-label={school.isDefault ? "기본 학교는 삭제할 수 없음" : "학교 삭제"}><Trash2 size={14} /></button>
          </>
        ) : null}
      </div>
      {error ? <p className="form-error compact">{error}</p> : null}
      {expanded ? (
        <div className="school-groups">
          <SchoolRepresentativeManager schoolId={school.id} teachers={school.teachers} canManage={canManageSchoolLevel} onChanged={onChanged} />
          <div className="school-group-sections">
            <ClassSection schoolId={school.id} groups={classGroups} canManageGroups={canManageSchoolGroups} onChanged={onChanged} />
            <DepartmentSection schoolId={school.id} groups={departmentGroups} canManageGroups={canManageSchoolGroups} onChanged={onChanged} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function SchoolManager({ schools, canManageSchoolLevel, canManageSchoolGroups, onAuditChanged }: { schools: SchoolDirectoryItem[]; canManageSchoolLevel: boolean; canManageSchoolGroups: boolean; onAuditChanged: () => void }) {
  const router = useRouter();
  const [expandedSchoolId, setExpandedSchoolId] = useState<string | null>(null);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  function refresh() {
    router.refresh();
    onAuditChanged();
  }

  async function createSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newSchoolName.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      await responseJson(await fetch("/api/admin/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSchoolName.trim() }),
      }));
      setNewSchoolName("");
      refresh();
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "학교를 추가하지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="admin-panel school-manager" role="tabpanel">
      <header className="admin-panel-header">
        <div><span className="admin-kicker">ORGANIZATIONS</span><h2>소속 관리</h2><p>{canManageSchoolGroups ? "학교 → 학년 → 반과 교사 부서를 분리해 관리합니다." : "소속 구조를 확인하고 학생 번호를 지정·변경할 수 있습니다."}</p></div>
      </header>
      {canManageSchoolLevel ? (
        <form className="school-add" onSubmit={createSchool}>
          <input value={newSchoolName} onChange={(event) => setNewSchoolName(event.target.value)} placeholder="예: 청학고등학교" maxLength={100} disabled={creating} aria-label="새 학교 이름" />
          <button type="submit" className="button primary" disabled={creating || !newSchoolName.trim()}><Plus size={15} />학교 추가</button>
          {createError ? <small className="form-error compact">{createError}</small> : null}
        </form>
      ) : null}
      {schools.length ? (
        <ul className="school-list">
          {schools.map((school) => (
            <SchoolRow
              key={school.id}
              school={school}
              expanded={expandedSchoolId === school.id}
              canManageSchoolLevel={canManageSchoolLevel}
              canManageSchoolGroups={canManageSchoolGroups}
              onToggle={() => setExpandedSchoolId((current) => current === school.id ? null : school.id)}
              onChanged={refresh}
            />
          ))}
        </ul>
      ) : <p className="admin-empty">등록된 학교가 없습니다.</p>}
    </section>
  );
}
