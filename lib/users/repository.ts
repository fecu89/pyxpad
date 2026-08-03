import "server-only";

import type { SystemPermission, UserRole, UserStatus } from "@/generated/prisma/client";
import { decryptOptionalUserPii, decryptUserLoginIdentifier as decryptStoredLoginIdentifier, maskLoginIdentifier } from "@/lib/security/pii-crypto";
import { getPrisma } from "@/lib/prisma";

export type PublicAuthorDTO = {
  id: string;
  name: string | null;
  image: string | null;
};

export type PrivateUserDTO = PublicAuthorDTO & {
  loginIdentifier: string;
  loginType: "LOGIN_ID" | "KAKAO_EMAIL";
  loginId: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  authVersion: number;
  hasPasswordCredential: boolean;
  mustChangePassword: boolean;
  studentNumber: number | null;
  onboardingCompletedAt: Date | null;
  lastLoginAt: Date | null;
  systemPermissions: SystemPermission[];
  school: { id: string; name: string } | null;
  schoolGroup: { id: string; name: string; type: "CLASS" | "DEPARTMENT" } | null;
  isSchoolRepresentative: boolean;
};

export type AdminUserDTO = {
  id: string;
  name: string | null;
  maskedLoginIdentifier: string;
  loginType: "LOGIN_ID" | "KAKAO_EMAIL";
  role: UserRole;
  status: UserStatus;
  authVersion: number;
  hasPasswordCredential: boolean;
  mustChangePassword: boolean;
  studentNumber: number | null;
  lastLoginAt: string | null;
  createdAt: string;
  ownedBoardCount: number;
  memberBoardCount: number;
  systemPermissions: SystemPermission[];
  school: { id: string; name: string } | null;
  schoolGroup: { id: string; name: string; type: "CLASS" | "DEPARTMENT" } | null;
  isSchoolRepresentative: boolean;
};

export type AdminUserListFilters = {
  page: number;
  pageSize: number;
  role?: UserRole;
  status?: UserStatus;
  loginIdentifierLookup?: string;
  schoolId?: string;
  schoolGroupId?: string;
};

export type EncryptedPublicUser = {
  id: string;
  nameEncrypted: string | null;
  imageEncrypted: string | null;
};

export function toPublicAuthorDTO(user: EncryptedPublicUser): PublicAuthorDTO {
  return {
    id: user.id,
    name: decryptOptionalUserPii(user.id, "name", user.nameEncrypted),
    image: decryptOptionalUserPii(user.id, "image", user.imageEncrypted),
  };
}

export function decryptUserLoginIdentifier(user: { id: string; loginIdentifierEncrypted: string | null }) {
  if (!user.loginIdentifierEncrypted) throw new Error("사용자 로그인 식별자 암호화 데이터가 준비되지 않았습니다.");
  return decryptStoredLoginIdentifier(user.id, user.loginIdentifierEncrypted);
}

export function toPrivateUserDTO(user: {
  id: string;
  loginIdentifierEncrypted: string | null;
  nameEncrypted: string | null;
  imageEncrypted: string | null;
  role: UserRole;
  status: UserStatus;
  authVersion: number;
  passwordHash: string | null;
  mustChangePassword: boolean;
  studentNumber: number | null;
  onboardingCompletedAt: Date | null;
  lastLoginAt: Date | null;
  systemPermissions: { permission: SystemPermission }[];
  school: { id: string; name: string } | null;
  schoolGroup: { id: string; name: string; type: "CLASS" | "DEPARTMENT" } | null;
  isSchoolRepresentative: boolean;
}): PrivateUserDTO {
  const loginIdentifier = decryptUserLoginIdentifier(user);
  const hasPasswordCredential = Boolean(user.passwordHash);
  return {
    ...toPublicAuthorDTO(user),
    loginIdentifier,
    loginType: hasPasswordCredential ? "LOGIN_ID" : "KAKAO_EMAIL",
    loginId: hasPasswordCredential ? loginIdentifier : null,
    email: hasPasswordCredential ? null : loginIdentifier,
    role: user.role,
    status: user.status,
    authVersion: user.authVersion,
    hasPasswordCredential,
    mustChangePassword: user.mustChangePassword,
    studentNumber: user.studentNumber,
    onboardingCompletedAt: user.onboardingCompletedAt,
    lastLoginAt: user.lastLoginAt,
    systemPermissions: user.systemPermissions.map(({ permission }) => permission),
    school: user.school,
    schoolGroup: user.schoolGroup,
    isSchoolRepresentative: user.isSchoolRepresentative,
  };
}

export async function getPrivateUserDTO(userId: string) {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      loginIdentifierEncrypted: true,
      nameEncrypted: true,
      imageEncrypted: true,
      role: true,
      status: true,
      authVersion: true,
      passwordHash: true,
      mustChangePassword: true,
      studentNumber: true,
      onboardingCompletedAt: true,
      lastLoginAt: true,
      systemPermissions: { select: { permission: true } },
      school: { select: { id: true, name: true } },
      schoolGroup: { select: { id: true, name: true, type: true } },
      isSchoolRepresentative: true,
    },
  });
  return user ? toPrivateUserDTO(user) : null;
}

export function toAdminUserDTO(user: {
  id: string;
  loginIdentifierEncrypted: string | null;
  nameEncrypted: string | null;
  role: UserRole;
  status: UserStatus;
  authVersion: number;
  passwordHash: string | null;
  mustChangePassword: boolean;
  studentNumber: number | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  systemPermissions: { permission: SystemPermission }[];
  _count: { ownedBoards: number; memberships: number };
  school: { id: string; name: string } | null;
  schoolGroup: { id: string; name: string; type: "CLASS" | "DEPARTMENT" } | null;
  isSchoolRepresentative: boolean;
}): AdminUserDTO {
  const loginIdentifier = decryptUserLoginIdentifier(user);
  const hasPasswordCredential = Boolean(user.passwordHash);
  return {
    id: user.id,
    name: decryptOptionalUserPii(user.id, "name", user.nameEncrypted),
    maskedLoginIdentifier: maskLoginIdentifier(loginIdentifier),
    loginType: hasPasswordCredential ? "LOGIN_ID" : "KAKAO_EMAIL",
    role: user.role,
    status: user.status,
    authVersion: user.authVersion,
    hasPasswordCredential,
    mustChangePassword: user.mustChangePassword,
    studentNumber: user.studentNumber,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    ownedBoardCount: user._count.ownedBoards,
    memberBoardCount: user._count.memberships,
    systemPermissions: user.systemPermissions.map(({ permission }) => permission),
    school: user.school,
    schoolGroup: user.schoolGroup,
    isSchoolRepresentative: user.isSchoolRepresentative,
  };
}

export async function getAdminUserPage(filters: AdminUserListFilters) {
  const where = {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.loginIdentifierLookup ? { loginIdentifierLookup: filters.loginIdentifierLookup } : {}),
    ...(filters.schoolId ? { schoolId: filters.schoolId } : {}),
    ...(filters.schoolGroupId ? { schoolGroupId: filters.schoolGroupId } : {}),
    ...(!filters.status ? { status: { not: "DELETED" as const } } : {}),
    // 교사 가입 승인 대기 중인 지원자는 아직 학교·역할이 정해지지 않은 임시 상태라 여기서는
    // 숨기고, 승인 전까지는 `교사 가입 요청` 대기열에서만 보이게 합니다(승인·반려 후에는
    // role/status가 확정되므로 다시 이 목록에 나타납니다).
    NOT: { teacherApprovalRequest: { status: "PENDING" as const } },
  };
  const prisma = getPrisma();
  const [totalCount, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true,
        loginIdentifierEncrypted: true,
        nameEncrypted: true,
        role: true,
        status: true,
        authVersion: true,
        passwordHash: true,
        mustChangePassword: true,
        studentNumber: true,
        lastLoginAt: true,
        createdAt: true,
        systemPermissions: { select: { permission: true }, orderBy: { permission: "asc" } },
        school: { select: { id: true, name: true } },
        schoolGroup: { select: { id: true, name: true, type: true } },
        isSchoolRepresentative: true,
        _count: { select: { ownedBoards: true, memberships: true } },
      },
    }),
  ]);
  return {
    users: users.map(toAdminUserDTO),
    totalCount,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}
