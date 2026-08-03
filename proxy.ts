import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DASHBOARD_PATH, PUBLIC_HOME_PATH } from "@/lib/routes";
import { createRateLimiter } from "@/lib/security/rate-limit-core";
import { rateLimitIdentity } from "@/lib/security/request-identity";

const ONBOARDING_PATH = "/onboarding";
const APPROVAL_PENDING_PATH = "/approval-pending";
const PASSWORD_CHANGE_PATH = "/change-password";

// 모든 쓰기 API의 공통 백스톱입니다. 라우트별 좁은 제한(lib/security/rate-limit.ts의
// assertRateLimit)과 별개로, 어떤 경로든 한 계정이 분당 이 횟수를 넘겨 쓰지 못하게 막습니다.
// 정상 사용(설정 자동저장·드래그 정렬·반응 연타·첨부 업로드)의 최대치보다 넉넉하게 잡아
// 사람의 조작은 절대 걸리지 않고 스크립트 남용만 걸리는 값입니다.
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const writeLimiter = createRateLimiter({ windowMs: 60_000, maxAttempts: 200 });

// 이 프로젝트는 별도 리버스 프록시 쪽 보안 헤더 설정이 없어서, XSS·클릭재킹 방어의 마지막
// 방어선인 응답 헤더가 여기서 정해집니다(전체관리자 게시물·댓글이 저장형 XSS의 표적이 될 수
// 있는 서비스 특성상, react-markdown/rehype-sanitize와 파일 업로드 검증만으로 끝내지 않습니다).
//
// script-src는 'unsafe-inline' 대신 요청마다 새로 만드는 nonce를 씁니다. Next.js는 요청 헤더의
// Content-Security-Policy에서 nonce를 읽어 자기가 주입하는 인라인 부트스트랩·플라이트 스크립트에
// 자동으로 붙이고, 우리 인라인 스크립트(app/layout.tsx의 테마 초기화)는 x-nonce 헤더를 읽어
// 직접 붙입니다. 'unsafe-inline'을 뒤에 남겨두는 건 nonce를 이해하지 못하는 아주 오래된
// 브라우저용 폴백입니다 — nonce가 있으면 최신 브라우저는 'unsafe-inline'을 무시합니다.
// img-src는 링크 미리보기 썸네일이 임의의 외부 호스트에서 올 수 있어 https: 전체를 허용합니다
// (img 태그는 스크립트를 실행하지 않으므로 XSS 위험은 없음). 개발 모드는 Next의 webpack
// eval 기반 소스맵·HMR이 'unsafe-eval' 없이는 콘솔 에러를 내므로 프로덕션에서만 뺍니다.
function contentSecurityPolicy(nonce: string, isDev: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://static.cloudflareinsights.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");
}

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

type RequestContext = { nonce: string; csp: string };

function applySecurityHeaders(response: NextResponse, context: RequestContext) {
  response.headers.set("Content-Security-Policy", context.csp);
  return response;
}

// NextResponse.next()는 요청 헤더를 다시 넘겨야 Next.js가 nonce를 인식하고, 서버 컴포넌트가
// headers()로 x-nonce를 읽을 수 있습니다.
function passThrough(request: NextRequest, context: RequestContext) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", context.nonce);
  requestHeaders.set("Content-Security-Policy", context.csp);
  return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), context);
}

function redirect(url: URL, context: RequestContext) {
  return applySecurityHeaders(NextResponse.redirect(url), context);
}

function json(body: unknown, init: ResponseInit, context: RequestContext) {
  return applySecurityHeaders(NextResponse.json(body, init), context);
}

function isSharedOnboardingApi(pathname: string) {
  return pathname === "/api/me/avatar"
    || pathname === "/api/me/nickname-availability"
    || pathname.startsWith("/api/auth/")
    || /^\/api\/users\/[a-z0-9-]+\/avatar$/i.test(pathname);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const nonce = createNonce();
  const context: RequestContext = {
    nonce,
    csp: contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production"),
  };
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const userId = typeof token?.userId === "string" ? token.userId : null;

  // 인증 경로는 자체 DB 기반 제한(lib/auth/security.ts)이 이미 훨씬 촘촘하게 걸려 있으므로
  // 여기서 두 번 세지 않습니다. 그 외 모든 쓰기 API에 계정(또는 신뢰 가능한 IP) 단위 상한을 겁니다.
  if (WRITE_METHODS.has(request.method) && pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    const identity = rateLimitIdentity(request.headers, userId);
    if (identity) {
      const decision = writeLimiter.check(identity);
      if (!decision.allowed) {
        return json(
          { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
          { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(decision.retryAfterSeconds) } },
          context,
        );
      }
    }
  }

  const state = token?.onboardingState
    ?? (token?.onboardingCompleted === false ? "PROFILE" : "COMPLETE");
  const onboardingIncomplete = userId !== null && state !== "COMPLETE";
  const passwordChangeRequired = userId !== null && token?.passwordChangeRequired === true;

  if (pathname === PASSWORD_CHANGE_PATH) {
    if (!userId) {
      const loginUrl = new URL(PUBLIC_HOME_PATH, request.url);
      loginUrl.searchParams.set("login", "1");
      loginUrl.searchParams.set("callbackUrl", PASSWORD_CHANGE_PATH);
      return redirect(loginUrl, context);
    }
    if (!passwordChangeRequired) return redirect(new URL(DASHBOARD_PATH, request.url), context);
    return passThrough(request, context);
  }

  if (passwordChangeRequired) {
    if (pathname.startsWith("/api/auth/") || pathname === "/api/me/password") return passThrough(request, context);
    if (pathname.startsWith("/api/")) {
      return json(
        { error: "새 비밀번호를 먼저 설정해 주세요.", passwordChangeRequired: true },
        { status: 428 },
        context,
      );
    }
    const passwordUrl = new URL(PASSWORD_CHANGE_PATH, request.url);
    passwordUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return redirect(passwordUrl, context);
  }

  if (pathname === ONBOARDING_PATH) {
    if (!userId) {
      const loginUrl = new URL(PUBLIC_HOME_PATH, request.url);
      loginUrl.searchParams.set("login", "1");
      loginUrl.searchParams.set("callbackUrl", ONBOARDING_PATH);
      return redirect(loginUrl, context);
    }
    if (!onboardingIncomplete) return redirect(new URL(DASHBOARD_PATH, request.url), context);
    if (state === "TEACHER_PENDING") {
      const pendingUrl = new URL(APPROVAL_PENDING_PATH, request.url);
      pendingUrl.search = request.nextUrl.search;
      return redirect(pendingUrl, context);
    }
    return passThrough(request, context);
  }

  if (pathname === APPROVAL_PENDING_PATH) {
    if (!userId) {
      const loginUrl = new URL(PUBLIC_HOME_PATH, request.url);
      loginUrl.searchParams.set("login", "1");
      loginUrl.searchParams.set("callbackUrl", APPROVAL_PENDING_PATH);
      return redirect(loginUrl, context);
    }
    if (!onboardingIncomplete) return redirect(new URL(DASHBOARD_PATH, request.url), context);
    if (state !== "TEACHER_PENDING") {
      const onboardingUrl = new URL(ONBOARDING_PATH, request.url);
      onboardingUrl.search = request.nextUrl.search;
      return redirect(onboardingUrl, context);
    }
    return passThrough(request, context);
  }

  if (!onboardingIncomplete || pathname === PUBLIC_HOME_PATH) return passThrough(request, context);
  if (isSharedOnboardingApi(pathname)) return passThrough(request, context);
  if (state === "PROFILE" && pathname === "/api/onboarding") return passThrough(request, context);
  if (pathname.startsWith("/api/")) {
    return json(
      {
        error: state === "TEACHER_PENDING"
          ? "교사 가입 승인 후 이용할 수 있습니다."
          : "가입 정보를 먼저 완료해 주세요.",
        onboardingRequired: true,
        teacherApprovalPending: state === "TEACHER_PENDING",
      },
      { status: 428 },
      context,
    );
  }
  const destinationUrl = new URL(
    state === "TEACHER_PENDING" ? APPROVAL_PENDING_PATH : ONBOARDING_PATH,
    request.url,
  );
  destinationUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return redirect(destinationUrl, context);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon/|icon.png|apple-icon.png|manifest.webmanifest|logo.svg).*)",
  ],
};
