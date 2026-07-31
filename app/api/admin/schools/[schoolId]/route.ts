import { z } from "zod";
import { requireRole } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { DEFAULT_SCHOOL_ID } from "@/lib/users/organization";

const renameSchoolSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ schoolId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireRole(["SUPER_ADMIN"]);
    const { schoolId } = await params;
    const parsed = renameSchoolSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "학교 이름을 확인해 주세요." }, { status: 400 });

    const prisma = getPrisma();
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
    if (!school) return Response.json({ error: "학교를 찾을 수 없습니다." }, { status: 404 });
    if (school.name === parsed.data.name) return Response.json({ error: "변경된 이름이 없습니다." }, { status: 409 });
    const duplicate = await prisma.school.findUnique({ where: { name: parsed.data.name }, select: { id: true } });
    if (duplicate) return Response.json({ error: "같은 이름의 학교가 이미 있습니다." }, { status: 409 });

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.school.update({ where: { id: schoolId }, data: { name: parsed.data.name }, select: { id: true, name: true } });
      await tx.adminAuditLog.create({
        data: createAuditLogData({
          actorId: actor.id,
          action: "SCHOOL_UPDATED",
          entityType: "School",
          entityId: schoolId,
          before: { name: school.name },
          after: { name: next.name },
        }),
      });
      return next;
    });
    return Response.json({ school: updated });
  } catch (error) {
    return apiError(error, "학교 이름을 변경하지 못했습니다.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ schoolId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireRole(["SUPER_ADMIN"]);
    const { schoolId } = await params;
    if (schoolId === DEFAULT_SCHOOL_ID) {
      return Response.json({ error: "서비스 초기 학교 데이터는 삭제할 수 없습니다." }, { status: 409 });
    }

    const prisma = getPrisma();
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, _count: { select: { users: true, groups: true } } },
    });
    if (!school) return Response.json({ error: "학교를 찾을 수 없습니다." }, { status: 404 });

    const affectedUsers = school._count.users;
    await prisma.$transaction(async (tx) => {
      // School.groups는 onDelete: Cascade, User.schoolId/schoolGroupId는 onDelete: SetNull이라
      // 삭제 한 번으로 반/부서까지 정리되고 소속 사용자는 "미지정" 상태가 됩니다.
      await tx.school.delete({ where: { id: schoolId } });
      await tx.adminAuditLog.create({
        data: createAuditLogData({
          actorId: actor.id,
          action: "SCHOOL_DELETED",
          entityType: "School",
          entityId: schoolId,
          before: { name: school.name, groupCount: school._count.groups, affectedUsers },
        }),
      });
    });
    return Response.json({ ok: true, schoolId, affectedUsers });
  } catch (error) {
    return apiError(error, "학교를 삭제하지 못했습니다.");
  }
}
