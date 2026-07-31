import { requireActiveUser } from "@/lib/auth/authorization";
import { followBoard, recordBoardActivity } from "@/lib/board/activity";
import { hashInviteToken } from "@/lib/board/invite-links";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";

const ROLE_RANK = { OWNER: 5, ADMIN: 4, EDITOR: 3, MEMBER: 2, VIEWER: 1 } as const;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { token } = await params;
    const prisma = getPrisma();
    const tokenHash = hashInviteToken(token);
    const invite = await prisma.boardInviteLink.findUnique({
      where: { tokenHash },
      select: { id: true, boardId: true, role: true, expiresAt: true, maxUses: true, useCount: true, revokedAt: true, board: { select: { slug: true, deletedAt: true } } },
    });
    if (!invite || invite.revokedAt || invite.board.deletedAt) {
      return Response.json({ error: "유효하지 않은 초대 링크입니다." }, { status: 404 });
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      return Response.json({ error: "만료된 초대 링크입니다." }, { status: 410 });
    }
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      return Response.json({ error: "사용 횟수를 초과한 초대 링크입니다." }, { status: 410 });
    }

    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.boardMember.findUnique({
        where: { boardId_userId: { boardId: invite.boardId, userId: user.id } },
        select: { role: true },
      });
      if (!existing || ROLE_RANK[existing.role] < ROLE_RANK[invite.role]) {
        await transaction.boardMember.upsert({
          where: { boardId_userId: { boardId: invite.boardId, userId: user.id } },
          update: { role: invite.role },
          create: { boardId: invite.boardId, userId: user.id, role: invite.role },
        });
      }
      await transaction.boardAccessRequest.updateMany({
        where: { boardId: invite.boardId, userId: user.id, status: "PENDING" },
        data: { status: "APPROVED" },
      });
      await transaction.boardInviteLink.update({ where: { id: invite.id }, data: { useCount: { increment: 1 } } });
    });

    const activityId = await recordBoardActivity({ boardId: invite.boardId, actorId: user.id, type: "MEMBER_JOINED" });
    publishBoardEvent(invite.boardId, { type: "board.updated", entityId: invite.boardId, actorId: user.id, activityId });
    await followBoard(invite.boardId, user.id);

    return Response.json({ board: { slug: invite.board.slug } });
  } catch (error) {
    return apiError(error, "초대 링크로 참여하지 못했습니다.");
  }
}
