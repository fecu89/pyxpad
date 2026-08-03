import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import {
  createNicknameLookup,
  decryptOptionalUserPii,
  normalizeNickname,
} from "@/lib/security/pii-crypto";

export const nicknameSchema = z.string()
  .transform(normalizeNickname)
  .pipe(z.string()
    .min(1, "닉네임을 입력해 주세요.")
    .max(60, "닉네임은 60자 이하로 입력해 주세요.")
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "닉네임에 제어 문자를 사용할 수 없습니다."));

type NicknameClient = Pick<Prisma.TransactionClient, "user">;

export async function isNicknameAvailable(name: string, excludeUserId?: string, client: NicknameClient = getPrisma()) {
  const normalized = normalizeNickname(name);
  const nameLookup = createNicknameLookup(normalized);
  const current = await client.user.findUnique({ where: { nameLookup }, select: { id: true, status: true } });
  if (current && current.id !== excludeUserId && current.status !== "DELETED") {
    return { available: false, normalized, nameLookup };
  }

  // 배포 직후 백필 전에도 기존 암호화 닉네임과의 중복을 허용하지 않습니다. 백필이 끝나면
  // 이 조회 결과는 비어 있으므로 정상 경로는 고유 인덱스 한 번만 확인합니다.
  const legacyUsers = await client.user.findMany({
    where: {
      id: excludeUserId ? { not: excludeUserId } : undefined,
      status: { not: "DELETED" },
      nameLookup: null,
      nameEncrypted: { not: null },
    },
    select: { id: true, nameEncrypted: true },
  });
  const duplicateLegacy = legacyUsers.some((user) => {
    const legacyName = decryptOptionalUserPii(user.id, "name", user.nameEncrypted);
    return legacyName ? createNicknameLookup(legacyName) === nameLookup : false;
  });
  return { available: !duplicateLegacy, normalized, nameLookup };
}

export function isNicknameUniqueConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes("nameLookup")
    : typeof target === "string" && target.includes("nameLookup");
}
