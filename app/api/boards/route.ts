import { randomUUID } from "node:crypto";
import { canCreateBoard, requireActiveUser } from "@/lib/auth/authorization";
import { followBoard } from "@/lib/board/activity";
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
    if (!canCreateBoard(user)) return Response.json({ error: "교사 이상만 패드를 만들 수 있습니다." }, { status: 403 });
    const parsed = createBoardSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "패드 정보를 확인해 주세요." }, { status: 400 });
    const input = normalizeBoardAccessSettings(parsed.data);
    const board = await getPrisma().board.create({
      data: {
        ...input,
        description: input.description || null,
        ownerId: user.id,
        slug: makeSlug(parsed.data.title),
        members: { create: { userId: user.id, role: "OWNER" } },
        sections: {
          create: [
            { title: "아이디어", description: "자유롭게 생각을 나눠요.", position: 1024 },
            { title: "함께 알아봐요", description: "찾은 자료를 모아봐요.", position: 2048 },
            { title: "다음 행동", description: "작은 실천을 기록해요.", position: 3072 },
          ],
        },
      },
      select: { id: true, slug: true },
    });
    await followBoard(board.id, user.id);
    return Response.json({ board }, { status: 201 });
  } catch (error) {
    return apiError(error, "패드를 만들지 못했습니다.");
  }
}
