# Overview

이 폴더는 PyxPad 구현에서 `lib/board` 영역을 담당합니다.

`activity.ts`는 `BoardActivity`(보드별 활동 로그) 기록과 `BoardFollow`(자동 팔로우) 추가·해제를 담당합니다. 보드 생성·멤버 추가·접근 요청 승인 시 자동으로 팔로우가 걸리고, 게시물 생성·수정·삭제, 댓글 작성, 멤버 참여, 접근 요청 처리마다 활동이 기록됩니다. 개인화된 "나에게 온" 알림(`Notification`)은 `lib/notifications/create.ts`가 별도로 담당하며, 이 활동 로그와는 독립적인 트리거로 만들어집니다(활동 = 보드 전체의 타임라인, 알림 = 나에게 온 항목만).

`invite-links.ts`는 초대 링크 토큰을 다룹니다. padupgrade.md 5.2 규칙에 따라 토큰 원문은 DB에 저장하지 않고 SHA-256 해시(`tokenHash`)만 저장하며, 원문은 생성 응답에서 1회만 내려줍니다. 초대 링크로 부여 가능한 역할은 `MEMBER`/`VIEWER`로 제한해, 링크가 유출되어도 관리자 권한을 얻을 수 없게 합니다.

`queries.ts`의 `getBoardPageData`는 섹션당 게시물을 `POST_PAGE_SIZE`(30개)까지만 최초 SSR에 담고, 섹션의 실제 전체 개수(`totalPostCount`)를 함께 내려줍니다. 30개를 넘는 다음 페이지는 `GET /api/sections/[sectionId]/posts?cursor=...`(정렬 기준과 동일하게 `isPinned desc, position asc, id asc`로 커서 페이지네이션)로 이어서 불러오고, 클라이언트 검색은 최초 로드분만 걸러내던 방식 대신 `GET /api/boards/[boardId]/search?q=...`로 서버 검색합니다(제목·본문만 대상 — 작성자 이름은 암호화되어 있어 DB 검색 대상이 아닙니다). (padupgrade.md 4.1)

보드 접근 모델은 기존 `visibility`(PUBLIC/MEMBERS/INVITE_ONLY/PRIVATE) 하나 대신 `discoveryScope`(PRIVATE/LINK/PUBLIC) + `visitorPermission`(NO_ACCESS/READER/COMMENTER/WRITER) + `loginRequired`로 발견 범위와 방문자 권한을 분리했습니다(padupgrade.md 4.2). 기존 MEMBERS/INVITE_ONLY/PRIVATE는 전부 `discoveryScope=PRIVATE, visitorPermission=NO_ACCESS`로 통합했고, PUBLIC은 `discoveryScope=PUBLIC, visitorPermission=READER, loginRequired=false`로 마이그레이션했습니다(`prisma/migrations/20260726050000_*`, `20260726060000_*`). 현재 LINK는 별도의 고정 프리셋입니다. 링크 보유자는 비로그인으로 읽고 공유할 수 있지만 비멤버 쓰기는 허용하지 않으며, 생성·수정 Route Handler가 항상 `LINK/READER/loginRequired=false`로 정규화합니다. 중앙 권한 판정도 과거의 비정규 LINK 행을 읽기 전용으로 해석하므로 데이터 마이그레이션 전에 즉시 안전하게 동작합니다.

`board-password.ts`는 보드 비밀번호 보호를 담당합니다(padupgrade.md 5.1). 비밀번호는 salt+scrypt 해시(`passwordHash`)로만 저장하고, 맞힌 방문자에게는 그 보드 하나에만 유효한 HMAC 서명 쿠키(`bpv_{boardId}`)를 내려 세션/DB 없이도 위조·재사용을 막습니다. 비밀번호 검사는 **멤버·전역 관리자에게는 적용하지 않고**, `visitorPermission`으로 들어온 비멤버 방문자에게만 적용합니다(`getBoardPageData`가 `access.role === null`일 때만 확인). `updateBoardSchema`는 `createBoardSchema.partial()`로 만들지 않습니다 — zod `.default()`가 `.partial()` 뒤에도 "생략 시 기본값 채움"을 그대로 적용해서, 부분 PATCH가 나머지 필드를 조용히 기본값으로 리셋시키는 버그가 있었습니다(발견 후 수정).

게시물 승인제와 보드 동결은 별도 파일 없이 `lib/auth/authorization.ts`의 `determineInitialPostStatus`/`canModeratePosts`/`isBoardFrozen`과 각 API 라우트에 나눠 구현했습니다(padupgrade.md 4.3, 5.3, 5.4). `Board.moderationMode`(NONE/MANUAL/STUDENTS_ONLY)에 따라 새 글의 초기 `Post.status`가 PENDING 또는 PUBLISHED로 정해지고, PENDING 글은 작성자 본인과 `canModeratePosts` 권한자만 조회·첨부파일 접근이 가능합니다. 승인·거절은 `POST /api/posts/[postId]/moderate`가 처리하며 `BoardActivity`(`POST_MODERATED`)와 작성자 알림(`POST_APPROVED`/`POST_REJECTED`)을 함께 남깁니다. 동결은 `Board.state`(ACTIVE/FROZEN) 즉시 전환과 `Board.freezeAt` 예약 두 가지 방식을 지원하는데, 예약은 별도 크론 없이 `isBoardFrozen`이 매 요청마다 `freezeAt <= now`를 판정하는 지연 평가 방식이라 그 시각에 실시간으로 밀어내지는 못하고 다음 쓰기 요청부터 막힙니다. 동결 중에는 게시물·섹션의 생성/수정/삭제/정렬과 댓글·반응이 모두 막히지만, 섹션 이름 변경·삭제 같은 관리자 구조 조정은 정리 작업을 위해 의도적으로 막지 않습니다. `BoardState`에는 `ARCHIVED`를 추가하지 않았습니다 — 보관은 계속 기존 `deletedAt` + 30일 복구 흐름이 전담합니다.

`validators.ts`는 padupgrade.md 6~7의 보드 표현 설정, 게시물 필드 설정과 제출 값, 첨부 메타데이터·링크·순서, 댓글 멘션, 반응 변경 요청을 크기·enum·URL·색상 allowlist로 검사합니다. `postFieldConfig`와 `customFieldValues`의 내부 구조 검증은 `lib/post-fields`에 위임하고, Route Handler가 클라이언트 JSON을 그대로 Prisma에 넣지 않게 합니다.

`queries.ts`는 레이아웃·정렬·카드 외형·작성자/시각 표시·반응/다운로드 정책과 안전하게 파싱한 게시물 필드 설정을 SSR 보드 DTO에 포함합니다. 게시물 첨부는 댓글 첨부를 제외하고 메타데이터를 전달하며, 반응 원본 행은 노출하지 않고 키별 수와 현재 사용자의 키만 집계합니다. 자동 정렬은 조회 시점에 적용되고 수동 정렬에서만 저장 위치 드래그를 허용합니다.

홈 조회도 `attachmentDownloadPolicy`와 `isTemplate`을 포함해 서버에서 보드 복제·템플릿 capability를 계산할 수 있게 합니다. 즐겨찾기·폴더에 저장된 보드는 저장 여부만으로 접근시키지 않고 `lib/dashboard/queries.ts`가 이 폴더의 기존 접근 정책과 비밀번호 확인을 다시 적용합니다.
