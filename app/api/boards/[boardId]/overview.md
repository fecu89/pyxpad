# Overview

이 폴더는 PyxPad 구현에서 `app/api/boards/[boardId]` 영역을 담당합니다.

- 루트 `PATCH`는 패드 관리 권한을 다시 검사한 뒤 설정을 부분 수정합니다. LINK를 선택하거나 이미
  LINK인 보드의 방문자 설정을 조작한 요청은 항상 `READER/loginRequired=false`로 정규화해 링크
  보유자의 비로그인 읽기만 허용합니다. 비밀번호 보호는 이 읽기 정책 위에 별도로 적용됩니다.
- `activity/`: `GET`으로 이 보드의 `BoardActivity` 로그를 시간 역순 커서 페이지네이션으로 조회합니다. 보드 읽기 권한(`canReadEffectiveBoard`)만 있으면 누구나 볼 수 있고, `actorId`·`since`·`until` 쿼리로 필터링합니다.
- `follow/`: `GET`으로 내 팔로우 여부를, `POST`/`DELETE`로 팔로우·해제를 처리합니다.
- `background-image/`: `GET`은 패드 읽기 권한과 비밀번호 검증 쿠키를 확인한 뒤 로컬 WebP를 스트리밍합니다. `POST`/`DELETE`는 `canManageBoardSettings`와 same-origin 검사를 통과해야 하며, 업로드는 한 파일·10MB·JPG/PNG/WebP로 제한해 실제 시그니처를 검사한 뒤 최대 1920×1200 WebP로 재인코딩합니다. DB에는 캐시 갱신용 버전 쿼리가 붙은 내부 URL만 저장합니다.
- `invite-links/`: `GET`(목록)·`POST`(생성)는 `canManageBoardSettings`만 가능하고, 역할은 `MEMBER`/`VIEWER`로 제한합니다. 생성 시 원문 토큰은 응답에서 1회만 내려주고 DB에는 해시만 저장합니다(`lib/board/invite-links.ts`). `invite-links/[linkId]`의 `DELETE`로 폐기(`revokedAt`)합니다. 실제 참여 처리는 `app/api/invite/[token]/redeem`이 별도로 담당합니다.
- `verify-password/`: `POST`로 보드 비밀번호를 확인하고 맞으면 그 보드에만 유효한 HMAC 서명 쿠키를 내려줍니다(`lib/board/board-password.ts`). 로그인 여부와 무관하게 호출되는 엔드포인트라 세션이 아니라 `IP+boardId` 기준으로 10분당 8회 시도 제한을 겁니다(2026-07-29 보안 점검 — 원래 시도 횟수 제한이 전혀 없어 짧은 비밀번호를 스크립트로 무차별 대입할 수 있었습니다). 이 앱은 단일 인스턴스 운영이 전제라 프로세스 내부 메모리 카운터로 충분하지만, 다중 인스턴스로 가면 공유 저장소로 옮겨야 합니다.
