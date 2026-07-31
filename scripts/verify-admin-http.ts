import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import { getPrisma } from "../lib/prisma";
import { createEmailLookup, decryptUserPii, encryptOptionalUserPii, encryptUserPii, maskEmail } from "../lib/security/pii-crypto-core";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3001";
function requireAuthSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET 환경 변수가 필요합니다.");
  return value;
}

const secret = requireAuthSecret();
const cleanupUserIds = new Set<string>();
const cleanupBoardIds = new Set<string>();
let cleanupSchoolId: string | null = null;

async function sessionCookie(user: { id: string; authVersion: number }) {
  const token = await encode({
    secret,
    maxAge: 300,
    token: { userId: user.id, authVersion: user.authVersion, sessionInvalid: false },
  });
  return `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}`;
}

async function main() {
  const prisma = getPrisma();
  const verificationAdminId = randomUUID();
  const verificationAdminEmail = `verify-admin-${verificationAdminId}@invalid.local`;
  cleanupUserIds.add(verificationAdminId);
  const superAdmin = await prisma.user.create({
    data: {
      id: verificationAdminId,
      emailLookup: createEmailLookup(verificationAdminEmail),
      emailEncrypted: encryptUserPii(verificationAdminId, "email", verificationAdminEmail),
      nameEncrypted: encryptOptionalUserPii(verificationAdminId, "name", "검증용 전체관리자"),
      role: "SUPER_ADMIN",
      lastLoginAt: new Date(),
    },
    select: { id: true, authVersion: true },
  });
  const verificationStudentId = randomUUID();
  const verificationStudentEmail = `verify-student-${verificationStudentId}@invalid.local`;
  cleanupUserIds.add(verificationStudentId);
  await prisma.user.create({
    data: {
      id: verificationStudentId,
      emailLookup: createEmailLookup(verificationStudentEmail),
      emailEncrypted: encryptUserPii(verificationStudentId, "email", verificationStudentEmail),
      nameEncrypted: encryptOptionalUserPii(verificationStudentId, "name", "검증용 학생"),
      role: "STUDENT",
    },
  });
  const verificationBoard = await prisma.board.create({
    data: {
      slug: `verify-admin-http-${randomUUID()}`,
      title: "[검증용] 공개 패드",
      ownerId: verificationAdminId,
      discoveryScope: "PUBLIC",
      visitorPermission: "READER",
      loginRequired: false,
      members: {
        create: [
          { userId: verificationAdminId, role: "OWNER" },
          { userId: verificationStudentId, role: "MEMBER" },
        ],
      },
    },
    select: { id: true },
  });
  cleanupBoardIds.add(verificationBoard.id);
  const student = await prisma.user.findUnique({
    where: { id: verificationStudentId },
    select: { id: true, authVersion: true, emailEncrypted: true, memberships: { where: { board: { deletedAt: null, discoveryScope: "PUBLIC" }, role: "MEMBER" }, take: 1, select: { boardId: true, board: { select: { slug: true } } } } },
  });
  assert.ok(student, "권한 차단 검증용 활성 학생이 필요합니다.");
  const [superCookie, studentCookie] = await Promise.all([sessionCookie(superAdmin), sessionCookie(student)]);

  const anonymousUsers = await fetch(`${baseUrl}/api/admin/users`);
  assert.equal(anonymousUsers.status, 401, "비로그인 관리자 API는 401이어야 합니다.");

  const superUsers = await fetch(`${baseUrl}/api/admin/users?page=1&pageSize=10`, { headers: { Cookie: superCookie } });
  assert.equal(superUsers.status, 200, "전체관리자는 사용자 목록을 조회할 수 있어야 합니다.");
  const userPage = await superUsers.json() as { users?: unknown[]; totalCount?: number; page?: number; pageSize?: number };
  assert.ok(Array.isArray(userPage.users), "사용자 목록 응답 형식이 올바르지 않습니다.");
  assert.equal(userPage.page, 1);
  assert.equal(userPage.pageSize, 10);
  assert.equal(typeof userPage.totalCount, "number");
  assert.doesNotMatch(JSON.stringify(userPage), /emailEncrypted|nameEncrypted|imageEncrypted|v1:/, "관리자 목록에 암호문이 노출되면 안 됩니다.");

  const auditLogs = await fetch(`${baseUrl}/api/admin/audit-logs?limit=5`, { headers: { Cookie: superCookie } });
  assert.equal(auditLogs.status, 200, "전체관리자는 감사 로그를 조회할 수 있어야 합니다.");

  const adminPage = await fetch(`${baseUrl}/admin`, { headers: { Cookie: superCookie } });
  assert.equal(adminPage.status, 200, "전체관리자 관리자 페이지가 열려야 합니다.");
  const adminHtml = await adminPage.text();
  assert.match(adminHtml, /관리자 센터|사용자와 권한/);
  assert.doesNotMatch(adminHtml, /emailEncrypted|nameEncrypted|imageEncrypted|v1:/, "관리자 HTML에 암호문이 노출되면 안 됩니다.");

  const studentUsers = await fetch(`${baseUrl}/api/admin/users`, { headers: { Cookie: studentCookie } });
  assert.equal(studentUsers.status, 403, "학생의 관리자 API 접근은 403이어야 합니다.");

  const [anonymousHome, superHome, studentHome] = await Promise.all([
    fetch(`${baseUrl}/`),
    fetch(`${baseUrl}/`, { headers: { Cookie: superCookie } }),
    fetch(`${baseUrl}/`, { headers: { Cookie: studentCookie } }),
  ]);
  assert.equal(anonymousHome.status, 200, "비로그인 홈이 열려야 합니다.");
  assert.equal(superHome.status, 200, "전체관리자 홈이 열려야 합니다.");
  assert.equal(studentHome.status, 200, "학생 홈이 열려야 합니다.");
  const [anonymousHomeHtml, superHomeHtml, studentHomeHtml] = await Promise.all([
    anonymousHome.text(),
    superHome.text(),
    studentHome.text(),
  ]);
  assert.doesNotMatch(anonymousHomeHtml, /data-home-action="create-board"/, "비로그인 SSR에 보드 생성 UI가 포함되면 안 됩니다.");
  assert.doesNotMatch(anonymousHomeHtml, /data-home-dashboard/, "비로그인 SSR에 개인 대시보드가 포함되면 안 됩니다.");
  assert.match(superHomeHtml, /data-home-action="create-board"/, "전체관리자 SSR에는 보드 생성 UI가 있어야 합니다.");
  assert.match(superHomeHtml, /data-home-dashboard/, "전체관리자 SSR에는 개인 대시보드가 있어야 합니다.");
  assert.match(superHomeHtml, /패드를 폴더로 정리/, "로그인 대시보드에는 폴더 사용 안내가 있어야 합니다.");
  assert.doesNotMatch(studentHomeHtml, /data-home-action="create-board"/, "학생 SSR에 보드 생성 UI가 포함되면 안 됩니다.");
  assert.match(studentHomeHtml, /data-home-dashboard/, "학생 SSR에는 참여 보드 대시보드가 있어야 합니다.");

  const studentCreateBoard = await fetch(`${baseUrl}/api/boards`, {
    method: "POST",
    headers: { Cookie: studentCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "생성되면 안 됨", discoveryScope: "PRIVATE" }),
  });
  assert.equal(studentCreateBoard.status, 403, "학생의 직접 보드 생성 요청은 403이어야 합니다.");

  const studentBoardId = student.memberships[0]?.boardId;
  assert.ok(studentBoardId, "학생 보관함 검증용 보드 멤버십이 필요합니다.");
  const studentTrash = await fetch(`${baseUrl}/api/boards/${studentBoardId}/trash`, { headers: { Cookie: studentCookie } });
  assert.equal(studentTrash.status, 200, "보드 멤버인 학생은 자신의 복구 가능 항목 보관함을 열 수 있어야 합니다.");
  assert.doesNotMatch(await studentTrash.text(), /emailEncrypted|nameEncrypted|imageEncrypted|v1:/, "보관함에 암호문이 노출되면 안 됩니다.");

  const publicBoardSlug = student.memberships[0]?.board.slug;
  assert.ok(publicBoardSlug, "공개 보드 개인정보 노출 검증용 slug가 필요합니다.");
  const publicBoard = await fetch(`${baseUrl}/b/${publicBoardSlug}`);
  assert.equal(publicBoard.status, 200, "공개 보드는 비로그인 상태에서 열려야 합니다.");
  const publicBoardHtml = await publicBoard.text();
  const studentMaskedEmail = maskEmail(decryptUserPii(student.id, "email", student.emailEncrypted));
  assert.ok(!publicBoardHtml.includes(studentMaskedEmail), "공개 보드 HTML에 멤버의 마스킹 이메일도 노출되면 안 됩니다.");
  assert.doesNotMatch(publicBoardHtml, /emailEncrypted|nameEncrypted|imageEncrypted|v1:/, "공개 보드 HTML에 암호문이 노출되면 안 됩니다.");

  const crossOriginAdminMutation = await fetch(`${baseUrl}/api/admin/users/${student.id}`, {
    method: "PATCH",
    headers: { Cookie: superCookie, Origin: "https://invalid.example", "Content-Type": "application/json" },
    body: JSON.stringify({ status: "SUSPENDED", reason: "교차 출처 차단 검증" }),
  });
  assert.equal(crossOriginAdminMutation.status, 403, "교차 출처 관리자 변경 요청은 403이어야 합니다.");

  const organizationKey = randomUUID().slice(0, 8);
  const schoolCreate = await fetch(`${baseUrl}/api/admin/schools`, {
    method: "POST",
    headers: { Cookie: superCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `검증학교-${organizationKey}` }),
  });
  assert.equal(schoolCreate.status, 201, "전체관리자는 학교를 추가할 수 있어야 합니다.");
  const schoolCreateResult = await schoolCreate.json() as { school: { id: string; name: string; userCount: number } };
  cleanupSchoolId = schoolCreateResult.school.id;
  assert.equal(schoolCreateResult.school.userCount, 0);

  const schoolRename = await fetch(`${baseUrl}/api/admin/schools/${cleanupSchoolId}`, {
    method: "PATCH",
    headers: { Cookie: superCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `검증학교수정-${organizationKey}` }),
  });
  assert.equal(schoolRename.status, 200, "전체관리자는 학교 이름을 변경할 수 있어야 합니다.");

  const classCreate = await fetch(`${baseUrl}/api/admin/schools/${cleanupSchoolId}/groups`, {
    method: "POST",
    headers: { Cookie: superCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "검증반", type: "CLASS" }),
  });
  assert.equal(classCreate.status, 201, "전체관리자는 반을 추가할 수 있어야 합니다.");
  const classGroup = (await classCreate.json() as { group: { id: string } }).group;

  const departmentCreate = await fetch(`${baseUrl}/api/admin/schools/${cleanupSchoolId}/groups`, {
    method: "POST",
    headers: { Cookie: superCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "검증부서", type: "DEPARTMENT" }),
  });
  assert.equal(departmentCreate.status, 201, "전체관리자는 부서를 추가할 수 있어야 합니다.");
  const departmentGroup = (await departmentCreate.json() as { group: { id: string } }).group;

  const classRename = await fetch(`${baseUrl}/api/admin/schools/${cleanupSchoolId}/groups/${classGroup.id}`, {
    method: "PATCH",
    headers: { Cookie: superCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "검증반 수정", type: "CLASS" }),
  });
  assert.equal(classRename.status, 200, "전체관리자는 반 이름을 변경할 수 있어야 합니다.");

  const temporaryIds = Array.from({ length: 11 }, () => randomUUID());
  temporaryIds.forEach((id) => cleanupUserIds.add(id));
  await prisma.user.createMany({
    data: temporaryIds.map((id, index) => {
      const email = `verify-page-${index}-${id}@invalid.local`;
      return {
        id,
        emailLookup: createEmailLookup(email),
        emailEncrypted: encryptUserPii(id, "email", email),
        nameEncrypted: encryptOptionalUserPii(id, "name", `검증용 학생 ${index + 1}`),
        role: "STUDENT" as const,
        schoolId: cleanupSchoolId,
        schoolGroupId: classGroup.id,
      };
    }),
  });
  await prisma.boardMember.createMany({
    data: temporaryIds.map((userId) => ({
      boardId: verificationBoard.id,
      userId,
      role: "MEMBER" as const,
    })),
  });

  const firstOffsetPage = await fetch(`${baseUrl}/api/admin/users?page=1&pageSize=10&schoolId=${cleanupSchoolId}`, { headers: { Cookie: superCookie } });
  assert.equal(firstOffsetPage.status, 200, "첫 오프셋 페이지를 조회할 수 있어야 합니다.");
  const firstOffsetResult = await firstOffsetPage.json() as { users: { id: string }[]; totalCount: number; page: number; pageSize: number };
  assert.deepEqual({ count: firstOffsetResult.users.length, totalCount: firstOffsetResult.totalCount, page: firstOffsetResult.page, pageSize: firstOffsetResult.pageSize }, { count: 10, totalCount: 11, page: 1, pageSize: 10 });

  const secondOffsetPage = await fetch(`${baseUrl}/api/admin/users?page=2&pageSize=10&schoolId=${cleanupSchoolId}`, { headers: { Cookie: superCookie } });
  assert.equal(secondOffsetPage.status, 200, "두 번째 오프셋 페이지를 조회할 수 있어야 합니다.");
  const secondOffsetResult = await secondOffsetPage.json() as { users: { id: string }[]; totalCount: number; page: number };
  assert.deepEqual({ count: secondOffsetResult.users.length, totalCount: secondOffsetResult.totalCount, page: secondOffsetResult.page }, { count: 1, totalCount: 11, page: 2 });

  const bulkSuspend = await fetch(`${baseUrl}/api/admin/users/bulk`, {
    method: "PATCH",
    headers: { Cookie: superCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: temporaryIds, status: "SUSPENDED", reason: "일괄 상태 변경 HTTP 검증" }),
  });
  assert.equal(bulkSuspend.status, 200, "전체관리자는 선택한 사용자를 일괄 수정할 수 있어야 합니다.");
  const bulkSuspendResult = await bulkSuspend.json() as { updated: string[]; skipped: unknown[] };
  assert.equal(bulkSuspendResult.updated.length, 11);
  assert.equal(bulkSuspendResult.skipped.length, 0);

  const temporaryId = temporaryIds[0];
  const bulkOrganization = await fetch(`${baseUrl}/api/admin/users/bulk`, {
    method: "PATCH",
    headers: { Cookie: superCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({
      userIds: [temporaryId],
      role: "TEACHER",
      status: "ACTIVE",
      schoolId: cleanupSchoolId,
      schoolGroupId: departmentGroup.id,
      reason: "일괄 역할·소속 변경 HTTP 검증",
    }),
  });
  assert.equal(bulkOrganization.status, 200, "전체관리자는 역할과 소속을 함께 일괄 변경할 수 있어야 합니다.");
  const bulkOrganizationResult = await bulkOrganization.json() as { updated: string[]; skipped: unknown[] };
  assert.deepEqual(bulkOrganizationResult, { updated: [temporaryId], skipped: [] });

  const organizationCounts = await prisma.school.findUnique({
    where: { id: cleanupSchoolId },
    select: { _count: { select: { users: true } }, groups: { select: { id: true, _count: { select: { users: true } } } } },
  });
  assert.equal(organizationCounts?._count.users, 11, "학교 인원수는 전체 소속 인원을 반영해야 합니다.");
  assert.equal(organizationCounts?.groups.find((group) => group.id === classGroup.id)?._count.users, 10, "반 인원수가 반영되어야 합니다.");
  assert.equal(organizationCounts?.groups.find((group) => group.id === departmentGroup.id)?._count.users, 1, "부서 인원수가 반영되어야 합니다.");

  const classDelete = await fetch(`${baseUrl}/api/admin/schools/${cleanupSchoolId}/groups/${classGroup.id}`, {
    method: "DELETE",
    headers: { Cookie: superCookie, Origin: baseUrl },
  });
  assert.equal(classDelete.status, 200, "전체관리자는 반을 삭제할 수 있어야 합니다.");
  const classDeleteResult = await classDelete.json() as { affectedUsers: number };
  assert.equal(classDeleteResult.affectedUsers, 10);

  const schoolDelete = await fetch(`${baseUrl}/api/admin/schools/${cleanupSchoolId}`, {
    method: "DELETE",
    headers: { Cookie: superCookie, Origin: baseUrl },
  });
  assert.equal(schoolDelete.status, 200, "전체관리자는 기본 학교가 아닌 학교를 삭제할 수 있어야 합니다.");
  const schoolDeleteResult = await schoolDelete.json() as { affectedUsers: number };
  assert.equal(schoolDeleteResult.affectedUsers, 11);
  cleanupSchoolId = null;

  const detachedUsers = await prisma.user.count({ where: { id: { in: temporaryIds }, schoolId: null, schoolGroupId: null } });
  assert.equal(detachedUsers, 11, "소속 삭제 후 사용자 조직 연결은 모두 초기화되어야 합니다.");

  const defaultSchoolDelete = await fetch(`${baseUrl}/api/admin/schools/school_cheonghak_high`, {
    method: "DELETE",
    headers: { Cookie: superCookie, Origin: baseUrl },
  });
  assert.equal(defaultSchoolDelete.status, 409, "서비스 초기 기본 학교는 삭제할 수 없어야 합니다.");

  const deleteUser = await fetch(`${baseUrl}/api/admin/users/${temporaryId}`, {
    method: "DELETE",
    headers: { Cookie: superCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "회원 삭제 HTTP 검증" }),
  });
  assert.equal(deleteUser.status, 200, "전체관리자는 소유 패드가 없는 회원을 삭제할 수 있어야 합니다.");
  const deletedUser = await prisma.user.findUnique({ where: { id: temporaryId }, select: { status: true, schoolId: true, schoolGroupId: true } });
  assert.deepEqual(deletedUser, { status: "DELETED", schoolId: null, schoolGroupId: null }, "삭제된 회원은 로그인 불가 상태가 되고 조직 연결이 제거되어야 합니다.");
  assert.equal(
    await prisma.boardMember.count({ where: { userId: temporaryId } }),
    0,
    "단일 삭제된 회원은 모든 패드 멤버십에서도 제거되어야 합니다.",
  );

  const bulkDeleteIds = temporaryIds.slice(1);
  const bulkDelete = await fetch(`${baseUrl}/api/admin/users/bulk`, {
    method: "DELETE",
    headers: { Cookie: superCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: bulkDeleteIds, reason: "회원 일괄 삭제 HTTP 검증" }),
  });
  assert.equal(bulkDelete.status, 200, "전체관리자는 소유 패드가 없는 회원을 일괄 삭제할 수 있어야 합니다.");
  const bulkDeleteResult = await bulkDelete.json() as { updated: string[]; deleted: string[]; skipped: unknown[] };
  assert.deepEqual(new Set(bulkDeleteResult.deleted), new Set(bulkDeleteIds));
  assert.deepEqual(new Set(bulkDeleteResult.updated), new Set(bulkDeleteIds));
  assert.equal(bulkDeleteResult.skipped.length, 0);
  const bulkDeletedCount = await prisma.user.count({ where: { id: { in: bulkDeleteIds }, status: "DELETED", schoolId: null, schoolGroupId: null } });
  assert.equal(bulkDeletedCount, bulkDeleteIds.length, "일괄 삭제된 회원도 로그인 불가 상태가 되고 조직 연결이 제거되어야 합니다.");
  assert.equal(
    await prisma.boardMember.count({ where: { userId: { in: bulkDeleteIds } } }),
    0,
    "일괄 삭제된 회원도 모든 패드 멤버십에서 제거되어야 합니다.",
  );

  const organizationAuditActions = await prisma.adminAuditLog.findMany({
    where: { actorId: verificationAdminId, action: { in: ["SCHOOL_CREATED", "SCHOOL_UPDATED", "SCHOOL_DELETED", "SCHOOL_GROUP_CREATED", "SCHOOL_GROUP_UPDATED", "SCHOOL_GROUP_DELETED"] } },
    select: { action: true },
  });
  const loggedActions = new Set(organizationAuditActions.map(({ action }) => action));
  for (const action of ["SCHOOL_CREATED", "SCHOOL_UPDATED", "SCHOOL_DELETED", "SCHOOL_GROUP_CREATED", "SCHOOL_GROUP_UPDATED", "SCHOOL_GROUP_DELETED"]) {
    assert.ok(loggedActions.has(action as typeof organizationAuditActions[number]["action"]), `${action} 감사 로그가 필요합니다.`);
  }

  console.log("admin_http_checks=passed anonymous=401 super_admin=200 student=403 pagination=10+1 bulk=passed organization_crud=passed delete=soft_deleted+memberships_removed bulk_delete=soft_deleted+memberships_removed");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "관리자 HTTP 검증에 실패했습니다.");
    process.exitCode = 1;
  })
  .finally(async () => {
    const prisma = getPrisma();
    const userIds = [...cleanupUserIds];
    if (userIds.length) {
      await prisma.adminAuditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { targetUserId: { in: userIds } },
            { entityType: "User", entityId: { in: userIds } },
          ],
        },
      });
    }
    if (cleanupSchoolId) {
      await prisma.school.deleteMany({ where: { id: cleanupSchoolId } });
    }
    if (cleanupBoardIds.size) {
      await prisma.board.deleteMany({ where: { id: { in: [...cleanupBoardIds] } } });
    }
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });
