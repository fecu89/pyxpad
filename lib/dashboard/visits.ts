import "server-only";

import { getPrisma } from "@/lib/prisma";

export async function recordBoardVisit(boardId: string, userId: string) {
  const now = new Date();
  await getPrisma().boardVisit.upsert({
    where: { boardId_userId: { boardId, userId } },
    create: { boardId, userId, lastVisitedAt: now },
    update: { lastVisitedAt: now },
  });
}
