import {
  canEditPost,
  canModeratePost,
  getEffectiveBoardAccess,
  isBoardFrozen,
  requireActiveUser,
} from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { recordBoardActivity } from "@/lib/board/activity";
import { updatePostSchema } from "@/lib/board/validators";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";
import { defaultPostFieldConfig } from "@/lib/post-fields/defaults";
import { parsePostFieldConfig, validatePostFieldSubmission, validateSystemPostFields, PostFieldValidationError } from "@/lib/post-fields/validation";

async function postAccess(postId: string, user: Awaited<ReturnType<typeof requireActiveUser>>) {
  const post = await getPrisma().post.findFirst({ where: { id: postId, deletedAt: null }, select: { id: true, boardId: true, sectionId: true, authorId: true, title: true, body: true, customFieldValues: true, board: { select: { postFieldConfig: true } } } });
  if (!post) return null;
  const access = await getEffectiveBoardAccess(post.boardId, user);
  return access ? { post, access } : null;
}

function boardScopedEdit(role: string | null, userId: string, authorId: string) {
  return !!role && (["OWNER", "ADMIN", "EDITOR"].includes(role) || userId === authorId);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { postId } = await params;
    const parsed = updatePostSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "게시물 정보를 확인해 주세요." }, { status: 400 });
    const resolved = await postAccess(postId, user);
    if (!resolved) return Response.json({ error: "게시물을 찾을 수 없습니다." }, { status: 404 });
    if (!canEditPost({ user, access: resolved.access, postAuthorId: resolved.post.authorId })) return Response.json({ error: "게시물 수정 권한이 없습니다." }, { status: 403 });
    if (isBoardFrozen(resolved.access)) return Response.json({ error: "동결된 패드에서는 게시물을 수정할 수 없습니다." }, { status: 409 });
    const globalOverride = !boardScopedEdit(resolved.access.role, user.id, resolved.post.authorId);
    const fieldConfig = parsePostFieldConfig(resolved.post.board.postFieldConfig ?? defaultPostFieldConfig);
    const attachmentCount = await getPrisma().attachment.count({ where: { postId, commentId: null, deletedAt: null } });
    const systemFields = validateSystemPostFields(fieldConfig, {
      title: parsed.data.title ?? resolved.post.title ?? "",
      body: parsed.data.body ?? resolved.post.body,
      attachmentCount,
    }, { finalizeAttachments: parsed.data.attachmentCount !== undefined });
    const customFieldValues = parsed.data.customFieldValues !== undefined || parsed.data.fieldConfigVersion !== undefined
      ? validatePostFieldSubmission(fieldConfig, parsed.data.fieldConfigVersion ?? fieldConfig.version, parsed.data.customFieldValues ?? {})
      : undefined;
    const updated = await getPrisma().$transaction(async (transaction) => {
      const result = await transaction.post.updateMany({
        where: { id: postId, version: parsed.data.version, deletedAt: null },
        data: {
          ...(parsed.data.title !== undefined ? { title: systemFields.title || null } : {}),
          ...(parsed.data.body !== undefined ? { body: systemFields.body } : {}),
          ...(customFieldValues !== undefined ? { customFieldValues } : {}),
          isPinned: parsed.data.isPinned,
          version: { increment: 1 },
        },
      });
      if (!result.count) return null;
      if (globalOverride) {
        await transaction.adminAuditLog.create({ data: createAuditLogData({ actorId: user.id, action: "GLOBAL_POST_UPDATED", entityType: "Post", entityId: postId, after: { fields: Object.keys(parsed.data).filter((key) => key !== "body" && key !== "title") }, reason: "전역 권한으로 게시물 수정" }) });
      }
      return transaction.post.findUniqueOrThrow({ where: { id: postId }, select: { id: true, title: true, body: true, isPinned: true, version: true, updatedAt: true } });
    });
    if (!updated) return Response.json({ error: "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
    const activityId = await recordBoardActivity({ boardId: resolved.post.boardId, actorId: user.id, type: "POST_UPDATED", postId });
    publishBoardEvent(resolved.post.boardId, { type: "post.updated", entityId: postId, sectionId: resolved.post.sectionId, actorId: user.id, activityId });
    return Response.json({ post: { ...updated, updatedAt: updated.updatedAt.toISOString() } });
  } catch (error) {
    if (error instanceof PostFieldValidationError) return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
    return apiError(error, "게시물을 수정하지 못했습니다.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { postId } = await params;
    const resolved = await postAccess(postId, user);
    if (!resolved) return Response.json({ error: "게시물을 찾을 수 없습니다." }, { status: 404 });
    if (!canModeratePost({ user, access: resolved.access, postAuthorId: resolved.post.authorId })) return Response.json({ error: "게시물 숨김 권한이 없습니다." }, { status: 403 });
    if (isBoardFrozen(resolved.access)) return Response.json({ error: "동결된 패드에서는 게시물을 삭제할 수 없습니다." }, { status: 409 });
    const globalOverride = !boardScopedEdit(resolved.access.role, user.id, resolved.post.authorId);
    const deletedAt = new Date();
    await getPrisma().$transaction(async (transaction) => {
      await transaction.post.update({ where: { id: postId }, data: { deletedAt, version: { increment: 1 } } });
      await transaction.attachment.updateMany({ where: { postId, deletedAt: null }, data: { deletedAt } });
      if (globalOverride) {
        await transaction.adminAuditLog.create({ data: createAuditLogData({ actorId: user.id, action: "GLOBAL_POST_HIDDEN", entityType: "Post", entityId: postId, reason: "전역 권한으로 게시물 숨김" }) });
      }
    });
    const activityId = await recordBoardActivity({ boardId: resolved.post.boardId, actorId: user.id, type: "POST_DELETED", postId });
    publishBoardEvent(resolved.post.boardId, { type: "post.deleted", entityId: postId, sectionId: resolved.post.sectionId, actorId: user.id, activityId });
    return Response.json({ ok: true, archived: true });
  } catch (error) {
    return apiError(error, "게시물을 숨기지 못했습니다.");
  }
}
