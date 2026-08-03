import { credentialLoginIdSchema } from "@/lib/auth/credentials";
import { registrationLoginIdAvailability } from "@/lib/auth/registration";
import { prepareLoginIdAvailabilityCheck } from "@/lib/auth/security";
import { apiError, assertSameOrigin } from "@/lib/http";
import { trustedClientIdentifier } from "@/lib/security/client-ip";

function response(body: Record<string, unknown>, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return Response.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = credentialLoginIdSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return response({ available: false, error: parsed.error.issues[0]?.message ?? "아이디를 확인해 주세요." }, { status: 400 });
    }
    const availability = await registrationLoginIdAvailability(parsed.data.loginId);
    const limit = await prepareLoginIdAvailabilityCheck(
      trustedClientIdentifier(request.headers),
      availability.loginIdentifierLookup,
    );
    if (!limit.allowed) {
      return response(
        { available: false, error: "확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(Math.min(limit.retryAfterSeconds, 300)) } },
      );
    }
    return response({
      available: availability.available,
      error: availability.available ? undefined : "이미 사용 중이거나 가입할 수 없는 아이디입니다.",
    });
  } catch (error) {
    return apiError(error, "아이디 사용 여부를 확인하지 못했습니다.");
  }
}
