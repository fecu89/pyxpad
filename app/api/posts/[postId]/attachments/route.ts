import { canEditPost, canUploadFile, getEffectiveBoardAccess, isBoardFrozen, isBoardScopedPostEdit, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { createPostUploadDirectory } from "@/lib/files/paths";
import { storeAttachmentUpload } from "@/lib/files/store-upload";
import { AttachmentLimitError } from "@/lib/files/validation";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";
import { assertRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  let cleanup: (() => Promise<void>) | null = null;
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    // 이미지 한 장이 최대 4천만 픽셀까지 sharp로 변환되므로 업로드는 개별적으로도 제한합니다.
    // 정상 사용(게시물당 최대 20개, 한 번에 3개씩 병렬)보다 넉넉하되 스크립트 남용은 막습니다.
    assertRateLimit(request, {
      scope: "attachment-upload",
      userId: user.id,
      windowMs: 5 * 60_000,
      maxAttempts: 60,
      message: "파일을 너무 많이 올렸습니다. 잠시 후 다시 시도해 주세요.",
    });
    const { postId } = await params;
    const prisma = getPrisma();
    const post = await prisma.post.findFirst({
      where: { id: postId, deletedAt: null, board: { deletedAt: null } },
      select: { id: true, boardId: true, authorId: true },
    });
    if (!post) return Response.json({ error: "게시물을 찾을 수 없습니다." }, { status: 404 });
    const access = await getEffectiveBoardAccess(post.boardId, user);
    if (!access || !canUploadFile(user, access) || !canEditPost({ user, access, postAuthorId: post.authorId })) {
      return Response.json({ error: "파일 업로드 권한이 없습니다." }, { status: 403 });
    }
    if (isBoardFrozen(access)) return Response.json({ error: "동결된 패드에는 파일을 올릴 수 없습니다." }, { status: 409 });

    const stored = await storeAttachmentUpload(request, createPostUploadDirectory(post.boardId, post.id));
    cleanup = stored.cleanup;
    const attachment = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Post" WHERE "id" = ${postId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!locked.length) throw new Error("게시물을 찾을 수 없습니다.");
      const count = await tx.attachment.count({ where: { postId, commentId: null, deletedAt: null } });
      if (count >= 20) throw new AttachmentLimitError("게시물에는 첨부를 20개까지만 올릴 수 있습니다.");
      const last = await tx.attachment.findFirst({
        where: { postId, commentId: null, deletedAt: null },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const created = await tx.attachment.create({
        data: { postId, uploaderId: user.id, ...stored.data, sortOrder: (last?.sortOrder ?? -1) + 1 },
        select: { id: true, type: true, originalName: true, mimeType: true, fileSize: true, width: true, height: true, altText: true, caption: true, externalUrl: true, previewImageUrl: true },
      });
      if (!isBoardScopedPostEdit(access, user.id, post.authorId)) {
        await tx.adminAuditLog.create({
          data: createAuditLogData({
            actorId: user.id,
            action: "GLOBAL_POST_UPDATED",
            entityType: "Attachment",
            entityId: created.id,
            after: { postId, operation: "created" },
          }),
        });
      }
      return created;
    });
    cleanup = null;
    publishBoardEvent(post.boardId, { type: "attachment.created", entityId: attachment.id, postId, actorId: user.id });
    return Response.json({ attachment: { ...attachment, url: `/files/${attachment.id}` } }, { status: 201 });
  } catch (error) {
    if (cleanup) await cleanup();
    if (error instanceof AttachmentLimitError) return Response.json({ error: error.message }, { status: 400 });
    return apiError(error, "파일 업로드에 실패했습니다.");
  }
}
