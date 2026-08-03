import "server-only";

import type { Prisma, UserRole } from "@/generated/prisma/client";

export const STUDENT_OWNED_BOARD_LIMIT = 10;

export class BoardOwnershipLimitError extends Error {
  readonly status = 409;

  constructor() {
    super(`학생 계정은 패드를 최대 ${STUDENT_OWNED_BOARD_LIMIT}개까지 소유할 수 있습니다. 보관함의 패드를 정리하거나 소유권을 이전한 뒤 다시 시도해 주세요.`);
    this.name = "BoardOwnershipLimitError";
  }
}

/**
 * 학생 한 명의 "한도 확인 → 패드 생성/이전"을 같은 트랜잭션에서 직렬화합니다.
 * 단순 count 후 create만 하면 동시에 들어온 두 요청이 모두 10개 미만으로 판단할 수 있으므로,
 * 사용자 ID 기반 PostgreSQL advisory transaction lock을 먼저 얻습니다.
 */
export async function assertCanOwnAnotherBoard(
  tx: Prisma.TransactionClient,
  user: { id: string; role: UserRole },
) {
  if (user.role !== "STUDENT") return;
  await tx.$queryRaw<Array<{ locked: string }>>`
    SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 20260802))::text AS locked
  `;
  const ownedBoardCount = await tx.board.count({ where: { ownerId: user.id } });
  if (ownedBoardCount >= STUDENT_OWNED_BOARD_LIMIT) throw new BoardOwnershipLimitError();
}
