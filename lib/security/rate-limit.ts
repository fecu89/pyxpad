import "server-only";

import { createRateLimiter, type RateLimitDecision } from "@/lib/security/rate-limit-core";
import { rateLimitIdentity, trustedClientIdentifier } from "@/lib/security/request-identity";

export { createRateLimiter };
export type { RateLimitDecision };

export class RateLimitError extends Error {
  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
  }
}

// 로그인 여부와 무관하게 호출되는 공개 엔드포인트에서 userId 대신 요청자 IP로 시도 횟수를
// 제한할 때 씁니다. 프록시가 검증하지 않은 전달 헤더를 바로 믿으면 공격자가 키를 계속 바꿔
// 제한을 우회할 수 있으므로 인증 경로와 같은 신뢰 정책을 사용합니다.
export function clientIp(request: Request) {
  return trustedClientIdentifier(request.headers);
}

// 라우트별 제한기는 모듈 스코프에 한 번만 만들어야 버킷이 유지됩니다. 라우트 파일마다
// createRateLimiter를 선언하는 대신 이름으로 한 번만 만들어 재사용합니다.
const limitersByName = new Map<string, ReturnType<typeof createRateLimiter>>();

function limiterFor(name: string, windowMs: number, maxAttempts: number) {
  const existing = limitersByName.get(name);
  if (existing) return existing;
  const created = createRateLimiter({ windowMs, maxAttempts });
  limitersByName.set(name, created);
  return created;
}

/**
 * 비용이 큰 개별 엔드포인트에 좁은 제한을 겁니다.
 *
 * 키는 로그인 사용자면 계정, 아니면 "신뢰할 수 있는 IP"입니다. 신뢰할 수 있는 IP를 얻을 수 없는
 * 배포(TRUST_* 미설정)에서는 모든 익명 요청이 한 버킷으로 묶여 공격자 한 명이 전체 익명
 * 사용자를 함께 막아버리므로, 그때는 익명 요청에 제한을 걸지 않고 통과시킵니다. 그 구간의
 * 방어는 WAF·프록시 계층 몫입니다(structure.md §8).
 */
export function assertRateLimit(
  request: Request,
  options: { scope: string; userId?: string | null; windowMs: number; maxAttempts: number; message?: string },
) {
  const identity = rateLimitIdentity(request.headers, options.userId ?? null);
  if (!identity) return;
  const limiter = limiterFor(`${options.scope}:${options.windowMs}:${options.maxAttempts}`, options.windowMs, options.maxAttempts);
  const decision = limiter.check(`${options.scope}|${identity}`);
  if (!decision.allowed) {
    throw new RateLimitError(options.message ?? "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.", decision.retryAfterSeconds);
  }
}
