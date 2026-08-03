import { randomUUID } from "node:crypto";
import { canCreateBoard, requireActiveUser } from "@/lib/auth/authorization";
import { followBoard } from "@/lib/board/activity";
import { assertCanOwnAnotherBoard, BoardOwnershipLimitError } from "@/lib/board/ownership-limit";
import { createBoardSchema, normalizeBoardAccessSettings } from "@/lib/board/validators";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";

function makeSlug(title: string) {
  const base = title.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "board";
  return `${base}-${randomUUID().slice(0, 6)}`;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    if (!canCreateBoard(user)) return Response.json({ error: "패드를 만들 권한이 없습니다." }, { status: 403 });
    const parsed = createBoardSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "패드 정보를 확인해 주세요." }, { status: 400 });
    const input = normalizeBoardAccessSettings(parsed.data);
    const board = await getPrisma().$transaction(async (tx) => {
      await assertCanOwnAnotherBoard(tx, user);
      return tx.board.create({
        data: {
          ...input,
          description: input.description || null,
          ownerId: user.id,
          slug: makeSlug(parsed.data.title),
          members: { create: { userId: user.id, role: "OWNER" } },
        },
        select: { id: true, slug: true },
      });
    });
    await followBoard(board.id, user.id);
    return Response.json({ board }, { status: 201 });
  } catch (error) {
    if (error instanceof BoardOwnershipLimitError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return apiError(error, "패드를 만들지 못했습니다.");
  }
}
