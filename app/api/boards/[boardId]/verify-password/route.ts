import { z } from "zod";
import { markBoardPasswordVerified, verifyBoardPassword } from "@/lib/board/board-password";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { clientIp, createRateLimiter } from "@/lib/security/rate-limit";

const schema = z.object({ password: z.string().min(1) });

// 이 엔드포인트는 로그인 여부와 무관하게 호출되므로(비밀번호로만 보호된 보드), userId 대신
// IP+boardId로 시도 횟수를 제한합니다.
const rateLimiter = createRateLimiter({ windowMs: 10 * 60_000, maxAttempts: 8 });

export async function POST(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    assertSameOrigin(request);
    const { boardId } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "비밀번호를 입력해 주세요." }, { status: 400 });

    if (!rateLimiter.consume(`${clientIp(request)}:${boardId}`)) {
      return Response.json(
        { error: "비밀번호 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    }

    const board = await getPrisma().board.findFirst({
      where: { id: boardId, deletedAt: null },
      select: { passwordHash: true },
    });
    if (!board) return Response.json({ error: "패드를 찾을 수 없습니다." }, { status: 404 });
    if (!board.passwordHash) return Response.json({ ok: true });
    if (!verifyBoardPassword(parsed.data.password, board.passwordHash)) {
      return Response.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 403 });
    }
    await markBoardPasswordVerified(boardId);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "비밀번호를 확인하지 못했습니다.");
  }
}
