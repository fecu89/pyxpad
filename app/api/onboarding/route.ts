import { z } from "zod";
import { requireActiveUser } from "@/lib/auth/authorization";
import { apiError, assertSameOrigin } from "@/lib/http";
import { createNotification } from "@/lib/notifications/create";
import { getPrisma } from "@/lib/prisma";
import { encryptUserPii } from "@/lib/security/pii-crypto";

const completeOnboardingSchema = z.object({
  name: z.string().trim().min(1, "닉네임을 입력해 주세요.").max(60, "닉네임은 60자 이하로 입력해 주세요."),
  accountType: z.enum(["STUDENT", "TEACHER"]),
  schoolId: z.string().min(1).max(100),
  schoolGroupId: z.string().min(1).max(100),
});

function requiredGroupType(accountType: "STUDENT" | "TEACHER") {
  return accountType === "STUDENT" ? "CLASS" as const : "DEPARTMENT" as const;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    if (user.onboardingCompletedAt) {
      return Response.json({ error: "이미 가입 정보 설정을 완료했습니다." }, { status: 409 });
    }
    const existingRequest = await getPrisma().teacherApprovalRequest.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (existingRequest?.status === "PENDING") {
      return Response.json(
        { error: "교사 가입 승인을 기다리고 있습니다.", approvalPending: true },
        { status: 409 },
      );
    }
    const parsed = completeOnboardingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "가입 정보를 확인해 주세요." },
        { status: 400 },
      );
    }

    const group = await getPrisma().schoolGroup.findFirst({
      where: {
        id: parsed.data.schoolGroupId,
        schoolId: parsed.data.schoolId,
        type: requiredGroupType(parsed.data.accountType),
      },
      select: { id: true, school: { select: { id: true, name: true } }, name: true, type: true },
    });
    if (!group) {
      return Response.json(
        { error: parsed.data.accountType === "STUDENT" ? "선택한 학교의 학생 반을 확인해 주세요." : "선택한 학교의 교사 부서를 확인해 주세요." },
        { status: 400 },
      );
    }

    const completedAt = new Date();
    if (parsed.data.accountType === "TEACHER" && user.role === "STUDENT") {
      await getPrisma().$transaction(async (tx) => {
        const updated = await tx.user.updateMany({
          where: { id: user.id, onboardingCompletedAt: null, status: "ACTIVE", role: "STUDENT" },
          data: {
            nameEncrypted: encryptUserPii(user.id, "name", parsed.data.name),
            schoolId: null,
            schoolGroupId: null,
          },
        });
        if (updated.count !== 1) throw new Error("가입 정보가 이미 처리되었습니다. 페이지를 새로고침해 주세요.");
        await tx.teacherApprovalRequest.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            schoolId: group.school.id,
            schoolGroupId: group.id,
            status: "PENDING",
            requestedAt: completedAt,
          },
          update: {
            schoolId: group.school.id,
            schoolGroupId: group.id,
            status: "PENDING",
            reviewReason: null,
            reviewedById: null,
            reviewedAt: null,
            requestedAt: completedAt,
          },
        });
      });
      const approvers = await getPrisma().user.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { role: "SUPER_ADMIN" },
            {
              role: "TEACHER",
              isSchoolRepresentative: true,
              schoolId: group.school.id,
            },
          ],
        },
        select: { id: true },
      });
      await Promise.all(
        approvers.map((approver) =>
          createNotification({
            userId: approver.id,
            actorId: user.id,
            type: "TEACHER_APPROVAL_REQUESTED",
          }).catch((error) => console.error("교사 승인 요청 알림 생성 실패", error)),
        ),
      );
      return Response.json({
        ok: true,
        approvalPending: true,
        name: parsed.data.name,
        school: group.school,
        schoolGroup: { id: group.id, name: group.name, type: group.type },
        requestedAt: completedAt.toISOString(),
      });
    }

    if (parsed.data.accountType === "STUDENT" && user.role !== "STUDENT") {
      return Response.json({ error: "이미 부여된 교사·관리자 역할은 가입 화면에서 변경할 수 없습니다." }, { status: 400 });
    }
    const updated = await getPrisma().user.updateMany({
      where: { id: user.id, onboardingCompletedAt: null, status: "ACTIVE" },
      data: {
        nameEncrypted: encryptUserPii(user.id, "name", parsed.data.name),
        schoolId: group.school.id,
        schoolGroupId: group.id,
        onboardingCompletedAt: completedAt,
      },
    });
    if (updated.count !== 1) {
      return Response.json({ error: "가입 정보가 이미 처리되었습니다. 페이지를 새로고침해 주세요." }, { status: 409 });
    }
    return Response.json({
      ok: true,
      name: parsed.data.name,
      school: group.school,
      schoolGroup: { id: group.id, name: group.name, type: group.type },
      onboardingCompletedAt: completedAt.toISOString(),
    });
  } catch (error) {
    return apiError(error, "가입 정보를 저장하지 못했습니다.");
  }
}
