import "server-only";

import { getPrisma } from "@/lib/prisma";

export const DEFAULT_SCHOOL_ID = "school_cheonghak_high";
export const DEFAULT_STUDENT_GROUP_ID = "group_cheonghak_grade3_class5";
export const DEFAULT_TEACHER_GROUP_ID = "group_cheonghak_grade3_department";

// 소속 삭제 전에 몇 명이 영향을 받는지 보여주려고(School.groups는 onDelete: Cascade,
// User.schoolId/schoolGroupId는 onDelete: SetNull) 학교·반/부서 각각의 소속 인원수를 함께 조회합니다.
export async function getSchoolDirectory() {
  const schools = await getPrisma().school.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { users: true } },
      groups: {
        orderBy: [{ type: "asc" }, { name: "asc" }],
        select: { id: true, name: true, type: true, _count: { select: { users: true } } },
      },
    },
  });
  return schools.map((school) => ({
    id: school.id,
    name: school.name,
    userCount: school._count.users,
    isDefault: school.id === DEFAULT_SCHOOL_ID,
    groups: school.groups.map((group) => ({
      id: group.id,
      name: group.name,
      type: group.type,
      userCount: group._count.users,
      isDefault: group.id === DEFAULT_STUDENT_GROUP_ID || group.id === DEFAULT_TEACHER_GROUP_ID,
    })),
  }));
}

// 가입 화면은 관리자용 인원수·기본 소속 플래그가 필요 없으므로 선택에 필요한 최소 필드만
// 내려줍니다. 가입자는 이 디렉터리에 등록된 학교와 반/부서만 선택할 수 있습니다.
export async function getOnboardingOrganizationOptions() {
  return getPrisma().school.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      groups: {
        orderBy: [{ type: "asc" }, { name: "asc" }],
        select: { id: true, name: true, type: true },
      },
    },
  });
}
