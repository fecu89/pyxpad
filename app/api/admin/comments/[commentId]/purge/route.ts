import { z } from "zod";
import { canPurgeComment, getEffectiveBoardAccess, isBoardScopedCommentModeration, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { removeStoredAttachmentFiles } from "@/lib/files/cleanup";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function DELETE(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { commentId } = await params;
    const prisma = getPrisma();
    const comment = await prisma.comment.findFirst({
      where: { id: commentId, deletedAt: { not: null } },
      select: {
        authorId: true,
        postId: true,
        deletedAt: true,
        post: { select: { boardId: true, deletedAt: true } },
        attachments: { select: { storagePath: true, thumbnailPath: true } },
      },
    });
    if (!comment?.deletedAt || comment.post.deletedAt) return Response.json({ error: "먼저 댓글을 삭제해 주세요." }, { status: 409 });
    const access = await getEffectiveBoardAccess(comment.post.boardId, user);
    if (!access || !canPurgeComment({ user, access, commentAuthorId: comment.authorId })) {
      return Response.json({ error: "댓글 영구 삭제 권한이 없습니다." }, { status: 403 });
    }
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "영구 삭제 사유를 3자 이상 입력해 주세요." }, { status: 400 });
    const boardScoped = isBoardScopedCommentModeration(access, user.id, comment.authorId);
    await prisma.$transaction(async (transaction) => {
      await transaction.comment.delete({ where: { id: commentId } });
      if (!boardScoped) {
        await transaction.adminAuditLog.create({ data: createAuditLogData({ actorId: user.id, action: "GLOBAL_ENTITY_PURGED", entityType: "Comment", entityId: commentId, reason: parsed.data.reason }) });
      }
    });
    const cleanup = await removeStoredAttachmentFiles(comment.attachments);
    return Response.json({ ok: true, purged: true, removedFiles: cleanup.removed, fileCleanupFailed: cleanup.failed });
  } catch (error) {
    return apiError(error, "댓글을 영구 삭제하지 못했습니다.");
  }
}
