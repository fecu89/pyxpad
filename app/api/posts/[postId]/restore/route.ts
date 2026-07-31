import { canModeratePost, getEffectiveBoardAccess, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { postId } = await params;
    const prisma = getPrisma();
    const post = await prisma.post.findFirst({ where: { id: postId, deletedAt: { not: null }, board: { deletedAt: null } }, select: { id: true, boardId: true, sectionId: true, authorId: true, deletedAt: true } });
    if (!post?.deletedAt) return Response.json({ error: "숨김 처리된 게시물을 찾을 수 없습니다." }, { status: 404 });
    if (Date.now() - post.deletedAt.getTime() > RETENTION_MS) return Response.json({ error: "게시물 복구 기간이 지났습니다." }, { status: 409 });
    const access = await getEffectiveBoardAccess(post.boardId, user);
    if (!access || !canModeratePost({ user, access, postAuthorId: post.authorId })) return Response.json({ error: "게시물 복구 권한이 없습니다." }, { status: 403 });
    const boardScoped = !!access.role && (["OWNER", "ADMIN", "EDITOR"].includes(access.role) || user.id === post.authorId);
    await prisma.$transaction(async (transaction) => {
      await transaction.post.update({ where: { id: postId }, data: { deletedAt: null, version: { increment: 1 } } });
      await transaction.attachment.updateMany({ where: { postId }, data: { deletedAt: null } });
      if (!boardScoped) {
        await transaction.adminAuditLog.create({ data: createAuditLogData({ actorId: user.id, action: "GLOBAL_POST_RESTORED", entityType: "Post", entityId: postId, reason: "전역 권한으로 게시물 복구" }) });
      }
    });
    publishBoardEvent(post.boardId, { type: "post.updated", entityId: postId, sectionId: post.sectionId, actorId: user.id });
    return Response.json({ ok: true, restored: true });
  } catch (error) {
    return apiError(error, "게시물을 복구하지 못했습니다.");
  }
}
