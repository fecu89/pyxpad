import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { getPrisma } from "../lib/prisma";
import { verifyUserPassword } from "../lib/auth/password";
import {
  createAuthSecurityLookup,
  createLoginIdentifierLookup,
  decryptUserLoginIdentifier,
} from "../lib/security/pii-crypto-core";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const baseUrl = process.env.VERIFY_BASE_URL || "http://localhost:3001";
const requestOrigin = process.env.VERIFY_ORIGIN || process.env.APP_ORIGINS?.split(",")[0]?.trim() || baseUrl;
const loginId = `codex${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const password = `Quartz!${randomUUID().replaceAll("-", "").slice(0, 12)}7`;
const accountLookup = createLoginIdentifierLookup(loginId);

class CookieJar {
  private readonly values = new Map<string, string>();

  capture(response: Response) {
    const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
    for (const value of setCookies) {
      const first = value.split(";", 1)[0];
      const separator = first.indexOf("=");
      if (separator > 0) this.values.set(first.slice(0, separator), first.slice(separator + 1));
    }
  }

  header() {
    return [...this.values].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function postJson(path: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: requestOrigin },
    body: JSON.stringify(body),
  });
}

async function main() {
  const malformed = await postJson("/api/auth/register/check-login-id", { loginId: "fecu@kakao.com" });
  assert.equal(malformed.status, 400, "카카오 이메일은 일반 loginId 입력으로 허용하면 안 됩니다.");

  const reserved = await postJson("/api/auth/register/check-login-id", { loginId: "admin" });
  assert.equal(reserved.status, 200);
  assert.equal((await reserved.json() as { available: boolean }).available, false, "시스템 아이디를 선점할 수 없어야 합니다.");

  const availability = await postJson("/api/auth/register/check-login-id", { loginId: loginId.toUpperCase() });
  assert.equal(availability.status, 200);
  assert.equal((await availability.json() as { available: boolean }).available, true);

  const registration = await postJson("/api/auth/register", { loginId: loginId.toUpperCase(), password, passwordConfirm: password });
  assert.equal(registration.status, 201, "유효한 일반 계정을 생성할 수 있어야 합니다.");

  const duplicate = await postJson("/api/auth/register", { loginId, password, passwordConfirm: password });
  assert.equal(duplicate.status, 409, "대소문자를 바꿔도 같은 아이디를 중복 생성할 수 없어야 합니다.");

  const created = await getPrisma().user.findUniqueOrThrow({
    where: { loginIdentifierLookup: accountLookup },
    select: { id: true, loginIdentifierEncrypted: true, passwordHash: true, role: true },
  });
  assert.equal(decryptUserLoginIdentifier(created.id, created.loginIdentifierEncrypted), loginId);
  assert.equal(created.role, "STUDENT");
  assert.equal(await verifyUserPassword(password, created.passwordHash), true);

  const jar = new CookieJar();
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { headers: { Cookie: jar.header() } });
  jar.capture(csrfResponse);
  assert.equal(csrfResponse.status, 200);
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
  assert.ok(csrfToken);

  const form = new URLSearchParams({ csrfToken, loginId, password, callbackUrl: `${baseUrl}/dashboard`, json: "true" });
  const loginResponse = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header(),
      Origin: requestOrigin,
    },
    body: form,
    redirect: "manual",
  });
  jar.capture(loginResponse);
  assert.equal(loginResponse.status, 200, "Credentials callback이 세션을 발급해야 합니다.");
  const loginResult = await loginResponse.json() as { url?: string };
  assert.equal(loginResult.url, `${baseUrl}/dashboard`);

  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: jar.header() } });
  const session = await sessionResponse.json() as { user?: { id?: string; email?: string | null } };
  assert.equal(session.user?.id, created.id, "발급된 JWT가 내부 userId에 연결되어야 합니다.");
  assert.equal(session.user?.email, null, "로그인 식별자 원문은 NextAuth 세션에 노출하면 안 됩니다.");

  console.log("credential_auth_http=ok login_id_validation=ok duplicate_guard=ok session=ok");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Credentials 인증 검증에 실패했습니다.");
    process.exitCode = 1;
  })
  .finally(async () => {
    const prisma = getPrisma();
    await prisma.authSecurityEvent.deleteMany({ where: { accountLookup } }).catch(() => undefined);
    await prisma.authRateLimit.deleteMany({
      where: {
        key: {
          in: [
            createAuthSecurityLookup("rate:login-id-check-account", accountLookup),
            createAuthSecurityLookup("rate:register-account", accountLookup),
            createAuthSecurityLookup("rate:login-account-failure", accountLookup),
          ],
        },
      },
    }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { loginIdentifierLookup: accountLookup } }).catch(() => undefined);
    await prisma.$disconnect();
  });
