import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDashboardHomeData } from "@/lib/dashboard/queries";
import { DashboardChrome } from "@/components/shell/dashboard-chrome";
import { DashboardLoading } from "@/components/shell/dashboard-loading";

export const dynamic = "force-dynamic";

// /, /favorites, /search, /profile, /folders/[folderId] 라우트가 공유하는 레이아웃입니다. Next.js는 라우트 이동 시 바뀐
// page.tsx 세그먼트만 다시 렌더링하고 이 layout은 그대로 유지하므로, 사이드바·상단바·알림벨 SSE가
// 페이지 전환 중에 끊기지 않습니다(이전에는 각 페이지가 독립적으로 AppShell을 그려서 라우트를
// 옮길 때마다 사이드바까지 통째로 다시 마운트됐습니다). 비로그인 사용자에게는 셸을 아예 그리지
// 않고 children(로그인 게이트, app/(dashboard)/page.tsx 참고)만 그대로 반환합니다.
//
// getCurrentUser/getDashboardHomeData는 React cache()로 감싸져 있어, 이 layout과 그 아래
// page.tsx가 같은 요청 안에서 각자 호출해도 실제 조회는 한 번만 일어납니다.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const { recentBoards, dashboardFolders } = await getDashboardHomeData(user);
  return (
    <DashboardChrome user={user} recentBoards={recentBoards} folders={dashboardFolders}>
      <Suspense fallback={<DashboardLoading />}>{children}</Suspense>
    </DashboardChrome>
  );
}
