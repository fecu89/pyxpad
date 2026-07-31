# 인증 API 개요

PyxPad 인증 API는 NextAuth가 제공하는 `GET/POST /api/auth/[...nextauth]` 하나로 통합합니다.

- 지원 provider: Kakao
- 세션: 7일 JWT
- 콜백: `/api/auth/callback/kakao`
- DB에 처음 등장한 이메일은 프로필·학교·반/부서를 고르는 `/onboarding`을 완료해야 다른 화면으로 이동할 수 있습니다. 기존 이메일은 저장된 역할·소속으로 바로 로그인합니다.
- 기존 `/api/auth/login`, `/api/auth/logout`의 임의 프로필 쿠키 방식은 폐기했습니다.

세부 설정과 환경 변수는 `[...nextauth]/overview.md`와 `.env.example`을 참고합니다.
