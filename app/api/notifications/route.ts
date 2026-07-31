import { requireActiveUser } from "@/lib/auth/authorization";
import { apiError } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { toPublicAuthorDTO } from "@/lib/users/repository";

export async function GET(request: Request) {
  try {
    const user = await requireActiveUser();
    const prisma = getPrisma();
    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          type: true,
          boardId: true,
          postId: true,
          commentId: true,
          readAt: true,
          createdAt: true,
          actor: { select: { id: true, nameEncrypted: true, imageEncrypted: true } },
        },
      }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    const boardIds = [...new Set(items.map((item) => item.boardId).filter((id): id is string => Boolean(id)))];
    const postIds = [...new Set(items.map((item) => item.postId).filter((id): id is string => Boolean(id)))];
    const [boards, posts] = await Promise.all([
      boardIds.length ? prisma.board.findMany({ where: { id: { in: boardIds } }, select: { id: true, slug: true, title: true } }) : [],
      postIds.length ? prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, title: true } }) : [],
    ]);
    const boardById = new Map(boards.map((board) => [board.id, board]));
    const postById = new Map(posts.map((post) => [post.id, post]));

    return Response.json({
      unreadCount,
      notifications: items.map((item) => ({
        id: item.id,
        type: item.type,
        readAt: item.readAt ? item.readAt.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
        actor: item.actor ? toPublicAuthorDTO(item.actor) : null,
        board: item.boardId ? boardById.get(item.boardId) ?? null : null,
        post: item.postId ? postById.get(item.postId) ?? null : null,
        commentId: item.commentId,
      })),
    });
  } catch (error) {
    return apiError(error, "알림을 불러오지 못했습니다.");
  }
}
