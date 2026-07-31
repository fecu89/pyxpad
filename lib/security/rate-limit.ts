import "server-only";

type Bucket = { count: number; resetAt: number };

const SWEEP_INTERVAL_MS = 5 * 60_000;
const MAX_ENTRIES = 5_000;

// 고정 윈도 인메모리 rate limiter. 키가 계속 늘기만 하면(예: 공격자가 매 요청 다른 값을
// 자처하는 경우) Map이 무한정 쌓여 실질적인 메모리 누수·DoS가 되므로, 주기적으로 만료된
// 항목을 청소하고 그래도 넘치면 가장 오래 전에 등록된 항목부터 강제로 비웁니다. 프로세스
// 단일 인스턴스 운영 전제(structure.md §8)를 벗어나 다중 인스턴스로 확장하면 인스턴스별로
// 따로 세게 되므로 Redis 등 공유 저장소로 옮겨야 합니다.
export function createRateLimiter(options: { windowMs: number; maxAttempts: number }) {
  const attemptsByKey = new Map<string, Bucket>();

  function sweep() {
    const now = Date.now();
    for (const [key, bucket] of attemptsByKey) {
      if (bucket.resetAt <= now) attemptsByKey.delete(key);
    }
    const overflow = attemptsByKey.size - MAX_ENTRIES;
    if (overflow > 0) {
      let removed = 0;
      for (const key of attemptsByKey.keys()) {
        if (removed >= overflow) break;
        attemptsByKey.delete(key);
        removed += 1;
      }
    }
  }

  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref?.();

  return {
    consume(key: string) {
      const now = Date.now();
      const current = attemptsByKey.get(key);
      if (!current || current.resetAt <= now) {
        attemptsByKey.set(key, { count: 1, resetAt: now + options.windowMs });
        return true;
      }
      if (current.count >= options.maxAttempts) return false;
      current.count += 1;
      return true;
    },
  };
}

// 로그인 여부와 무관하게 호출되는 공개 엔드포인트(비밀번호 확인, 점검용 로그인 등)에서
// userId 대신 요청자 IP로 시도 횟수를 제한할 때 씁니다.
export function clientIp(request: Request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  // X-Forwarded-For는 각 프록시 홉이 자기 앞단에서 받은 값을 이어붙이는 방식이라, 맨 앞(첫
  // 홉)은 클라이언트가 스스로 써 보낼 수 있는 값입니다. 그대로 믿으면 매 요청마다 다른 값을
  // 채워보내 rate limit 키를 무한히 만들어낼 수 있으므로, 우리 서버 바로 앞 프록시가 붙였을
  // 마지막 값을 씁니다.
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  const hops = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
  return hops.at(-1) ?? "unknown";
}
