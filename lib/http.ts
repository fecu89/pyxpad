import { AuthenticationError } from "@/lib/auth/current-user";
import { AuthorizationError } from "@/lib/auth/authorization";

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
  console.error(error);
  const message = error instanceof Error && isSafeToExposeMessage(error) ? error.message : fallback;
  return Response.json({ error: message }, { status: 400 });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!host) throw new AuthorizationError("요청 출처를 확인할 수 없습니다.");
  try {
    if (new URL(origin).host !== host) throw new AuthorizationError("허용되지 않은 요청 출처입니다.");
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new AuthorizationError("요청 출처를 확인할 수 없습니다.");
  }
}
