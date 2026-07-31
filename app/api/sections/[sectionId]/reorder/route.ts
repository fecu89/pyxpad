import { canManageBoardSettings, getEffectiveBoardAccess, isBoardFrozen, isBoardScopedManagement, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { positionBetween } from "@/lib/board/rank";
import { reorderSchema } from "@/lib/board/validators";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";

export async function POST(request: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { sectionId } = await params;
    const parsed = reorderSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "정렬 정보가 올바르지 않습니다." }, { status: 400 });
    const prisma = getPrisma();
    const section = await prisma.section.findFirst({ where: { id: sectionId, deletedAt: null }, select: { boardId: true } });
    if (!section) return Response.json({ error: "섹션을 찾을 수 없습니다." }, { status: 404 });
    const access = await getEffectiveBoardAccess(section.boardId, user);
    if (!access || !canManageBoardSettings(user, access)) return Response.json({ error: "정렬 권한이 없습니다." }, { status: 403 });
    if (isBoardFrozen(access)) return Response.json({ error: "동결된 패드에서는 섹션을 이동할 수 없습니다." }, { status: 409 });

    const all = await prisma.section.findMany({ where: { boardId: section.boardId, deletedAt: null }, orderBy: { position: "asc" }, select: { id: true, position: true } });
    const without = all.filter((item) => item.id !== sectionId);
    const previous = parsed.data.previousItemId ? without.find((item) => item.id === parsed.data.previousItemId) : null;
    const next = parsed.data.nextItemId ? without.find((item) => item.id === parsed.data.nextItemId) : null;
    let position = positionBetween(previous?.position ?? null, next?.position ?? null);
    if (position === null) {
      await prisma.$transaction(without.map((item, index) => prisma.section.update({ where: { id: item.id }, data: { position: (index + 1) * 1024 } })));
      const prevIndex = previous ? without.findIndex((item) => item.id === previous.id) : -1;
      const nextIndex = next ? without.findIndex((item) => item.id === next.id) : -1;
      position = positionBetween(prevIndex >= 0 ? (prevIndex + 1) * 1024 : null, nextIndex >= 0 ? (nextIndex + 1) * 1024 : null);
    }
    await prisma.$transaction(async (tx) => {
      await tx.section.update({ where: { id: sectionId }, data: { position: position ?? 1024, version: { increment: 1 } } });
      if (!isBoardScopedManagement(access)) {
        await tx.adminAuditLog.create({ data: createAuditLogData({
          actorId: user.id,
          action: "GLOBAL_BOARD_UPDATED",
          entityType: "Section",
          entityId: sectionId,
          after: { boardId: section.boardId, operation: "reordered" },
        }) });
      }
    });
    publishBoardEvent(section.boardId, { type: "section.reordered", entityId: sectionId, sectionId, actorId: user.id });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "섹션을 정렬하지 못했습니다.");
  }
}
