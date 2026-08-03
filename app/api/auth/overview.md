# 인증 API 개요

PyxPad 로그인·세션 API는 NextAuth의 `GET/POST /api/auth/[...nextauth]`, 일반 계정은 `POST /api/auth/register/check-login-id` 확인 뒤 `POST /api/auth/register`가 생성합니다.

- 지원 provider: 로그인 아이디·비밀번호 Credentials, Kakao OAuth(검증 이메일)
- 세션: 7일 JWT
- Kakao 콜백: `/api/auth/callback/kakao`
- 일반 회원가입은 3~20자 영문·숫자 `loginId`와 10자 이상·영문자·숫자·특수문자 비밀번호 규칙을 서버에서 재검사하고 salt+scrypt 해시만 저장합니다. 모든 일반 가입 역할은 `STUDENT`이며 시스템 명칭은 선점할 수 없습니다. 카카오는 제공자가 검증한 이메일만 연결합니다.
- 로그인은 IP·계정·IP+계정 제한과 실패 횟수별 점진적 대기, 회원가입과 중복 확인은 IP·계정별 제한을 PostgreSQL에서 공유합니다. 원문 로그인 식별자·IP 대신 HMAC 키를 쓰고 보안 이벤트는 시간대별로 집계합니다.
- DB에 처음 등장한 일반 아이디 또는 카카오 이메일 계정은 프로필·학교·반/부서를 고르는 `/onboarding`을 완료해야 다른 화면으로 이동할 수 있습니다. 기존 계정은 저장된 역할·소속으로 바로 로그인합니다.
- 기존 `/api/auth/login`, `/api/auth/logout`의 임의 프로필 쿠키 방식은 폐기했습니다.
- 세션 쿠키를 직접 발급하던 개발용 `/api/dev/login` 우회 경로는 제거했습니다. 개발에서도 실제 회원가입과 NextAuth Credentials 로그인을 사용합니다.

세부 설정과 환경 변수는 `[...nextauth]/overview.md`와 `.env.example`을 참고합니다.
