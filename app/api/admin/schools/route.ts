import { z } from "zod";
import { requireRole } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";

const createSchoolSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/).nullable().optional(),
  level: z.enum(["ELEMENTARY", "MIDDLE", "HIGH"]).default("HIGH"),
  district: z.string().trim().max(100).nullable().optional(),
  operatingStatus: z.enum(["OPERATING", "PLANNED", "INACTIVE"]).default("OPERATING"),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireRole(["SUPER_ADMIN"]);
    const parsed = createSchoolSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "학교 이름을 확인해 주세요." }, { status: 400 });

    const prisma = getPrisma();
    const normalizedCode = parsed.data.code?.toUpperCase() || null;
    const existing = await prisma.school.findFirst({
      where: { OR: [{ name: parsed.data.name }, ...(normalizedCode ? [{ code: normalizedCode }] : [])] },
      select: { name: true, code: true },
    });
    if (existing) return Response.json({ error: existing.name === parsed.data.name ? "같은 이름의 학교가 이미 있습니다." : "같은 학교 코드가 이미 있습니다." }, { status: 409 });

    const school = await prisma.$transaction(async (tx) => {
      const created = await tx.school.create({
        data: {
          name: parsed.data.name,
          code: normalizedCode,
          level: parsed.data.level,
          district: parsed.data.district || null,
          operatingStatus: parsed.data.operatingStatus,
        },
        select: { id: true, name: true, code: true, level: true, district: true, operatingStatus: true },
      });
      await tx.adminAuditLog.create({
        data: createAuditLogData({
          actorId: actor.id,
          action: "SCHOOL_CREATED",
          entityType: "School",
          entityId: created.id,
          after: created,
        }),
      });
      return created;
    });
    return Response.json({ school: { ...school, userCount: 0, studentCount: 0, teacherCount: 0, unnumberedStudentCount: 0, unassignedStudentCount: 0, isDefault: false, teachers: [], groups: [] } }, { status: 201 });
  } catch (error) {
    return apiError(error, "학교를 추가하지 못했습니다.");
  }
}
