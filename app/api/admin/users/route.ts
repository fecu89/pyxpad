import { z } from "zod";
import { AuthorizationError, hasSystemPermission, requireActiveUser } from "@/lib/auth/authorization";
import { apiError } from "@/lib/http";
import { createEmailLookup } from "@/lib/security/pii-crypto";
import { getAdminUserPage } from "@/lib/users/repository";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((value) => [10, 50, 100].includes(value), "페이지 크기는 10·50·100 중 하나여야 합니다.").default(10),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  email: z.email().optional(),
  schoolId: z.string().min(1).optional(),
  schoolGroupId: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireActiveUser();
    const isRepresentative = actor.role === "TEACHER" && actor.isSchoolRepresentative;
    if (!hasSystemPermission(actor, "VIEW_USERS") && !isRepresentative) {
      throw new AuthorizationError();
    }
    if (isRepresentative && !actor.school) {
      throw new AuthorizationError();
    }
    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return Response.json({ error: "검색 조건을 확인해 주세요." }, { status: 400 });
    const { page, pageSize, role, status, email, schoolId, schoolGroupId } = parsed.data;
    // VIEW_USERS 권한이 없는 순수 대표교사는 요청 값과 무관하게 자기 학교로만 조회를 제한합니다.
    const scopedSchoolId = !hasSystemPermission(actor, "VIEW_USERS") && isRepresentative
      ? actor.school!.id
      : schoolId;
    const result = await getAdminUserPage({ page, pageSize, role, status, schoolId: scopedSchoolId, schoolGroupId, emailLookup: email ? createEmailLookup(email) : undefined });
    return Response.json(
      result,
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error, "사용자 목록을 불러오지 못했습니다.");
  }
}
