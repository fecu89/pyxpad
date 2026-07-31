import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ONBOARDING_PATH = "/onboarding";
const APPROVAL_PENDING_PATH = "/approval-pending";

function isSharedOnboardingApi(pathname: string) {
  return pathname === "/api/me/avatar"
    || pathname.startsWith("/api/auth/")
    || /^\/api\/users\/[a-z0-9-]+\/avatar$/i.test(pathname);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const userId = typeof token?.userId === "string" ? token.userId : null;
  const state = token?.onboardingState
    ?? (token?.onboardingCompleted === false ? "PROFILE" : "COMPLETE");
  const onboardingIncomplete = userId !== null && state !== "COMPLETE";

  if (pathname === ONBOARDING_PATH) {
    if (!userId) {
      const loginUrl = new URL("/", request.url);
      loginUrl.searchParams.set("login", "1");
      loginUrl.searchParams.set("callbackUrl", ONBOARDING_PATH);
      return NextResponse.redirect(loginUrl);
    }
    if (!onboardingIncomplete) return NextResponse.redirect(new URL("/", request.url));
    if (state === "TEACHER_PENDING") {
      const pendingUrl = new URL(APPROVAL_PENDING_PATH, request.url);
      pendingUrl.search = request.nextUrl.search;
      return NextResponse.redirect(pendingUrl);
    }
    return NextResponse.next();
  }

  if (pathname === APPROVAL_PENDING_PATH) {
    if (!userId) {
      const loginUrl = new URL("/", request.url);
      loginUrl.searchParams.set("login", "1");
      loginUrl.searchParams.set("callbackUrl", APPROVAL_PENDING_PATH);
      return NextResponse.redirect(loginUrl);
    }
    if (!onboardingIncomplete) return NextResponse.redirect(new URL("/", request.url));
    if (state !== "TEACHER_PENDING") {
      const onboardingUrl = new URL(ONBOARDING_PATH, request.url);
      onboardingUrl.search = request.nextUrl.search;
      return NextResponse.redirect(onboardingUrl);
    }
    return NextResponse.next();
  }

  if (!onboardingIncomplete) return NextResponse.next();
  if (isSharedOnboardingApi(pathname)) return NextResponse.next();
  if (state === "PROFILE" && pathname === "/api/onboarding") return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return Response.json(
      {
        error: state === "TEACHER_PENDING"
          ? "교사 가입 승인 후 이용할 수 있습니다."
          : "가입 정보를 먼저 완료해 주세요.",
        onboardingRequired: true,
        teacherApprovalPending: state === "TEACHER_PENDING",
      },
      { status: 428 },
    );
  }
  const destinationUrl = new URL(
    state === "TEACHER_PENDING" ? APPROVAL_PENDING_PATH : ONBOARDING_PATH,
    request.url,
  );
  destinationUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(destinationUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon/|icon.png|apple-icon.png|manifest.webmanifest|logo.svg).*)",
  ],
};
