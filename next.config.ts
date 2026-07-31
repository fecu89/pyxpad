import type { NextConfig } from "next";

// 이 프로젝트는 별도 middleware.ts나 리버스 프록시 쪽 보안 헤더 설정이 없어서, XSS·클릭재킹
// 방어의 마지막 방어선인 응답 헤더가 아예 없었습니다(전체관리자 게시물·댓글이 저장형 XSS의
// 표적이 될 수 있는 서비스 특성상, react-markdown/rehype-sanitize와 파일 업로드 검증만으로
// 끝내지 않고 여기서도 한 겹 더 막습니다). script-src는 앱이 직접 로드하는 origin만 화이트
// 리스트로 열어두되(Cloudflare가 자동 주입하는 beacon.min.js 포함), img-src는 링크 미리보기
// 썸네일이 임의의 외부 호스트에서 올 수 있어 https: 전체를 허용합니다(img 태그는 스크립트를
// 실행하지 않으므로 XSS 위험은 없음). 개발 모드는 Next의 webpack eval 기반 소스맵·HMR이
// 'unsafe-eval' 없이는 콘솔 에러를 내므로 프로덕션에서만 뺍니다.
function contentSecurityPolicy(isDev: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["pad.pyx.kr"],
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
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
