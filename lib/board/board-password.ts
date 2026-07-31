import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// 보드 비밀번호는 평문으로 저장하지 않고 salt+scrypt 해시만 저장합니다(padupgrade.md 5.1).
export function hashBoardPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyBoardPassword(password: string, storedHash: string) {
  const [salt, derivedHex] = storedHash.split(":");
  if (!salt || !derivedHex) return false;
  const derived = scryptSync(password, salt, 64);
  const stored = Buffer.from(derivedHex, "hex");
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

function requireAuthSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET 환경 변수가 필요합니다.");
  return value;
}

function signBoardVerification(boardId: string) {
  return createHmac("sha256", requireAuthSecret()).update(boardId).digest("hex");
}

const cookieName = (boardId: string) => `bpv_${boardId}`;

// 비밀번호를 맞힌 방문자에게 그 보드 하나에만 유효한 서명 쿠키를 내려줍니다. 세션/DB 없이도
// 위조할 수 없고(HMAC), 다른 보드에는 재사용할 수 없습니다(보드 ID로 서명).
export async function markBoardPasswordVerified(boardId: string) {
  const store = await cookies();
  store.set(cookieName(boardId), signBoardVerification(boardId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function hasVerifiedBoardPassword(boardId: string) {
  const store = await cookies();
  const value = store.get(cookieName(boardId))?.value;
  if (!value) return false;
  const expected = signBoardVerification(boardId);
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
