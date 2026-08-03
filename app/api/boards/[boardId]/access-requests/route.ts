import { z } from "zod";
import { canManageBoardSettings, canReadEffectiveBoard, getEffectiveBoardAccess, isBoardScopedManagement, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { followBoard, recordBoardActivity } from "@/lib/board/activity";
import { maskLoginIdentifier } from "@/lib/security/pii-crypto";
import { decryptUserLoginIdentifier, toPublicAuthorDTO } from "@/lib/users/repository";
import { apiError, assertSameOrigin } from "@/lib/http";
import { createNotification } from "@/lib/notifications/create";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";

const decisionSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(["APPROVE", "REJECT"]),
});

export async function GET(_request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    const current = await requireActiveUser();
    const { boardId } = await params;
    const access = await getEffectiveBoardAccess(boardId, current);
    if (!access || !canManageBoardSettings(current, access)) {
      return Response.json({ error: "접근 요청을 관리할 권한이 없습니다." }, { status: 403 });
    }

    const requests = await getPrisma().boardAccessRequest.findMany({
      where: { boardId, status: "PENDING" },
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, nameEncrypted: true, loginIdentifierEncrypted: true, imageEncrypted: true } },
      },
    });
    return Response.json({
      requests: requests.map((item) => ({
        ...item,
        user: {
          ...toPublicAuthorDTO(item.user),
          loginIdentifier: maskLoginIdentifier(decryptUserLoginIdentifier(item.user)),
        },
      })),
    });
  } catch (error) {
    return apiError(error, "접근 요청을 불러오지 못했습니다.");
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    assertSameOrigin(_request);
    const current = await requireActiveUser();
    const { boardId } = await params;
    const access = await getEffectiveBoardAccess(boardId, current);
    if (!access) return Response.json({ error: "패드를 찾을 수 없습니다." }, { status: 404 });
    if (canReadEffectiveBoard(current, access)) {
      return Response.json({ error: "이미 이 패드에 접근할 수 있습니다." }, { status: 409 });
    }

    const prisma = getPrisma();
    const accessRequest = await prisma.boardAccessRequest.upsert({
      where: { boardId_userId: { boardId, userId: current.id } },
      update: { status: "PENDING" },
      create: { boardId, userId: current.id, status: "PENDING" },
      select: { id: true, status: true, updatedAt: true },
    });

    const managerIds = new Set<string>([access.board.ownerId]);
    const admins = await prisma.boardMember.findMany({ where: { boardId, role: "ADMIN" }, select: { userId: true } });
    admins.forEach((admin) => managerIds.add(admin.userId));
    await Promise.all([...managerIds].map((managerId) => createNotification({
      userId: managerId,
      actorId: current.id,
      type: "ACCESS_REQUEST_RECEIVED",
      boardId,
    })));

    return Response.json({ request: accessRequest });
  } catch (error) {
    return apiError(error, "접근 권한을 요청하지 못했습니다.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    assertSameOrigin(request);
    const current = await requireActiveUser();
    const { boardId } = await params;
    const access = await getEffectiveBoardAccess(boardId, current);
    if (!access || !canManageBoardSettings(current, access)) {
      return Response.json({ error: "접근 요청을 처리할 권한이 없습니다." }, { status: 403 });
    }

    const parsed = decisionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "요청과 처리 방법을 확인해 주세요." }, { status: 400 });
    }

    const prisma = getPrisma();
    const pendingRequest = await prisma.boardAccessRequest.findFirst({
      where: { id: parsed.data.requestId, boardId, status: "PENDING" },
      select: { id: true, userId: true },
    });
    if (!pendingRequest) {
      return Response.json({ error: "처리할 대기 요청을 찾을 수 없습니다." }, { status: 404 });
    }

    const status = parsed.data.action === "APPROVE" ? "APPROVED" : "REJECTED";
    await prisma.$transaction(async (transaction) => {
      if (status === "APPROVED") {
        await transaction.boardMember.upsert({
          where: { boardId_userId: { boardId, userId: pendingRequest.userId } },
          update: {},
          create: { boardId, userId: pendingRequest.userId, role: "MEMBER" },
        });
      }
      await transaction.boardAccessRequest.update({
        where: { id: pendingRequest.id },
        data: { status },
      });
      if (!isBoardScopedManagement(access)) {
        await transaction.adminAuditLog.create({ data: createAuditLogData({
          actorId: current.id,
          targetUserId: pendingRequest.userId,
          action: "GLOBAL_BOARD_UPDATED",
          entityType: "BoardAccessRequest",
          entityId: pendingRequest.id,
          after: { boardId, status },
        }) });
      }
    });

    if (status === "APPROVED") {
      const activityId = await recordBoardActivity({ boardId, actorId: current.id, type: "MEMBER_JOINED" });
      publishBoardEvent(boardId, { type: "board.updated", entityId: boardId, actorId: current.id, activityId });
      await followBoard(boardId, pendingRequest.userId);
    }
    await recordBoardActivity({ boardId, actorId: current.id, type: "ACCESS_REQUEST_DECIDED" });
    await createNotification({
      userId: pendingRequest.userId,
      actorId: current.id,
      type: status === "APPROVED" ? "ACCESS_REQUEST_APPROVED" : "ACCESS_REQUEST_REJECTED",
      boardId,
    });
    return Response.json({ request: { id: pendingRequest.id, status } });
  } catch (error) {
    return apiError(error, "접근 요청을 처리하지 못했습니다.");
  }
}
