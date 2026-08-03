import type { NextConfig } from "next";

// Content-Security-Policy는 요청마다 새 nonce가 필요해 여기(정적 헤더)가 아니라 proxy.ts에서
// 만듭니다. 정적 헤더로 두면 인라인 스크립트를 'unsafe-inline'으로 통째로 허용할 수밖에 없어
// CSP의 XSS 방어 효과가 사실상 사라집니다. 아래 나머지 헤더는 요청과 무관한 고정값이라
// _next/static 같은 프록시 매처 밖 경로까지 함께 덮도록 계속 여기서 붙입니다.
const nextConfig: NextConfig = {
  allowedDevOrigins: ["pad.pyx.kr"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 게시물 작성기의 사진 촬영·음성 녹음(MediaCapture)이 카메라·마이크를 쓰므로
          // 이 두 개만 자기 출처에 허용하고 나머지(위치 등)는 기본적으로 막습니다.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
