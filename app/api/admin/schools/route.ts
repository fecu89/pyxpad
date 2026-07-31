import { z } from "zod";
import { requireRole } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";

const createSchoolSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireRole(["SUPER_ADMIN"]);
    const parsed = createSchoolSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "학교 이름을 확인해 주세요." }, { status: 400 });

    const prisma = getPrisma();
    const existing = await prisma.school.findUnique({ where: { name: parsed.data.name }, select: { id: true } });
    if (existing) return Response.json({ error: "같은 이름의 학교가 이미 있습니다." }, { status: 409 });

    const school = await prisma.$transaction(async (tx) => {
      const created = await tx.school.create({ data: { name: parsed.data.name }, select: { id: true, name: true } });
      await tx.adminAuditLog.create({
        data: createAuditLogData({
          actorId: actor.id,
          action: "SCHOOL_CREATED",
          entityType: "School",
          entityId: created.id,
          after: { name: created.name },
        }),
      });
      return created;
    });
    return Response.json({ school: { ...school, userCount: 0, isDefault: false, groups: [] } }, { status: 201 });
  } catch (error) {
    return apiError(error, "학교를 추가하지 못했습니다.");
  }
}
