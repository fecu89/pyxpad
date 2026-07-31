# NextAuth API 개요

`GET/POST /api/auth/[...nextauth]`는 NextAuth의 로그인, CSRF, OAuth 콜백, 세션, 로그아웃 요청을 처리합니다.

- OAuth 제공자: Kakao
- 콜백 URL: `https://pad.pyx.kr/api/auth/callback/kakao`
- 세션 전략: 서명된 JWT, 유효 기간 7일
- OAuth 사용자 연결: 카카오 이메일을 NFKC·소문자로 정규화하고 HMAC 조회 키로 기존 암호화 사용자와 연결합니다. 없는 이메일은 소속 없는 학생 계정으로 생성한 뒤 `/onboarding`에서 가입 정보를 받습니다.
- 필수 환경 변수: `NEXTAUTH_URL`, `AUTH_SECRET`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`

Route Handler는 공개 엔드포인트이지만, 실제 상태 변경 API의 권한은 각 Route Handler에서 `requireCurrentUser()`와 보드 역할로 다시 검증합니다.
