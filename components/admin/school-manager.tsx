"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, ChevronDown, GraduationCap, LoaderCircle, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { SchoolDirectoryItem } from "@/components/admin/types";

const groupTypeLabels = { CLASS: "반", DEPARTMENT: "부서" } as const;
type GroupType = keyof typeof groupTypeLabels;

async function responseJson(response: Response) {
  const result = await response.json().catch(() => ({ error: "서버 응답을 확인하지 못했습니다." }));
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result;
}

function GroupRow({ schoolId, group, onChanged }: {
  schoolId: string;
  group: SchoolDirectoryItem["groups"][number];
  onChanged: () => void;
}) {
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
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`‘${group.name}’ ${groupTypeLabels[group.type]} 항목을 삭제할까요?${group.userCount > 0 ? `\n\n${group.userCount}명의 소속 정보가 초기화됩니다.` : ""}`)) return;
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${schoolId}/groups/${group.id}`, { method: "DELETE" }));
      onChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "삭제하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <li className="school-group-row">
      <input value={name} onChange={(event) => setName(event.target.value)} disabled={pending} maxLength={100} aria-label={`${group.name} 이름`} />
      <span className="school-group-count"><Users size={12} />{group.userCount}명{group.isDefault ? " · 기본" : ""}</span>
      <button type="button" className="icon-button small" onClick={save} disabled={!dirty || pending} aria-label={`${group.name} 저장`}>{pending ? <LoaderCircle size={14} className="spin" /> : <Pencil size={14} />}</button>
      <button type="button" className="icon-button small" onClick={remove} disabled={pending || group.isDefault} title={group.isDefault ? "서비스 초기 소속 데이터로 보호됩니다." : undefined} aria-label={group.isDefault ? `기본 ${groupTypeLabels[group.type]} 삭제 불가` : `${groupTypeLabels[group.type]} 삭제`}><Trash2 size={14} /></button>
      {error && <small className="form-error compact">{error}</small>}
    </li>
  );
}

function AddGroupForm({ schoolId, type, onChanged }: { schoolId: string; type: GroupType; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const label = type === "CLASS" ? "학생 반" : "교사 부서";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${schoolId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type }),
      }));
      setName("");
      onChanged();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "추가하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="school-group-add" onSubmit={submit}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={type === "CLASS" ? "예: 3학년 4반" : "예: 3학년부"} maxLength={100} disabled={pending} aria-label={`새 ${label} 이름`} />
      <button type="submit" className="button soft" disabled={pending || !name.trim()}><Plus size={14} />{label} 추가</button>
      {error && <small className="form-error compact">{error}</small>}
    </form>
  );
}

function GroupSection({ schoolId, type, groups, onChanged }: {
  schoolId: string;
  type: GroupType;
  groups: SchoolDirectoryItem["groups"];
  onChanged: () => void;
}) {
  const isClass = type === "CLASS";
  const title = isClass ? "학생 반" : "교사 부서";
  const userCount = groups.reduce((count, group) => count + group.userCount, 0);
  const titleId = `${schoolId}-${type.toLowerCase()}-title`;

  return (
    <section className="school-group-section" data-type={type.toLowerCase()} aria-labelledby={titleId}>
      <header className="school-group-section-header">
        <span className="school-group-section-icon">{isClass ? <GraduationCap size={17} /> : <Briefcase size={17} />}</span>
        <div>
          <h3 id={titleId}>{title}</h3>
          <p>{isClass ? "학생을 학급 단위로 배정합니다." : "교사를 업무 부서 단위로 배정합니다."}</p>
        </div>
        <span className="school-group-section-count">{groups.length}개 · {userCount}명</span>
      </header>
      {groups.length
        ? <ul className="school-group-list">{groups.map((group) => <GroupRow key={group.id} schoolId={schoolId} group={group} onChanged={onChanged} />)}</ul>
        : <p className="admin-empty compact">등록된 {title}이 없습니다.</p>}
      <AddGroupForm schoolId={schoolId} type={type} onChanged={onChanged} />
    </section>
  );
}

function SchoolRow({ school, expanded, canManageSchoolLevel, onToggle, onChanged }: {
  school: SchoolDirectoryItem;
  expanded: boolean;
  canManageSchoolLevel: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(school.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dirty = name.trim() !== school.name;
  const classGroups = school.groups.filter((group) => group.type === "CLASS");
  const departmentGroups = school.groups.filter((group) => group.type === "DEPARTMENT");

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
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    const groupCount = school.groups.length;
    if (!window.confirm(`‘${school.name}’ 학교를 삭제할까요?${school.userCount > 0 || groupCount > 0 ? `\n\n반·부서 ${groupCount}개가 함께 삭제되고, ${school.userCount}명의 소속 정보가 초기화됩니다.` : ""}`)) return;
    setPending(true);
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/schools/${school.id}`, { method: "DELETE" }));
      onChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "삭제하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <li className="school-row-wrap">
      <div className="school-row">
        <button type="button" className="icon-button small" onClick={onToggle} aria-expanded={expanded} aria-label={`${school.name} 반·부서 목록 ${expanded ? "접기" : "펼치기"}`}><ChevronDown size={16} className={expanded ? "rotated" : ""} /></button>
        <Building2 size={16} />
        <input value={name} onChange={(event) => setName(event.target.value)} disabled={pending || !canManageSchoolLevel} maxLength={100} aria-label={`${school.name} 학교 이름`} />
        <span className="school-group-count"><Users size={12} />{school.userCount}명 · 학생 반 {classGroups.length} · 교사 부서 {departmentGroups.length}{school.isDefault ? " · 기본" : ""}</span>
        {canManageSchoolLevel && (
          <>
            <button type="button" className="icon-button small" onClick={save} disabled={!dirty || pending} aria-label={`${school.name} 학교 이름 저장`}>{pending ? <LoaderCircle size={14} className="spin" /> : <Pencil size={14} />}</button>
            <button type="button" className="icon-button small" onClick={remove} disabled={pending || school.isDefault} title={school.isDefault ? "서비스 초기 학교 데이터로 보호됩니다." : undefined} aria-label={school.isDefault ? "기본 학교는 삭제할 수 없음" : "학교 삭제"}><Trash2 size={14} /></button>
          </>
        )}
      </div>
      {error && <p className="form-error compact">{error}</p>}
      {expanded && (
        <div className="school-groups">
          <div className="school-group-sections">
            <GroupSection schoolId={school.id} type="CLASS" groups={classGroups} onChanged={onChanged} />
            <GroupSection schoolId={school.id} type="DEPARTMENT" groups={departmentGroups} onChanged={onChanged} />
          </div>
        </div>
      )}
    </li>
  );
}

// 학교 자체(생성·이름변경·삭제)는 전체 플랫폼에 공유되는 기초 데이터라 전체관리자만 관리할 수
// 있습니다(app/api/admin/schools/route.ts, [schoolId]/route.ts는 여전히 SUPER_ADMIN 전용).
// 반·부서는 학교 대표교사도 자기 학교 안에서 관리할 수 있어 canManageSchoolLevel과 무관하게 노출합니다.
export function SchoolManager({ schools, canManageSchoolLevel, onAuditChanged }: { schools: SchoolDirectoryItem[]; canManageSchoolLevel: boolean; onAuditChanged: () => void }) {
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
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "학교를 추가하지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="admin-panel school-manager" role="tabpanel">
      <header className="admin-panel-header">
        <div><span className="admin-kicker">ORGANIZATIONS</span><h2>소속 관리</h2><p>{canManageSchoolLevel ? "학교별 학생 반과 교사 부서를 나누어 관리합니다." : "우리 학교의 학생 반과 교사 부서를 나누어 관리합니다."}</p></div>
      </header>
      {canManageSchoolLevel && (
        <form className="school-add" onSubmit={createSchool}>
          <input value={newSchoolName} onChange={(event) => setNewSchoolName(event.target.value)} placeholder="예: 청학고등학교" maxLength={100} disabled={creating} aria-label="새 학교 이름" />
          <button type="submit" className="button primary" disabled={creating || !newSchoolName.trim()}><Plus size={15} />학교 추가</button>
          {createError && <small className="form-error compact">{createError}</small>}
        </form>
      )}
      {schools.length ? (
        <ul className="school-list">
          {schools.map((school) => (
            <SchoolRow
              key={school.id}
              school={school}
              expanded={expandedSchoolId === school.id}
              canManageSchoolLevel={canManageSchoolLevel}
              onToggle={() => setExpandedSchoolId((current) => current === school.id ? null : school.id)}
              onChanged={refresh}
            />
          ))}
        </ul>
      ) : <p className="admin-empty">등록된 학교가 없습니다.</p>}
    </section>
  );
}
