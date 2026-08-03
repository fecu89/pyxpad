import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { getMetadata } from "@/utils/seo/getMetadata";
import "./globals.css";

// 담벼락 디자인의 본문 서체. 가변 폰트 하나로 45~920 굵기를 모두 커버합니다.
const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  weight: "45 920",
  variable: "--font-pretendard",
  display: "swap",
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  ...getMetadata(),
  title: { default: "PyxPad", template: "%s · PyxPad" },
};

// body가 그려지기 전에 실행되어야 깜빡임(FOUC) 없이 테마가 적용됩니다.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('theme');var t=(s==='light'||s==='dark')?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // proxy.ts가 요청마다 새로 만든 CSP nonce입니다. 이게 없으면 아래 인라인 스크립트가
  // script-src에 막혀 테마 초기화가 실행되지 않습니다(= 다크모드 FOUC).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // 다크모드 FOUC 방지 스크립트가 하이드레이션 전에 data-theme 속성을 설정해서, 서버가 그린
    // HTML(속성 없음)과 클라이언트 첫 렌더 사이에 항상 차이가 납니다. suppressHydrationWarning은
    // 이 엘리먼트 "자신"의 속성 불일치만 조용히 넘기고 자식 트리의 진짜 하이드레이션 오류는 그대로
    // 잡아내므로, 알려진 이 경고만 정확히 없앱니다(React 공식 문서가 권장하는 패턴).
    <html lang="ko" data-scroll-behavior="smooth" className={`${pretendard.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
