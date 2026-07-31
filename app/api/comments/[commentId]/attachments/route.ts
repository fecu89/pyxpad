import { canUploadFile, getEffectiveBoardAccess, hasSystemPermission, isBoardFrozen, requireActiveUser } from "@/lib/auth/authorization";
import { createPostUploadDirectory } from "@/lib/files/paths";
import { storeAttachmentUpload } from "@/lib/files/store-upload";
import { AttachmentLimitError } from "@/lib/files/validation";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  let cleanup: (() => Promise<void>) | null = null;
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { commentId } = await params;
    const prisma = getPrisma();
    const comment = await prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null, post: { deletedAt: null, board: { deletedAt: null } } },
      select: { id: true, authorId: true, postId: true, post: { select: { boardId: true } } },
    });
    if (!comment) return Response.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });
    const access = await getEffectiveBoardAccess(comment.post.boardId, user);
    const canEdit = user.id === comment.authorId || user.role === "SUPER_ADMIN" || hasSystemPermission(user, "EDIT_ANY_CONTENT");
    if (!access || !canEdit || !canUploadFile(user, access)) return Response.json({ error: "댓글 파일 업로드 권한이 없습니다." }, { status: 403 });
    if (isBoardFrozen(access)) return Response.json({ error: "동결된 패드에는 댓글 파일을 올릴 수 없습니다." }, { status: 409 });

    const stored = await storeAttachmentUpload(
      request,
      createPostUploadDirectory(comment.post.boardId, comment.postId),
      { allowedTypes: ["IMAGE", "AUDIO"] },
    );
    cleanup = stored.cleanup;
    const attachment = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Comment" WHERE "id" = ${commentId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!locked.length) throw new Error("댓글을 찾을 수 없습니다.");
      const count = await tx.attachment.count({ where: { commentId, deletedAt: null } });
      if (count >= 4) throw new AttachmentLimitError("댓글에는 첨부를 4개까지만 올릴 수 있습니다.");
      return tx.attachment.create({
        data: {
          postId: comment.postId,
          commentId,
          uploaderId: user.id,
          ...stored.data,
          sortOrder: count,
        },
        select: { id: true, type: true, originalName: true, mimeType: true, fileSize: true, width: true, height: true, altText: true, caption: true, externalUrl: true, previewImageUrl: true },
      });
    });
    cleanup = null;
    publishBoardEvent(comment.post.boardId, { type: "attachment.created", entityId: attachment.id, postId: comment.postId, actorId: user.id });
    return Response.json({ attachment: { ...attachment, url: `/files/${attachment.id}` } }, { status: 201 });
  } catch (error) {
    if (cleanup) await cleanup();
    if (error instanceof AttachmentLimitError) return Response.json({ error: error.message }, { status: 400 });
    return apiError(error, "댓글 파일을 업로드하지 못했습니다.");
  }
}
