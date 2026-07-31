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
        <section className="access-card"><span className="access-icon"><LockKeyhole size={30} /></span><p className="access-eyebrow">ADMIN ACCESS</p><h1>관리자 권한이 필요합니다</h1><p className="access-description">전체관리자에게 필요한 작업 단위 권한을 요청해 주세요. 사용자 목록, 콘텐츠 운영, 감사 로그 권한은 각각 별도로 부여됩니다.</p><div className="access-actions"><Link className="button primary" href="/">내 패드로 돌아가기</Link></div></section>
      </main>
    );
  }

  // "순수 대표교사"(ADMIN·SUPER_ADMIN이 아닌, TEACHER+isSchoolRepresentative만)는 VIEW_USERS
  // 권한이 없어도 사용자 목록에 들어올 수 있지만, 자기 학교 하나로만 화면을 스코프합니다.
  const isPureRepresentative = user.role === "TEACHER" && user.isSchoolRepresentative;
  const canViewUsers = hasSystemPermission(user, "VIEW_USERS") || isPureRepresentative;
  const canViewAudit = hasSystemPermission(user, "VIEW_AUDIT_LOG");
  const canManageTeacherApprovals = user.role === "SUPER_ADMIN" || isPureRepresentative;
  const requestedTab = (await searchParams).tab;
  const initialTab = requestedTab === "approvals" && canManageTeacherApprovals
    ? "approvals"
    : canViewUsers
      ? "users"
      : canManageTeacherApprovals
        ? "approvals"
        : canViewAudit
          ? "audit"
          : "schools";
  const representativeSchoolId = isPureRepresentative ? (user.school?.id ?? null) : null;
  const [userPage, auditPage, allSchools, teacherApprovals] = await Promise.all([
    canViewUsers
      ? getAdminUserPage({ page: 1, pageSize: 10, schoolId: representativeSchoolId ?? undefined })
      : Promise.resolve({ users: [], totalCount: 0, page: 1, pageSize: 10 }),
    canViewAudit ? getAuditLogPage({ limit: 25 }) : Promise.resolve({ logs: [], nextCursor: null }),
    canViewUsers ? getSchoolDirectory() : Promise.resolve([]),
    canManageTeacherApprovals
      ? getTeacherApprovalQueue({ schoolId: representativeSchoolId ?? undefined, page: 1, pageSize: 20 })
      : Promise.resolve({ requests: [], totalCount: 0, page: 1, pageSize: 20 }),
  ]);
  const schools = representativeSchoolId
    ? allSchools.filter((school) => school.id === representativeSchoolId)
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
