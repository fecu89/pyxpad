import { getCurrentUser } from "@/lib/auth/current-user";
import { safeInternalCallbackUrl } from "@/lib/auth/page-guard";
import { getDashboardHomeData } from "@/lib/dashboard/queries";
import { canCreateBoard as userCanCreateBoard, hasSystemPermission } from "@/lib/auth/authorization";
import { HomeAccessGate } from "@/components/home/home-shell";
import { MyPadsView } from "@/components/home/my-pads-view";
import { HomeAuthActionsProvider } from "@/components/home/home-actions";

export const dynamic = "force-dynamic";

function authErrorMessage(error: string | string[] | undefined) {
  const value = Array.isArray(error) ? error[0] : error;
  if (!value) return null;
  if (value === "AccessDenied") return "카카오 계정의 이메일 제공 동의가 필요합니다.";
  return "카카오 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

type HomeSearchParams = {
  error?: string | string[];
  login?: string | string[];
  callbackUrl?: string | string[];
};

export default async function HomePage({ searchParams }: { searchParams: Promise<HomeSearchParams> }) {
  const user = await getCurrentUser();
  if (!user) {
    const params = await searchParams;
    const login = Array.isArray(params.login) ? params.login[0] : params.login;
    return (
      <HomeAuthActionsProvider
        authError={authErrorMessage(params.error)}
        initialLoginOpen={login === "1"}
        loginCallbackUrl={safeInternalCallbackUrl(params.callbackUrl)}
      >
        <HomeAccessGate />
      </HomeAuthActionsProvider>
    );
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
