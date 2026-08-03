import "server-only";

import { getPrisma } from "@/lib/prisma";
import { decryptOptionalUserPii } from "@/lib/security/pii-crypto";

export const DEFAULT_SCHOOL_ID = "school_cheonghak_high";
export const DEFAULT_STUDENT_GROUP_ID = "group_cheonghak_grade3_class5";
export const DEFAULT_TEACHER_GROUP_ID = "group_cheonghak_grade3_department";

// 소속 삭제 전에 몇 명이 영향을 받는지 보여주려고(School.groups는 onDelete: Cascade,
// User.schoolId/schoolGroupId는 onDelete: SetNull) 학교·반/부서 각각의 소속 인원수를 함께 조회합니다.
export async function getSchoolDirectory() {
  const prisma = getPrisma();
  const [schools, roleCounts, unnumberedCounts, unassignedCounts] = await Promise.all([
    prisma.school.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        level: true,
        district: true,
        operatingStatus: true,
        _count: { select: { users: true } },
        users: {
          where: { role: "TEACHER", status: "ACTIVE" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, nameEncrypted: true, isSchoolRepresentative: true, schoolGroup: { select: { name: true } } },
        },
        groups: {
          orderBy: [{ type: "asc" }, { grade: { grade: "asc" } }, { classNumber: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            type: true,
            classNumber: true,
            grade: { select: { grade: true } },
            _count: { select: { users: true } },
          },
        },
      },
    }),
    prisma.user.groupBy({
      by: ["schoolId", "role"],
      where: { schoolId: { not: null }, status: { not: "DELETED" } },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["schoolId"],
      where: { schoolId: { not: null }, role: "STUDENT", status: { not: "DELETED" }, studentNumber: null },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["schoolId"],
      where: { schoolId: { not: null }, role: "STUDENT", status: { not: "DELETED" }, schoolGroupId: null },
      _count: { _all: true },
    }),
  ]);
  const countFor = (schoolId: string, role: "STUDENT" | "TEACHER") => roleCounts.find((item) => item.schoolId === schoolId && item.role === role)?._count._all ?? 0;
  const groupedCountFor = (rows: typeof unnumberedCounts, schoolId: string) => rows.find((item) => item.schoolId === schoolId)?._count._all ?? 0;
  return schools.map((school) => ({
    id: school.id,
    name: school.name,
    code: school.code,
    level: school.level,
    district: school.district,
    operatingStatus: school.operatingStatus,
    userCount: school._count.users,
    studentCount: countFor(school.id, "STUDENT"),
    teacherCount: countFor(school.id, "TEACHER"),
    unnumberedStudentCount: groupedCountFor(unnumberedCounts, school.id),
    unassignedStudentCount: groupedCountFor(unassignedCounts, school.id),
    isDefault: school.id === DEFAULT_SCHOOL_ID,
    teachers: school.users.map((teacher) => ({
      id: teacher.id,
      name: decryptOptionalUserPii(teacher.id, "name", teacher.nameEncrypted),
      departmentName: teacher.schoolGroup?.name ?? null,
      isSchoolRepresentative: teacher.isSchoolRepresentative,
    })),
    groups: school.groups.map((group) => ({
      id: group.id,
      name: group.name,
      type: group.type,
      grade: group.grade?.grade ?? null,
      classNumber: group.classNumber,
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
        orderBy: [{ type: "asc" }, { grade: { grade: "asc" } }, { classNumber: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          type: true,
          classNumber: true,
          grade: { select: { grade: true } },
        },
      },
    },
  }).then((schools) => schools.map((school) => ({
    ...school,
    groups: school.groups.map((group) => ({
      id: group.id,
      name: group.name,
      type: group.type,
      grade: group.grade?.grade ?? null,
      classNumber: group.classNumber,
    })),
  })));
}
