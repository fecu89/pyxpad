import "server-only";

import type { ReactNode } from "react";
import { AppSidebar, type SidebarRecentBoard, type SidebarUser } from "@/components/shell/app-sidebar";
import type { DashboardFolder } from "@/lib/dashboard/types";

// 홈 대시보드와 패드 페이지가 공유하는 앱 셸입니다. 대시보드에서는 ≥960px 고정 사이드바와
// 작은 화면용 드로어를 함께 제공하고, showSidebar=false인 패드 캔버스에서는 둘 다 렌더링하지
// 않습니다. 패드 자체의 상단 내비게이션만 남겨 콘텐츠 작성 화면을 방해하지 않게 합니다.
export function AppShell({
  children,
  recentBoards,
  folders,
  showSidebar = true,
  user,
  canAccessAdmin = false,
}: {
  children: ReactNode;
  recentBoards?: SidebarRecentBoard[];
  folders?: DashboardFolder[];
  showSidebar?: boolean;
  user?: SidebarUser;
  canAccessAdmin?: boolean;
}) {
  return (
    <div className="app-shell">
      {showSidebar && user ? (
        <AppSidebar recentBoards={recentBoards} folders={folders} user={user} canAccessAdmin={canAccessAdmin} />
      ) : null}
      <div className="app-shell-content">{children}</div>
    </div>
  );
}
