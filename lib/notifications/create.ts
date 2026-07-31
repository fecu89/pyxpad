import "server-only";

import type { NotificationType } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { isViewingBoard } from "@/lib/realtime/board-viewers";
import { publishUserEvent } from "@/lib/realtime/user-events";

export async function createNotification(input: {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  boardId?: string | null;
  postId?: string | null;
  commentId?: string | null;
}) {
  if (input.actorId && input.actorId === input.userId) return;
  // 지금 그 보드를 실시간으로 보고 있는 사용자에게는 같은 소식을 또 개인 알림으로 보내지 않습니다.
  if (input.boardId && isViewingBoard(input.boardId, input.userId)) return;
  const notification = await getPrisma().notification.create({
    data: {
      userId: input.userId,
      actorId: input.actorId ?? null,
      type: input.type,
      boardId: input.boardId ?? null,
      postId: input.postId ?? null,
      commentId: input.commentId ?? null,
    },
    select: { id: true },
  });
  publishUserEvent(input.userId, { type: "notification.created", notificationId: notification.id });
}
