import "server-only";

import type { SystemPermission, UserRole, UserStatus } from "@/generated/prisma/client";
import { decryptOptionalUserPii, decryptUserPii, maskEmail } from "@/lib/security/pii-crypto";
import { getPrisma } from "@/lib/prisma";

export type PublicAuthorDTO = {
  id: string;
  name: string | null;
  image: string | null;
};

export type PrivateUserDTO = PublicAuthorDTO & {
  email: string;
  role: UserRole;
  status: UserStatus;
  authVersion: number;
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
  maskedEmail: string;
  role: UserRole;
  status: UserStatus;
  authVersion: number;
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
  emailLookup?: string;
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

export function decryptUserEmail(user: { id: string; emailEncrypted: string | null }) {
  if (!user.emailEncrypted) throw new Error("사용자 이메일 암호화 데이터가 준비되지 않았습니다.");
  return decryptUserPii(user.id, "email", user.emailEncrypted);
}

export function toPrivateUserDTO(user: {
  id: string;
  emailEncrypted: string | null;
  nameEncrypted: string | null;
  imageEncrypted: string | null;
  role: UserRole;
  status: UserStatus;
  authVersion: number;
  onboardingCompletedAt: Date | null;
  lastLoginAt: Date | null;
  systemPermissions: { permission: SystemPermission }[];
  school: { id: string; name: string } | null;
  schoolGroup: { id: string; name: string; type: "CLASS" | "DEPARTMENT" } | null;
  isSchoolRepresentative: boolean;
}): PrivateUserDTO {
  return {
    ...toPublicAuthorDTO(user),
    email: decryptUserEmail(user),
    role: user.role,
    status: user.status,
    authVersion: user.authVersion,
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
      emailEncrypted: true,
      nameEncrypted: true,
      imageEncrypted: true,
      role: true,
      status: true,
      authVersion: true,
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
  emailEncrypted: string | null;
  nameEncrypted: string | null;
  role: UserRole;
  status: UserStatus;
  authVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  systemPermissions: { permission: SystemPermission }[];
  _count: { ownedBoards: number; memberships: number };
  school: { id: string; name: string } | null;
  schoolGroup: { id: string; name: string; type: "CLASS" | "DEPARTMENT" } | null;
  isSchoolRepresentative: boolean;
}): AdminUserDTO {
  const email = decryptUserEmail(user);
  return {
    id: user.id,
    name: decryptOptionalUserPii(user.id, "name", user.nameEncrypted),
    maskedEmail: maskEmail(email),
    role: user.role,
    status: user.status,
    authVersion: user.authVersion,
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
    ...(filters.emailLookup ? { emailLookup: filters.emailLookup } : {}),
    ...(filters.schoolId ? { schoolId: filters.schoolId } : {}),
    ...(filters.schoolGroupId ? { schoolGroupId: filters.schoolGroupId } : {}),
    ...(!filters.status ? { status: { not: "DELETED" as const } } : {}),
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
        emailEncrypted: true,
        nameEncrypted: true,
        role: true,
        status: true,
        authVersion: true,
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
