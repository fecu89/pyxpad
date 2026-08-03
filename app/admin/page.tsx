import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { AdminConsole } from "@/components/admin/admin-console";
import { Logo } from "@/components/ui/logo";
import { canAccessAdminShell, hasSystemPermission } from "@/lib/auth/authorization";
import { getAuditLogPage } from "@/lib/auth/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserPage } from "@/lib/users/repository";
import { getSchoolDirectory } from "@/lib/users/organization";
import { getTeacherApprovalQueue } from "@/lib/users/teacher-approvals";

export const metadata: Metadata = { title: "관리자 센터" };
export const dynamic = "force-dynamic";

type AdminTab = "dashboard" | "users" | "approvals" | "audit" | "schools" | "roster";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/?login=1&callbackUrl=%2Fadmin");
  if (!canAccessAdminShell(user)) {
    return (
      <main className="access-page">
        <nav className="access-nav"><Link href="/" className="brand"><Logo size={29} /><span>pyxpad</span></Link></nav>
        <section className="access-card"><span className="access-icon"><LockKeyhole size={30} /></span><p className="access-eyebrow">ADMIN ACCESS</p><h1>관리자 권한이 필요합니다</h1><p className="access-description">전체관리자에게 필요한 작업 단위 권한을 요청해 주세요. 사용자 목록, 콘텐츠 운영, 감사 로그 권한은 각각 별도로 부여됩니다.</p><div className="access-actions"><Link className="button primary" href="/dashboard">내 패드로 돌아가기</Link></div></section>
      </main>
    );
  }

  // 교사는 대표 여부와 관계없이 자기 학교 학생 번호를 관리할 수 있습니다. 반/부서 구조 변경과
  // 학생 계정 발급·교사 승인은 아래의 대표교사 권한으로 계속 분리합니다.
  const isSchoolTeacher = user.role === "TEACHER" && user.school !== null;
  const isPureRepresentative = user.role === "TEACHER" && user.isSchoolRepresentative;
  const canViewUsers = hasSystemPermission(user, "VIEW_USERS") || isSchoolTeacher;
  const canManageSchoolGroups = user.role === "SUPER_ADMIN"
    || (user.role === "ADMIN" && hasSystemPermission(user, "CHANGE_NON_ADMIN_ROLES"))
    || isPureRepresentative;
  const canViewSchools = user.role === "SUPER_ADMIN"
    || (user.role === "ADMIN" && (hasSystemPermission(user, "VIEW_USERS") || canManageSchoolGroups))
    || isSchoolTeacher;
  const canManageRoster = user.role === "SUPER_ADMIN" || isPureRepresentative;
  const canViewAudit = hasSystemPermission(user, "VIEW_AUDIT_LOG");
  const canManageTeacherApprovals = user.role === "SUPER_ADMIN" || isPureRepresentative;
  const rawRequestedTab = (await searchParams).tab;
  const requestedTab = Array.isArray(rawRequestedTab) ? rawRequestedTab[0] : rawRequestedTab;
  let initialTab: AdminTab = canViewSchools
    ? "dashboard"
    : canViewUsers
      ? "users"
      : canManageTeacherApprovals
        ? "approvals"
        : canViewAudit
          ? "audit"
          : "schools";
  if ((requestedTab === "dashboard" || requestedTab === "academic") && canViewSchools) initialTab = "dashboard";
  if (requestedTab === "users" && canViewUsers) initialTab = "users";
  if (requestedTab === "approvals" && canManageTeacherApprovals) initialTab = "approvals";
  if (requestedTab === "roster" && canManageRoster) initialTab = "roster";
  if (requestedTab === "schools" && canViewSchools) initialTab = "schools";
  if (requestedTab === "audit" && canViewAudit) initialTab = "audit";
  const scopedSchoolId = isSchoolTeacher ? user.school!.id : null;
  const [userPage, auditPage, allSchools, teacherApprovals] = await Promise.all([
    canViewUsers
      ? getAdminUserPage({ page: 1, pageSize: 10, schoolId: scopedSchoolId ?? undefined })
      : Promise.resolve({ users: [], totalCount: 0, page: 1, pageSize: 10 }),
    canViewAudit ? getAuditLogPage({ limit: 25 }) : Promise.resolve({ logs: [], nextCursor: null }),
    canViewUsers || canViewSchools ? getSchoolDirectory() : Promise.resolve([]),
    canManageTeacherApprovals
      ? getTeacherApprovalQueue({ schoolId: scopedSchoolId ?? undefined, page: 1, pageSize: 20 })
      : Promise.resolve({ requests: [], totalCount: 0, page: 1, pageSize: 20 }),
  ]);
  const schools = scopedSchoolId
    ? allSchools.filter((school) => school.id === scopedSchoolId)
    : allSchools;

  return (
    <AdminConsole
      actor={{
        id: user.id,
        name: user.name,
        role: user.role,
        systemPermissions: user.systemPermissions,
        school: user.school,
        isSchoolRepresentative: user.isSchoolRepresentative,
      }}
      canViewUsers={canViewUsers}
      canViewSchools={canViewSchools}
      canManageSchoolGroups={canManageSchoolGroups}
      canManageRoster={canManageRoster}
      canViewAudit={canViewAudit}
      canManageTeacherApprovals={canManageTeacherApprovals}
      initialTab={initialTab}
      initialUsers={userPage.users}
      initialTotalCount={userPage.totalCount}
      initialPage={userPage.page}
      initialPageSize={userPage.pageSize}
      initialLogs={auditPage.logs}
      initialAuditCursor={auditPage.nextCursor}
      schools={schools}
      initialTeacherApprovals={teacherApprovals.requests}
      initialTeacherApprovalCount={teacherApprovals.totalCount}
      initialTeacherApprovalPage={teacherApprovals.page}
      initialTeacherApprovalPageSize={teacherApprovals.pageSize}
    />
  );
}
