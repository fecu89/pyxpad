import type { MetadataRoute } from "next";

// 파비콘 생성물은 public/favicon에 두고, Next.js manifest 규칙으로 실제 경로와 제품 정보를 연결합니다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PyxPad",
    short_name: "PyxPad",
    description: "배움과 생각을 함께 모으는 교육용 협업 패드",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1e293b",
    icons: [
      { src: "/favicon/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/favicon/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
