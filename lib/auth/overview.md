# 인증 모듈 개요

`lib/auth`는 NextAuth 설정과 현재 사용자 조회의 단일 진입점입니다.

- `auth-options.ts`: Kakao provider, 7일 JWT 세션, 카카오 프로필 검증, HMAC 이메일 조회, 암호화 프로필 저장과 `authVersion`·최초 가입 완료 상태 검증을 담당합니다. DB에 없는 카카오 이메일은 자동 소속을 부여하지 않고 `onboardingCompletedAt = null`인 학생 계정으로 생성합니다. 이미 등록된 이메일은 기존 역할과 소속을 그대로 사용합니다.
- `current-user.ts`: `getServerSession(authOptions)`로 세션을 검증한 뒤 암호화 사용자 DTO를 조회합니다. `requireCurrentUser()`는 인증이 필요한 Route Handler에서 사용합니다.
- `page-guard.ts`: Server Component용 로그인 가드와 내부 경로만 허용하는 OAuth 콜백 URL 검증을 제공합니다.
- `authorization.ts`: 최신 DB 사용자와 보드 접근을 합산하는 시스템·자원별 권한 함수입니다. `canReadEffectiveBoard`는 `PRIVATE`이면 멤버만, `LINK`이면 URL 보유자에게 로그인 없이 읽기를, `PUBLIC`이면 `loginRequired`와 `visitorPermission` 조합에 따라 접근을 허용합니다. LINK는 과거 DB에 `WRITER/loginRequired=true`가 남아 있어도 비멤버의 글쓰기·댓글·반응·파일 업로드와 자기 글/댓글 수정·삭제를 모두 막는 고정 읽기 전용 정책입니다. 명시적으로 초대된 보드 멤버와 전역 관리자는 각자의 역할 권한을 계속 사용합니다. PUBLIC에서는 방문자 권한이 COMMENTER/WRITER 이상일 때 참여할 수 있고, PUBLIC 방문자가 작성한 자기 콘텐츠는 기존대로 수정할 수 있습니다. `determineInitialPostStatus`는 `Board.moderationMode`에 따라 새 글의 초기 `PostStatus`(PENDING/PUBLISHED)를 정하고, `canModeratePosts`는 승인·거절 권한을, `isBoardFrozen`은 `Board.state === "FROZEN"`이거나 `freezeAt`이 이미 지났으면 참을 반환해 게시물·섹션 쓰기 API들이 이 값으로 요청을 막습니다(padupgrade.md 4.2~4.3, 5.3~5.4).
- 원본 첨부 다운로드는 인라인 열람과 분리합니다. `canDownloadAttachment`가 보드의 `READERS | MEMBERS | EDITORS | DISABLED` 정책을 최신 유효 접근·멤버 역할과 조합하고, `/files/[attachmentId]?download=1`이 파일 스트림을 열기 직전에 다시 검사합니다. 전역 콘텐츠 권한은 기존 보드 편집 권한처럼 편집자 수준 정책을 충족합니다.
- `audit.ts`: 개인정보 없이 감사 로그에 저장할 최소 입력을 만듭니다.
- 카카오 이메일은 NFKC·소문자로 정규화한 뒤 `emailLookup` HMAC으로 기존 사용자와 연결합니다.
- JWT에는 `userId`, `authVersion`, `PROFILE | TEACHER_PENDING | COMPLETE` 온보딩 상태만 유지하며 역할·권한·개인정보는 넣지 않습니다.
- 정지, 역할·권한 변경, 세션 강제 해제 후에는 DB의 `authVersion` 불일치로 기존 JWT를 즉시 거부합니다.
- `proxy.ts`는 로그인한 신규 사용자가 가입 정보를 마치기 전 다른 페이지로 이동하면 원래 목적지를 `next`에 보존합니다. 프로필 설정 중이면 `/onboarding`, 교사 승인 중이면 `/approval-pending`으로 보내며 온보딩·프로필 이미지·인증 API 외 API는 428로 차단합니다. 최종 권한 검사는 각 데이터 접근 지점에서 계속 수행합니다.
- 로그인 여부만으로 권한을 확정하지 않으며, 각 데이터 변경 시 보드 역할을 다시 검사합니다.
- `proxy.ts`나 레이아웃만으로 보호하지 않습니다. 보드 공개 범위와 멤버십은 DB 조회가 필요하므로 데이터 접근 지점에서 최종 권한을 검사합니다.
