import { redirect } from "next/navigation";
import { getMetadata } from "@/utils/seo/getMetadata";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeInternalCallbackUrl } from "@/lib/auth/callback-url";
import { DASHBOARD_PATH } from "@/lib/routes";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata = getMetadata({
  title: "함께 만드는 수업 패드",
  description: "학생의 생각과 수업 자료를 한곳에 모으고 함께 발전시키는 교육용 협업 패드, PyxPad입니다.",
  asPath: "/",
  keywords: ["수업 협업", "학급 게시판", "교육용 패드"],
});

type LandingSearchParams = {
  error?: string | string[];
  login?: string | string[];
  callbackUrl?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function authErrorMessage(error: string | undefined) {
  if (!error) return null;
  if (error === "AccessDenied") return "카카오 계정의 이메일 제공 동의가 필요합니다.";
  return "카카오 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export default async function PublicHomePage({
  searchParams,
}: {
  searchParams: Promise<LandingSearchParams>;
}) {
  const params = await searchParams;
  const callbackUrl = safeInternalCallbackUrl(params.callbackUrl, DASHBOARD_PATH);
  // 이미 로그인한 사용자가 관리자 콘솔 등에서 홈 로고를 눌러 "/"로 오면, 이 페이지는 로그인
  // 여부를 모르고 항상 "로그인" 버튼을 보여주는 마케팅 화면이라 로그아웃된 것처럼 보였습니다.
  // 실제 세션은 그대로이므로, 로그인 상태라면 원래 가려던 곳(callbackUrl)이나 내 패드로 보냅니다.
  const currentUser = await getCurrentUser();
  if (currentUser) redirect(callbackUrl);
  return (
    <LandingPage
      authError={authErrorMessage(first(params.error))}
      initialLoginOpen={first(params.login) === "1"}
      loginCallbackUrl={callbackUrl}
    />
  );
}
