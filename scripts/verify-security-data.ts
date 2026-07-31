import assert from "node:assert/strict";
import { config } from "dotenv";
import { getPrisma } from "../lib/prisma";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const prisma = getPrisma();
  const [plainColumns, activeSuperAdmins, unencryptedUsers, invalidPermissionOwners, studentOwners, elevatedStudents] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'User' AND column_name IN ('email', 'name', 'image')
    `,
    prisma.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } }),
    prisma.user.count({ where: { OR: [{ emailEncrypted: "" }, { emailLookup: "" }] } }),
    prisma.userSystemPermission.count({ where: { user: { role: { not: "ADMIN" } } } }),
    prisma.board.count({ where: { owner: { role: "STUDENT" } } }),
    prisma.boardMember.count({ where: { user: { role: "STUDENT" }, role: { in: ["OWNER", "ADMIN", "EDITOR"] } } }),
  ]);

  assert.equal(Number(plainColumns[0]?.count ?? 0), 0, "User 평문 개인정보 컬럼이 남아 있습니다.");
  assert.ok(activeSuperAdmins >= 1, "활성 전체관리자가 한 명 이상 필요합니다.");
  assert.equal(unencryptedUsers, 0, "암호화 또는 검색값이 비어 있는 사용자가 있습니다.");
  assert.equal(invalidPermissionOwners, 0, "보조관리자가 아닌 사용자에게 시스템 권한 행이 있습니다.");
  assert.equal(studentOwners, 0, "학생이 보드를 소유하고 있습니다.");
  assert.equal(elevatedStudents, 0, "학생에게 허용되지 않는 보드 역할이 있습니다.");

  console.log(`security_data_checks=passed active_super_admins=${activeSuperAdmins}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "보안 데이터 검증에 실패했습니다.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
