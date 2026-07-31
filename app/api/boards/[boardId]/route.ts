import {
  canArchiveBoard,
  canManageBoardSettings,
  getEffectiveBoardAccess,
  requireActiveUser,
} from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { hashBoardPassword } from "@/lib/board/board-password";
import { normalizeBoardAccessSettings, updateBoardSchema } from "@/lib/board/validators";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";
import { parsePostFieldConfig, PostFieldValidationError } from "@/lib/post-fields/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { boardId } = await params;
    const access = await getEffectiveBoardAccess(boardId, user);
    if (!access || !canManageBoardSettings(user, access)) return Response.json({ error: "패드 관리 권한이 없습니다." }, { status: 403 });
    const parsed = updateBoardSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "패드 정보를 확인해 주세요." }, { status: 400 });
    const globalOverride = !["OWNER", "ADMIN"].includes(access.role ?? "");
    const { password, freezeAt, postFieldConfig, ...rest } = parsed.data;
    const normalizedAccess = normalizeBoardAccessSettings({
      discoveryScope: rest.discoveryScope ?? access.board.discoveryScope,
      visitorPermission: rest.visitorPermission ?? access.board.visitorPermission,
      loginRequired: rest.loginRequired ?? access.board.loginRequired,
    });
    const data = {
      ...rest,
      // 현재 보드가 LINK인 상태에서 visitorPermission만 바꾸는 조작 요청도 읽기 전용으로
      // 되돌립니다. 다른 공개 범위로 전환할 때는 요청받은 값을 그대로 보존합니다.
      ...(normalizedAccess.discoveryScope === "LINK"
        ? { visitorPermission: normalizedAccess.visitorPermission, loginRequired: normalizedAccess.loginRequired }
        : {}),
      ...(postFieldConfig !== undefined ? { postFieldConfig: parsePostFieldConfig(postFieldConfig) } : {}),
      ...(Object.hasOwn(parsed.data, "description") ? { description: parsed.data.description || null } : {}),
      // password: 문자열이면 해시로 교체, null이면 보호 해제, undefined(생략)면 손대지 않음.
      ...(password !== undefined ? { passwordHash: password === null ? null : hashBoardPassword(password) } : {}),
      ...(freezeAt !== undefined ? { freezeAt: freezeAt === null ? null : new Date(freezeAt) } : {}),
    };
    const board = await getPrisma().$transaction(async (transaction) => {
      const updated = await transaction.board.update({
        where: { id: boardId },
        data,
        select: { id: true, title: true, description: true, discoveryScope: true, visitorPermission: true, loginRequired: true, passwordHash: true, state: true, moderationMode: true, freezeAt: true, layout: true, sortMode: true, newPostPlacement: true, cardSize: true, font: true, backgroundColor: true, backgroundImageUrl: true, accentColor: true, showAuthor: true, showTimestamp: true, reactionPolicy: true, attachmentDownloadPolicy: true, postFieldConfig: true },
      });
      if (globalOverride) {
        await transaction.adminAuditLog.create({ data: createAuditLogData({ actorId: user.id, action: "GLOBAL_BOARD_UPDATED", entityType: "Board", entityId: boardId, after: { fields: Object.keys(parsed.data) }, reason: "전역 권한으로 패드 설정 변경" }) });
      }
      return updated;
    });
    publishBoardEvent(boardId, { type: "board.updated", entityId: boardId, actorId: user.id });
    const { passwordHash, freezeAt: updatedFreezeAt, ...boardWithoutHash } = board;
    return Response.json({ board: { ...boardWithoutHash, hasPassword: Boolean(passwordHash), freezeAt: updatedFreezeAt ? updatedFreezeAt.toISOString() : null } });
  } catch (error) {
    if (error instanceof PostFieldValidationError) return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
    return apiError(error, "패드를 수정하지 못했습니다.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { boardId } = await params;
    const access = await getEffectiveBoardAccess(boardId, user);
    if (!access || !canArchiveBoard(user, access)) return Response.json({ error: "패드 소유자만 보관할 수 있습니다." }, { status: 403 });
    const globalOverride = !access.isOwner;
    await getPrisma().$transaction(async (transaction) => {
      await transaction.board.update({ where: { id: boardId }, data: { deletedAt: new Date() } });
      if (globalOverride) {
        await transaction.adminAuditLog.create({ data: createAuditLogData({ actorId: user.id, action: "GLOBAL_BOARD_ARCHIVED", entityType: "Board", entityId: boardId, reason: "전체관리자 패드 보관" }) });
      }
    });
    publishBoardEvent(boardId, { type: "board.updated", entityId: boardId, actorId: user.id });
    return Response.json({ ok: true, archived: true });
  } catch (error) {
    return apiError(error, "패드를 보관하지 못했습니다.");
  }
}
