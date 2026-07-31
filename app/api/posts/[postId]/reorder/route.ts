import { canEditPost, getEffectiveBoardAccess, isBoardFrozen, isBoardScopedPostEdit, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { positionBetween } from "@/lib/board/rank";
import { reorderSchema } from "@/lib/board/validators";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { postId } = await params;
    const parsed = reorderSchema.safeParse(await request.json());
    if (!parsed.success || !parsed.data.targetSectionId) return Response.json({ error: "정렬 정보가 올바르지 않습니다." }, { status: 400 });
    const prisma = getPrisma();
    const post = await prisma.post.findFirst({ where: { id: postId, deletedAt: null }, select: { boardId: true, authorId: true } });
    const target = await prisma.section.findFirst({ where: { id: parsed.data.targetSectionId, deletedAt: null }, select: { id: true, boardId: true } });
    if (!post || !target || post.boardId !== target.boardId) return Response.json({ error: "이동할 위치를 찾을 수 없습니다." }, { status: 404 });
    const access = await getEffectiveBoardAccess(post.boardId, user);
    if (!access || !canEditPost({ user, access, postAuthorId: post.authorId })) return Response.json({ error: "게시물 이동 권한이 없습니다." }, { status: 403 });
    if (isBoardFrozen(access)) return Response.json({ error: "동결된 패드에서는 게시물을 이동할 수 없습니다." }, { status: 409 });

    const items = await prisma.post.findMany({ where: { sectionId: target.id, deletedAt: null, id: { not: postId } }, orderBy: { position: "asc" }, select: { id: true, position: true } });
    let previous = parsed.data.previousItemId ? items.find((item) => item.id === parsed.data.previousItemId) : null;
    let next = parsed.data.nextItemId ? items.find((item) => item.id === parsed.data.nextItemId) : null;
    let position = positionBetween(previous?.position ?? null, next?.position ?? null);
    if (position === null) {
      await prisma.$transaction(items.map((item, index) => prisma.post.update({ where: { id: item.id }, data: { position: (index + 1) * 1024 } })));
      previous = parsed.data.previousItemId ? items.find((item) => item.id === parsed.data.previousItemId) : null;
      next = parsed.data.nextItemId ? items.find((item) => item.id === parsed.data.nextItemId) : null;
      const previousId = previous?.id;
      const nextId = next?.id;
      const previousIndex = previousId ? items.findIndex((item) => item.id === previousId) : -1;
      const nextIndex = nextId ? items.findIndex((item) => item.id === nextId) : -1;
      position = positionBetween(previousIndex >= 0 ? (previousIndex + 1) * 1024 : null, nextIndex >= 0 ? (nextIndex + 1) * 1024 : null);
    }
    await prisma.$transaction(async (tx) => {
      await tx.post.update({ where: { id: postId }, data: { sectionId: target.id, position: position ?? 1024, version: { increment: 1 } } });
      if (!isBoardScopedPostEdit(access, user.id, post.authorId)) {
        await tx.adminAuditLog.create({ data: createAuditLogData({
          actorId: user.id,
          action: "GLOBAL_POST_UPDATED",
          entityType: "Post",
          entityId: postId,
          after: { sectionId: target.id, operation: "reordered" },
        }) });
      }
    });
    publishBoardEvent(post.boardId, { type: "post.reordered", entityId: postId, sectionId: target.id, actorId: user.id });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "게시물을 이동하지 못했습니다.");
  }
}
