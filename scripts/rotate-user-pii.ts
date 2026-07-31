import { config } from "dotenv";
import { getPrisma } from "../lib/prisma";
import {
  decryptOptionalUserPii,
  decryptUserPii,
  encryptOptionalUserPii,
  encryptUserPii,
} from "../lib/security/pii-crypto-core";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const BATCH_SIZE = 100;

async function main() {
  const prisma = getPrisma();
  const dryRun = process.argv.includes("--dry-run");
  let cursor: string | undefined;
  let verified = 0;

  while (true) {
    const users = await prisma.user.findMany({
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, emailEncrypted: true, nameEncrypted: true, imageEncrypted: true },
    });
    if (!users.length) break;

    for (const user of users) {
      const email = decryptUserPii(user.id, "email", user.emailEncrypted);
      const name = decryptOptionalUserPii(user.id, "name", user.nameEncrypted);
      const image = decryptOptionalUserPii(user.id, "image", user.imageEncrypted);
      const next = {
        emailEncrypted: encryptUserPii(user.id, "email", email),
        nameEncrypted: encryptOptionalUserPii(user.id, "name", name),
        imageEncrypted: encryptOptionalUserPii(user.id, "image", image),
      };
      if (decryptUserPii(user.id, "email", next.emailEncrypted) !== email) throw new Error("이메일 재암호화 검증에 실패했습니다.");
      if (decryptOptionalUserPii(user.id, "name", next.nameEncrypted) !== name) throw new Error("이름 재암호화 검증에 실패했습니다.");
      if (decryptOptionalUserPii(user.id, "image", next.imageEncrypted) !== image) throw new Error("프로필 재암호화 검증에 실패했습니다.");
      if (!dryRun) await prisma.user.update({ where: { id: user.id }, data: next });
      verified += 1;
    }
    cursor = users.at(-1)?.id;
  }

  console.log(`pii_rotation=${dryRun ? "dry-run" : "write"} verified=${verified}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "개인정보 키 회전에 실패했습니다.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
