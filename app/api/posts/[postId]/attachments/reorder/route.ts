import { canEditPost, getEffectiveBoardAccess, isBoardFrozen, requireActiveUser } from "@/lib/auth/authorization";
import { reorderAttachmentsSchema } from "@/lib/board/validators";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { postId } = await params;
    const parsed = reorderAttachmentsSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "첨부 순서를 확인해 주세요." }, { status: 400 });
    const prisma = getPrisma();
    const post = await prisma.post.findFirst({ where: { id: postId, deletedAt: null }, select: { boardId: true, authorId: true } });
    if (!post) return Response.json({ error: "게시물을 찾을 수 없습니다." }, { status: 404 });
    const access = await getEffectiveBoardAccess(post.boardId, user);
    if (!access || !canEditPost({ user, access, postAuthorId: post.authorId })) return Response.json({ error: "첨부 순서 변경 권한이 없습니다." }, { status: 403 });
    if (isBoardFrozen(access)) return Response.json({ error: "동결된 패드에서는 첨부 순서를 바꿀 수 없습니다." }, { status: 409 });
    const existing = await prisma.attachment.findMany({ where: { postId, commentId: null, deletedAt: null }, select: { id: true } });
    const existingIds = new Set(existing.map((item) => item.id));
    if (existingIds.size !== parsed.data.attachmentIds.length || parsed.data.attachmentIds.some((id) => !existingIds.has(id))) {
      return Response.json({ error: "현재 게시물의 모든 첨부를 정확히 한 번씩 보내야 합니다." }, { status: 409 });
    }
    await prisma.$transaction(parsed.data.attachmentIds.map((id, sortOrder) => prisma.attachment.update({ where: { id }, data: { sortOrder } })));
    publishBoardEvent(post.boardId, { type: "attachment.updated", entityId: postId, postId, actorId: user.id });
    return Response.json({ ok: true, attachmentIds: parsed.data.attachmentIds });
  } catch (error) {
    return apiError(error, "첨부 순서를 바꾸지 못했습니다.");
  }
}
