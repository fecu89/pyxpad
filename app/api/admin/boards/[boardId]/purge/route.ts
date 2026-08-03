import { z } from "zod";
import { canPurgeBoard, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { getArchivedBoardAccess } from "@/lib/board/permissions";
import { removeBoardUploadDirectory, removeStoredAttachmentFiles } from "@/lib/files/cleanup";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function DELETE(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { boardId } = await params;
    const access = await getArchivedBoardAccess(boardId, user.id);
    if (!access) return Response.json({ error: "보관된 패드를 찾을 수 없습니다." }, { status: 404 });
    if (!canPurgeBoard(user, access)) return Response.json({ error: "패드 영구 삭제 권한이 없습니다." }, { status: 403 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "영구 삭제 사유를 3자 이상 입력해 주세요." }, { status: 400 });
    if (!access.board.deletedAt) return Response.json({ error: "먼저 패드를 보관 처리해 주세요." }, { status: 409 });
    const prisma = getPrisma();
    const attachments = await prisma.attachment.findMany({ where: { post: { boardId } }, select: { storagePath: true, thumbnailPath: true } });
    await prisma.$transaction(async (transaction) => {
      await transaction.board.delete({ where: { id: boardId } });
      if (!access.isOwner) {
        await transaction.adminAuditLog.create({ data: createAuditLogData({ actorId: user.id, action: "GLOBAL_ENTITY_PURGED", entityType: "Board", entityId: boardId, reason: parsed.data.reason }) });
      }
    });
    const cleanup = await removeStoredAttachmentFiles(attachments);
    const boardDirectoryRemoved = await removeBoardUploadDirectory(boardId);
    return Response.json({ ok: true, purged: true, removedFiles: cleanup.removed, fileCleanupFailed: cleanup.failed, boardDirectoryRemoved });
  } catch (error) {
    return apiError(error, "패드를 영구 삭제하지 못했습니다.");
  }
}
