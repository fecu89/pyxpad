import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canCreateBoard as userCanCreateBoard, hasSystemPermission } from "@/lib/auth/authorization";
import { getDashboardHomeData } from "@/lib/dashboard/queries";
import { MyPadsView } from "@/components/home/my-pads-view";
import { DASHBOARD_PATH } from "@/lib/routes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 패드",
  description: "내가 만들거나 참여한 PyxPad 작업공간입니다.",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/?login=1&callbackUrl=${encodeURIComponent(DASHBOARD_PATH)}`);
  }

  const { myBoards, accessRequestBoards, dashboardFolders, templateBoards } = await getDashboardHomeData(user);
  return (
    <MyPadsView
      boards={myBoards}
      accessRequestBoards={accessRequestBoards}
      folders={dashboardFolders}
      templateBoards={templateBoards}
      viewerName={user.name?.split(" ")[0] || "나"}
      viewerRole={user.role}
      viewingAllBoards={hasSystemPermission(user, "VIEW_ALL_BOARDS")}
      canCreateBoard={userCanCreateBoard(user)}
    />
  );
}
