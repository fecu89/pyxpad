import { requireActiveUser } from "@/lib/auth/authorization";
import { apiError, assertSameOrigin } from "@/lib/http";
import { isNicknameAvailable, nicknameSchema } from "@/lib/users/nickname";

function response(body: Record<string, unknown>, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const parsed = nicknameSchema.safeParse((await request.json().catch(() => null) as { name?: unknown } | null)?.name);
    if (!parsed.success) {
      return response({ available: false, error: parsed.error.issues[0]?.message ?? "닉네임을 확인해 주세요." }, { status: 400 });
    }
    const result = await isNicknameAvailable(parsed.data, user.id);
    return response({
      available: result.available,
      normalized: result.normalized,
      error: result.available ? undefined : "이미 사용 중인 닉네임입니다.",
    });
  } catch (error) {
    return apiError(error, "닉네임 사용 여부를 확인하지 못했습니다.");
  }
}
