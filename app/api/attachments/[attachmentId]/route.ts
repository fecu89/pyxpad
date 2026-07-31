import { canDeleteComment, canEditPost, getEffectiveBoardAccess, isBoardFrozen, isBoardScopedPostEdit, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { attachmentMetadataSchema } from "@/lib/board/validators";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";

async function attachmentContext(attachmentId: string) {
  return getPrisma().attachment.findUnique({
    where: { id: attachmentId, deletedAt: null },
    select: {
      id: true,
      postId: true,
      commentId: true,
      type: true,
      post: { select: { boardId: true, authorId: true, deletedAt: true } },
      comment: { select: { authorId: true, deletedAt: true } },
    },
  });
}

function canManage(
  user: Awaited<ReturnType<typeof requireActiveUser>>,
  access: NonNullable<Awaited<ReturnType<typeof getEffectiveBoardAccess>>>,
  attachment: NonNullable<Awaited<ReturnType<typeof attachmentContext>>>,
) {
  if (attachment.comment) {
    return !attachment.comment.deletedAt && canDeleteComment({ user, access, commentAuthorId: attachment.comment.authorId });
  }
  return canEditPost({ user, access, postAuthorId: attachment.post.authorId });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { attachmentId } = await params;
    const attachment = await attachmentContext(attachmentId);
    if (!attachment || attachment.post.deletedAt) return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    const access = await getEffectiveBoardAccess(attachment.post.boardId, user);
    if (!access || !canManage(user, access, attachment)) return Response.json({ error: "첨부 설명 수정 권한이 없습니다." }, { status: 403 });
    if (isBoardFrozen(access)) return Response.json({ error: "동결된 패드에서는 첨부를 수정할 수 없습니다." }, { status: 409 });
    const parsed = attachmentMetadataSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "첨부 설명을 확인해 주세요." }, { status: 400 });
    const updated = await getPrisma().attachment.update({
      where: { id: attachmentId },
      data: {
        ...(attachment.type === "IMAGE" && parsed.data.altText !== undefined ? { altText: parsed.data.altText || null } : {}),
        ...(parsed.data.caption !== undefined ? { caption: parsed.data.caption || null } : {}),
      },
      select: { id: true, altText: true, caption: true },
    });
    publishBoardEvent(attachment.post.boardId, { type: "attachment.updated", entityId: attachmentId, postId: attachment.postId, actorId: user.id });
    return Response.json({ attachment: updated });
  } catch (error) {
    return apiError(error, "첨부 설명을 저장하지 못했습니다.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { attachmentId } = await params;
    const prisma = getPrisma();
    const attachment = await attachmentContext(attachmentId);
    if (!attachment || attachment.post.deletedAt) return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    const access = await getEffectiveBoardAccess(attachment.post.boardId, user);
    if (!access || !canManage(user, access, attachment)) return Response.json({ error: "파일 삭제 권한이 없습니다." }, { status: 403 });
    if (isBoardFrozen(access)) return Response.json({ error: "동결된 패드에서는 첨부를 삭제할 수 없습니다." }, { status: 409 });
    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.attachment.update({ where: { id: attachmentId }, data: { deletedAt } });
      if (!isBoardScopedPostEdit(access, user.id, attachment.post.authorId)) {
        await tx.adminAuditLog.create({
          data: createAuditLogData({
            actorId: user.id,
            action: "GLOBAL_POST_HIDDEN",
            entityType: "Attachment",
            entityId: attachmentId,
            before: { postId: attachment.postId, deletedAt: null },
            after: { postId: attachment.postId, deletedAt: deletedAt.toISOString() },
          }),
        });
      }
    });
    publishBoardEvent(attachment.post.boardId, { type: "attachment.deleted", entityId: attachmentId, postId: attachment.postId, actorId: user.id });
    return Response.json({ ok: true, archived: true });
  } catch (error) {
    return apiError(error, "파일을 삭제하지 못했습니다.");
  }
}
