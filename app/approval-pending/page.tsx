import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ApprovalPendingExperience } from "@/components/onboarding/approval-pending-experience";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeInternalCallbackUrl } from "@/lib/auth/page-guard";
import { getTeacherApprovalForUser } from "@/lib/users/teacher-approvals";
import { DASHBOARD_PATH } from "@/lib/routes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "교사 가입 승인 대기",
  description: "학교 관리자가 교사 가입 요청을 확인하고 있습니다.",
  robots: { index: false, follow: false },
};

export default async function ApprovalPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/?login=1&callbackUrl=%2Fapproval-pending");
  const [request, params] = await Promise.all([
    getTeacherApprovalForUser(user.id),
    searchParams,
  ]);
  const candidateNextPath = safeInternalCallbackUrl(params.next, DASHBOARD_PATH);
  const nextPath = candidateNextPath.startsWith("/onboarding")
    || candidateNextPath.startsWith("/approval-pending")
    ? DASHBOARD_PATH
    : candidateNextPath;

  if (user.onboardingCompletedAt) redirect(nextPath);
  if (!request || request.status !== "PENDING") {
    redirect(`/onboarding?next=${encodeURIComponent(nextPath)}`);
  }

  return (
    <ApprovalPendingExperience
      name={user.name}
      loginIdentifier={user.loginIdentifier}
      image={user.image}
      schoolName={request.school.name}
      departmentName={request.schoolGroup.name}
      requestedAtLabel={new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Seoul",
      }).format(new Date(request.requestedAt))}
      nextPath={nextPath}
    />
  );
}
