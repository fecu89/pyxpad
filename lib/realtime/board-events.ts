import { EventEmitter } from "node:events";
import type { ReactionCounts } from "@/lib/reactions/types";

export type BoardEvent = {
  type:
    | "post.created" | "post.updated" | "post.deleted" | "post.reordered"
    | "section.created" | "section.updated" | "section.deleted" | "section.reordered"
    | "attachment.created" | "attachment.updated" | "attachment.deleted"
    | "comment.created" | "comment.updated" | "comment.deleted" | "reaction.changed" | "board.updated";
  entityId: string;
  actorId?: string;
  sectionId?: string | null;
  postId?: string | null;
  // BoardActivity.id — 재연결 후 놓친 변경을 /api/boards/[boardId]/activity에서 이 값 이후로 보충 조회할 때 씁니다.
  activityId?: string;
  payload?: {
    reactionCount?: number;
    reactionCounts?: ReactionCounts;
    commentCount?: number;
  };
  emittedAt?: string;
};

const globalForEvents = globalThis as unknown as { pyxpadEventBus?: EventEmitter };

function getEventBus() {
  if (!globalForEvents.pyxpadEventBus) {
    const bus = new EventEmitter();
    bus.setMaxListeners(0);
    globalForEvents.pyxpadEventBus = bus;
  }
  return globalForEvents.pyxpadEventBus;
}

const channel = (boardId: string) => `board:${boardId}`;

export function publishBoardEvent(boardId: string, event: BoardEvent) {
  getEventBus().emit(channel(boardId), { ...event, emittedAt: new Date().toISOString() } satisfies BoardEvent);
}

export function subscribeBoardEvent(boardId: string, listener: (event: BoardEvent) => void) {
  const bus = getEventBus();
  const name = channel(boardId);
  bus.on(name, listener);
  return () => bus.off(name, listener);
}
