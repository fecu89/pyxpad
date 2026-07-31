import { canEditPost, canUploadFile, getEffectiveBoardAccess, isBoardFrozen, isBoardScopedPostEdit, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { createPostUploadDirectory } from "@/lib/files/paths";
import { storeAttachmentUpload } from "@/lib/files/store-upload";
import { AttachmentLimitError } from "@/lib/files/validation";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  let cleanup: (() => Promise<void>) | null = null;
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
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
