import { AuthenticationError } from "@/lib/auth/current-user";
import { AuthorizationError } from "@/lib/auth/authorization";
import { ImageProcessingBusyError } from "@/lib/files/processing-queue";
import { RateLimitError } from "@/lib/security/rate-limit";

// 이 이름의 생성자는 우리가 직접 던지지 않는 에러입니다 — Prisma 내부 에러(필드·제약조건 이름을
// 드러낼 수 있음)와 버그로 발생하는 런타임 에러(TypeError 등, 내부 변수·속성명을 드러낼 수 있음)는
// 라우트가 fallback 문자열로 던진 게 아니므로 메시지를 그대로 클라이언트에 보여주면 안 됩니다.
const UNSAFE_ERROR_NAMES = new Set(["TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError"]);

function isSafeToExposeMessage(error: Error) {
  const name = error.constructor?.name || error.name;
  if (name.startsWith("PrismaClient")) return false;
  return !UNSAFE_ERROR_NAMES.has(name);
}

export function apiError(error: unknown, fallback: string) {
  if (error instanceof AuthenticationError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  // 제한 초과는 서버 오류가 아니라 정상적인 거절이므로 스택을 로그로 남기지 않습니다.
  if (error instanceof RateLimitError) {
    return Response.json(
      { error: error.message },
      { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(error.retryAfterSeconds) } },
    );
  }
  // 이미지 처리 대기열이 꽉 찬 상태도 서버 버그가 아니라 일시적 과부하이므로 503으로 알립니다.
  if (error instanceof ImageProcessingBusyError) {
    return Response.json(
      { error: error.message },
      { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "10" } },
    );
  }
  console.error(error);
  const message = error instanceof Error && isSafeToExposeMessage(error) ? error.message : fallback;
  return Response.json({ error: message }, { status: 400 });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    // 자체 호스팅에서는 Next가 request.url을 내부 주소(localhost:3001)로 구성할 수 있으므로,
    // 외부에서 실제로 허용할 origin을 환경별로 명시합니다. 전체 origin을 비교해 프로토콜과
    // 포트까지 일치시키며, 클라이언트가 위조할 수 있는 전달 헤더에 의존하지 않습니다.
    const configuredOrigins = process.env.APP_ORIGINS
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => new URL(value).origin);
    if (configuredOrigins?.length) {
      if (!configuredOrigins.includes(new URL(origin).origin)) {
        throw new AuthorizationError("허용되지 않은 요청 출처입니다.");
      }
      return;
    }

    // 공개 인터넷에서 X-Forwarded-Host를 그대로 믿으면 공격자가 Origin과 둘을 함께 위조할 수
    // 있습니다. Vercel이 덮어쓰는 헤더만 예외로 사용하고, 그 외 배포는 실제 요청 URL을 기준으로
    // 비교합니다. APP_ORIGINS가 없는 자체 프록시는 외부 Host를 원본 요청 URL에 보존해야 합니다.
    const forwardedHost = process.env.VERCEL === "1"
      ? request.headers.get("x-forwarded-host")?.split(",").at(-1)?.trim()
      : null;
    const host = forwardedHost || new URL(request.url).host;
    if (!host) throw new AuthorizationError("요청 출처를 확인할 수 없습니다.");
    if (new URL(origin).host !== host) throw new AuthorizationError("허용되지 않은 요청 출처입니다.");
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new AuthorizationError("요청 출처를 확인할 수 없습니다.");
  }
}
