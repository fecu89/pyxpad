// 공개 랜딩과 로그인 전용 작업공간을 문자열 수준에서도 구분합니다. 루트(`/`)를 다시
// 대시보드 의미로 쓰기 시작하면 OAuth·온보딩·브랜드 링크가 쉽게 뒤섞이므로, 두 경로는
// 라우팅 계층과 클라이언트 컴포넌트가 함께 쓸 수 있는 상수로 둡니다.
export const PUBLIC_HOME_PATH = "/";
export const DASHBOARD_PATH = "/dashboard";
