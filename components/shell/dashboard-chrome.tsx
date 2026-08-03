import "server-only";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/current-user";
import { canAccessAdminShell, canCreateBoard as userCanCreateBoard } from "@/lib/auth/authorization";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AppShell } from "@/components/shell/app-shell";
import type { SidebarRecentBoard } from "@/components/shell/app-sidebar";
import { Brand } from "@/components/home/home-shell";
import { HomeAuthActionsProvider } from "@/components/home/home-actions";
import { CreateBoardActionsProvider, CreateBoardButton } from "@/components/home/create-board-actions";
import type { DashboardFolder } from "@/lib/dashboard/types";

// app/(dashboard)/layout.tsx가 로그인 사용자에게만 그리는 상주 셸입니다. 라우트가 바뀌어도
// (/dashboard, /favorites, /search, /profile, /folders/[id]) 이 컴포넌트는 다시 마운트되지 않으므로
// 사이드바·알림벨 SSE가 페이지 전환 중에도 끊기지 않습니다. 모바일에서만 보이는 브랜드는
// .home-nav .brand에 있고(≥960px에서는 사이드바 브랜드와 겹쳐 CSS로 숨김), 데스크탑 사이드바는
// AppShell이 그립니다.
export function DashboardChrome({
  user,
  recentBoards,
  folders,
  children,
}: {
  user: CurrentUser;
  recentBoards: SidebarRecentBoard[];
  folders: DashboardFolder[];
  children: ReactNode;
}) {
  const canCreate = userCanCreateBoard(user);
  const canAccessAdmin = canAccessAdminShell(user);

  let content = (
    <AppShell recentBoards={recentBoards} folders={folders} user={user} canAccessAdmin={canAccessAdmin}>
      <header className="home-nav">
        <Brand href="/dashboard" />
        <div className="nav-actions">
          <NotificationBell />
          {canCreate && <CreateBoardButton className="button primary"><Plus size={17} />새 패드</CreateBoardButton>}
        </div>
      </header>
      {children}
    </AppShell>
  );
  if (canCreate) content = <CreateBoardActionsProvider>{content}</CreateBoardActionsProvider>;
  // 사이드바 하단의 LogoutButton이 logout을 이 컨텍스트에서 받으므로 가장 바깥에 있어야 합니다.
  return <HomeAuthActionsProvider>{content}</HomeAuthActionsProvider>;
}
