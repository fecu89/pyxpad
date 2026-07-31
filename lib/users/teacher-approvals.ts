import "server-only";

import { getPrisma } from "@/lib/prisma";
import { decryptOptionalUserPii, decryptUserPii, maskEmail } from "@/lib/security/pii-crypto";

export type TeacherApprovalRecord = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewReason: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  user: { id: string; name: string | null; maskedEmail: string; image: string | null };
  school: { id: string; name: string };
  schoolGroup: { id: string; name: string };
};

export async function getTeacherApprovalForUser(userId: string) {
  const request = await getPrisma().teacherApprovalRequest.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      reviewReason: true,
      requestedAt: true,
      reviewedAt: true,
      school: { select: { id: true, name: true } },
      schoolGroup: { select: { id: true, name: true, type: true } },
    },
  });
  if (!request) return null;
  return {
    ...request,
    requestedAt: request.requestedAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
  };
}

export async function getTeacherApprovalQueue(input: {
  schoolId?: string;
  page: number;
  pageSize: number;
}) {
  const where = {
    status: "PENDING" as const,
    ...(input.schoolId ? { schoolId: input.schoolId } : {}),
  };
  const prisma = getPrisma();
  const [totalCount, requests] = await Promise.all([
    prisma.teacherApprovalRequest.count({ where }),
    prisma.teacherApprovalRequest.findMany({
      where,
      orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        status: true,
        reviewReason: true,
        requestedAt: true,
        reviewedAt: true,
        user: {
          select: {
            id: true,
            emailEncrypted: true,
            nameEncrypted: true,
            imageEncrypted: true,
          },
        },
        school: { select: { id: true, name: true } },
        schoolGroup: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    requests: requests.map((request): TeacherApprovalRecord => {
      const email = decryptUserPii(request.user.id, "email", request.user.emailEncrypted);
      return {
        id: request.id,
        status: request.status,
        reviewReason: request.reviewReason,
        requestedAt: request.requestedAt.toISOString(),
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
        user: {
          id: request.user.id,
          name: decryptOptionalUserPii(request.user.id, "name", request.user.nameEncrypted),
          maskedEmail: maskEmail(email),
          image: decryptOptionalUserPii(request.user.id, "image", request.user.imageEncrypted),
        },
        school: request.school,
        schoolGroup: request.schoolGroup,
      };
    }),
    totalCount,
    page: input.page,
    pageSize: input.pageSize,
  };
}
