import { canEditPost, getEffectiveBoardAccess, isBoardScopedPostEdit, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";

const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

export async function POST(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { attachmentId } = await params;
    const prisma = getPrisma();
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        postId: true,
        deletedAt: true,
        post: { select: { boardId: true, authorId: true, deletedAt: true } },
      },
    });
    if (!attachment?.deletedAt || attachment.post.deletedAt) {
      return Response.json({ error: "복구할 파일을 찾을 수 없습니다." }, { status: 404 });
    }
    if (Date.now() - attachment.deletedAt.getTime() > RESTORE_WINDOW_MS) {
      return Response.json({ error: "30일 복구 기간이 지났습니다." }, { status: 410 });
    }
    const previousDeletedAt = attachment.deletedAt;
    const access = await getEffectiveBoardAccess(attachment.post.boardId, user);
    if (!access || !canEditPost({ user, access, postAuthorId: attachment.post.authorId })) {
      return Response.json({ error: "파일 복구 권한이 없습니다." }, { status: 403 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.attachment.update({ where: { id: attachmentId }, data: { deletedAt: null } });
      if (!isBoardScopedPostEdit(access, user.id, attachment.post.authorId)) {
        await tx.adminAuditLog.create({
          data: createAuditLogData({
            actorId: user.id,
            action: "GLOBAL_POST_RESTORED",
            entityType: "Attachment",
            entityId: attachmentId,
            before: { postId: attachment.postId, deletedAt: previousDeletedAt.toISOString() },
            after: { postId: attachment.postId, deletedAt: null },
          }),
        });
      }
    });
    publishBoardEvent(attachment.post.boardId, { type: "attachment.created", entityId: attachmentId, postId: attachment.postId, actorId: user.id });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "파일을 복구하지 못했습니다.");
  }
}
