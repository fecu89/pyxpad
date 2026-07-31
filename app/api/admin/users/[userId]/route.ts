import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { z } from "zod";
import { AuthorizationError, requireActiveUser, requireRecentAuthentication } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { getAvatarPath } from "@/lib/files/paths";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { encryptUserPii } from "@/lib/security/pii-crypto";
import { assertCanChangeUserRole, assertCanChangeUserStatus, assertCanManageSchoolPlacement, assertCanManageUserOrganization } from "@/lib/users/admin-policy";
import { toAdminUserDTO } from "@/lib/users/repository";

const updateSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  schoolId: z.string().min(1).nullable().optional(),
  schoolGroupId: z.string().min(1).nullable().optional(),
  isSchoolRepresentative: z.boolean().optional(),
  reason: z.string().trim().min(3).max(500),
}).refine(
  (value) => value.role !== undefined
    || value.status !== undefined
    || value.schoolId !== undefined
    || value.schoolGroupId !== undefined
    || value.isSchoolRepresentative !== undefined,
  "변경할 값을 입력해 주세요.",
);

const deleteSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const adminUserSelect = {
  id: true,
  emailEncrypted: true,
  nameEncrypted: true,
  role: true,
  status: true,
  authVersion: true,
  lastLoginAt: true,
  createdAt: true,
  school: { select: { id: true, name: true } },
  schoolGroup: { select: { id: true, name: true, type: true } },
  systemPermissions: { select: { permission: true }, orderBy: { permission: "asc" as const } },
  isSchoolRepresentative: true,
  _count: { select: { ownedBoards: true, memberships: true } },
} as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireActiveUser();
    const { userId } = await params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "변경 값과 사유를 확인해 주세요." }, { status: 400 });
    const prisma = getPrisma();
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        schoolId: true,
        schoolGroupId: true,
        isSchoolRepresentative: true,
        _count: { select: { ownedBoards: true } },
      },
    });
    if (!target || target.status === "DELETED") return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });

    // 학교 대표교사는 자기 학교 안의 배치(schoolId/schoolGroupId)만 바꿀 수 있습니다 — 역할·
    // 상태·대표교사 지정은 손댈 수 없고, 대상이 이미 자기 학교 소속이 아니면 전부 거부합니다.
    const isRepresentativeActor = actor.role === "TEACHER" && actor.isSchoolRepresentative;
    if (isRepresentativeActor) {
      if (parsed.data.role !== undefined || parsed.data.status !== undefined || parsed.data.isSchoolRepresentative !== undefined) {
        return Response.json({ error: "대표교사는 역할·상태·대표교사 지정을 바꿀 수 없습니다." }, { status: 403 });
      }
      if (parsed.data.schoolId !== undefined && parsed.data.schoolId !== actor.school?.id) {
        return Response.json({ error: "대표교사는 자기 학교 밖으로 배치를 바꿀 수 없습니다." }, { status: 403 });
      }
    }

    const nextRole = parsed.data.role ?? target.role;
    const nextStatus = parsed.data.status ?? target.status;
    const organizationRequested = parsed.data.schoolId !== undefined || parsed.data.schoolGroupId !== undefined;
    const nextSchoolId = parsed.data.schoolId !== undefined ? parsed.data.schoolId : target.schoolId;
    let nextSchoolGroupId = parsed.data.schoolGroupId !== undefined ? parsed.data.schoolGroupId : target.schoolGroupId;
    if (nextRole === "SUPER_ADMIN" || nextRole === "ADMIN") nextSchoolGroupId = null;
    // TEACHER가 아닌 역할로 바뀌면 대표교사 지정은 의미가 없으니 자동으로 해제합니다.
    const nextIsSchoolRepresentative = nextRole !== "TEACHER"
      ? false
      : parsed.data.isSchoolRepresentative ?? target.isSchoolRepresentative;
    if (parsed.data.isSchoolRepresentative && nextRole !== "TEACHER") {
      return Response.json({ error: "대표교사는 교사 역할에만 지정할 수 있습니다." }, { status: 400 });
    }

    if (parsed.data.role && parsed.data.role !== target.role) assertCanChangeUserRole(actor, target.role, parsed.data.role);
    if (parsed.data.status && parsed.data.status !== target.status) assertCanChangeUserStatus(actor, target.role);
    if (parsed.data.isSchoolRepresentative !== undefined && actor.role !== "SUPER_ADMIN") {
      throw new AuthorizationError("대표교사 지정은 전체관리자만 할 수 있습니다.");
    }
    if (organizationRequested || nextRole !== target.role) {
      if (isRepresentativeActor) assertCanManageSchoolPlacement(actor, target);
      else assertCanManageUserOrganization(actor, target.role);
    }

    const touchesTrustedRole = [target.role, nextRole].some((role) => role === "SUPER_ADMIN" || role === "ADMIN");
    if (touchesTrustedRole) requireRecentAuthentication(actor);
    if (nextRole === "STUDENT" && target._count.ownedBoards > 0) {
      return Response.json({ error: "패드를 소유한 사용자는 먼저 소유권을 이전해야 학생으로 변경할 수 있습니다." }, { status: 409 });
    }

    if (organizationRequested || nextRole !== target.role) {
      if ((nextRole === "STUDENT" || nextRole === "TEACHER") && (!nextSchoolId || !nextSchoolGroupId)) {
        return Response.json({ error: nextRole === "STUDENT" ? "학생의 학교와 반을 선택해 주세요." : "교사의 학교와 부서를 선택해 주세요." }, { status: 400 });
      }
      if (nextSchoolGroupId) {
        const expectedType = nextRole === "STUDENT" ? "CLASS" : nextRole === "TEACHER" ? "DEPARTMENT" : null;
        const matchingGroup = expectedType
          ? await prisma.schoolGroup.findFirst({ where: { id: nextSchoolGroupId, schoolId: nextSchoolId ?? "", type: expectedType }, select: { id: true } })
          : null;
        if (!matchingGroup) return Response.json({ error: "역할에 맞는 학교 소속을 선택해 주세요." }, { status: 400 });
      }
    }

    const organizationChanged = nextSchoolId !== target.schoolId || nextSchoolGroupId !== target.schoolGroupId;
    const representativeChanged = nextIsSchoolRepresentative !== target.isSchoolRepresentative;
    if (nextRole === target.role && nextStatus === target.status && !organizationChanged && !representativeChanged) {
      return Response.json({ error: "변경된 값이 없습니다." }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (target.role === "SUPER_ADMIN" && (nextRole !== "SUPER_ADMIN" || nextStatus !== "ACTIVE")) {
        const activeSuperAdmins = await tx.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
        if (activeSuperAdmins <= 1) throw new Error("마지막 활성 전체관리자는 변경하거나 정지할 수 없습니다.");
      }
      if (target.role === "ADMIN" && nextRole !== "ADMIN") await tx.userSystemPermission.deleteMany({ where: { userId } });
      const downgradedMemberships = nextRole === "STUDENT"
        ? await tx.boardMember.updateMany({ where: { userId, role: { in: ["OWNER", "ADMIN", "EDITOR"] } }, data: { role: "MEMBER" } })
        : { count: 0 };
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          role: nextRole,
          status: nextStatus,
          ...(organizationChanged || nextRole !== target.role ? { schoolId: nextSchoolId, schoolGroupId: nextSchoolGroupId } : {}),
          ...(representativeChanged ? { isSchoolRepresentative: nextIsSchoolRepresentative } : {}),
          authVersion: { increment: 1 },
        },
        select: adminUserSelect,
      });
      if (nextRole !== target.role) {
        await tx.adminAuditLog.create({ data: createAuditLogData({ actorId: actor.id, targetUserId: userId, action: "USER_ROLE_CHANGED", entityType: "User", entityId: userId, before: { role: target.role }, after: { role: nextRole, downgradedBoardMemberships: downgradedMemberships.count }, reason: parsed.data.reason }) });
      }
      if (nextStatus !== target.status) {
        await tx.adminAuditLog.create({ data: createAuditLogData({ actorId: actor.id, targetUserId: userId, action: "USER_STATUS_CHANGED", entityType: "User", entityId: userId, before: { status: target.status }, after: { status: nextStatus }, reason: parsed.data.reason }) });
      }
      if (organizationChanged) {
        await tx.adminAuditLog.create({ data: createAuditLogData({ actorId: actor.id, targetUserId: userId, action: "USER_ORGANIZATION_CHANGED", entityType: "User", entityId: userId, before: { schoolId: target.schoolId, schoolGroupId: target.schoolGroupId }, after: { schoolId: nextSchoolId, schoolGroupId: nextSchoolGroupId }, reason: parsed.data.reason }) });
      }
      if (representativeChanged) {
        await tx.adminAuditLog.create({ data: createAuditLogData({ actorId: actor.id, targetUserId: userId, action: nextIsSchoolRepresentative ? "SCHOOL_REPRESENTATIVE_GRANTED" : "SCHOOL_REPRESENTATIVE_REVOKED", entityType: "User", entityId: userId, before: { isSchoolRepresentative: target.isSchoolRepresentative }, after: { isSchoolRepresentative: nextIsSchoolRepresentative }, reason: parsed.data.reason }) });
      }
      return user;
    }, { isolationLevel: "Serializable" });
    return Response.json({ user: toAdminUserDTO(updated) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "사용자 정보를 변경하지 못했습니다.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireActiveUser();
    if (actor.role !== "SUPER_ADMIN") throw new AuthorizationError("회원 삭제는 전체관리자만 할 수 있습니다.");
    const { userId } = await params;
    if (userId === actor.id) return Response.json({ error: "현재 로그인한 관리자 계정은 삭제할 수 없습니다." }, { status: 409 });
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "삭제 사유를 3자 이상 입력해 주세요." }, { status: 400 });

    const prisma = getPrisma();
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, schoolId: true, schoolGroupId: true, _count: { select: { ownedBoards: true } } },
    });
    if (!target || target.status === "DELETED") return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    if (target._count.ownedBoards > 0) {
      return Response.json({ error: "소유한 패드가 있는 회원은 삭제할 수 없습니다. 먼저 패드 소유권을 이전하거나 패드를 정리해 주세요." }, { status: 409 });
    }
    if (target.role === "SUPER_ADMIN") requireRecentAuthentication(actor);

    const deletedKey = randomUUID();
    await prisma.$transaction(async (tx) => {
      if (target.role === "SUPER_ADMIN") {
        const activeSuperAdmins = await tx.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
        if (activeSuperAdmins <= 1) throw new Error("마지막 활성 전체관리자는 삭제할 수 없습니다.");
      }
      await tx.userSystemPermission.deleteMany({ where: { userId } });
      const removedMemberships = await tx.boardMember.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          status: "DELETED",
          authVersion: { increment: 1 },
          emailLookup: `deleted:${deletedKey}`,
          emailEncrypted: encryptUserPii(userId, "email", `deleted-${deletedKey}@invalid.local`),
          nameEncrypted: encryptUserPii(userId, "name", "삭제된 사용자"),
          imageEncrypted: null,
          schoolId: null,
          schoolGroupId: null,
        },
      });
      await tx.adminAuditLog.create({
        data: createAuditLogData({
          actorId: actor.id,
          targetUserId: userId,
          action: "USER_DELETED",
          entityType: "User",
          entityId: userId,
          before: { role: target.role, status: target.status, schoolId: target.schoolId, schoolGroupId: target.schoolGroupId },
          after: {
            status: "DELETED",
            personalDataRemoved: true,
            removedBoardMemberships: removedMemberships.count,
          },
          reason: parsed.data.reason,
        }),
      });
    }, { isolationLevel: "Serializable" });
    await unlink(getAvatarPath(userId)).catch(() => undefined);

    return Response.json({ ok: true, userId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "회원을 삭제하지 못했습니다.");
  }
}
