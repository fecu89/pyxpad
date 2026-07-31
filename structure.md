# PyxPad 구조와 상호작용

마지막 확인일: 2026-07-30

이 문서는 코드 전문 대신 화면, 컴포넌트, API, 서버 도메인 모듈, 저장소가 어떻게 이어지는지 보여주는 탐색 지도다. 폴더별 세부 정책은 각 폴더의 `overview.md`를 참고한다.

## 1. 전체 요청 흐름

```text
브라우저
├─ 최초 진입 / 새로고침
│  └─ app/**/page.tsx (Server Component)
│     ├─ getCurrentUser()
│     ├─ lib/*/queries.ts에서 직접 조회
│     └─ 직렬화한 초기 DTO → Client Component
├─ 클릭·폼·드래그·업로드
│  └─ components/** (Client Component)
│     └─ fetch / XHR → app/api/**/route.ts
└─ 실시간 변경
   └─ EventSource → 보드 SSE / 개인 알림 SSE

Route Handler
├─ 최신 세션·역할·보드 접근 재검사
├─ Zod 입력 검증 + same-origin 검사
├─ lib/** 도메인 로직
├─ Prisma → PostgreSQL
├─ 로컬 파일 → UPLOAD_DIR
└─ 활동·알림 저장 → 프로세스 내부 SSE 이벤트 발행
```

현재 구조의 핵심 원칙은 다음과 같다.

- 최초 화면 읽기는 내부 API를 다시 호출하지 않고 Server Component가 서버 쿼리 계층을 직접 사용한다.
- 사용자 상호작용과 지연 조회는 Client Component가 REST형 Route Handler를 호출한다. 현재 Server Action은 사용하지 않는다.
- `proxy.ts`는 신규 사용자의 `PROFILE | TEACHER_PENDING | COMPLETE` 상태만 라우팅한다. 프로필 설정 중에는 `/onboarding`, 교사 승인 중에는 `/approval-pending`만 허용하고 다른 API는 428로 막는다. 보드 권한은 JWT로 확정하지 않으며 페이지와 모든 API가 DB의 최신 사용자·멤버십·정책을 다시 확인한다.
- Client Component가 받은 capability는 UI 노출용이다. 실제 보안 경계는 Route Handler와 서버 권한 함수다.

## 2. 페이지 진입점

| URL | Server Component와 조회 | 최종 화면·분기 |
|---|---|---|
| `/onboarding` | `getCurrentUser` + 학교/반·부서 목록 + 기존 교사 신청 조회 | 프로필 → 학생/교사 유형과 소속 → 확인. 학생은 즉시 완료, 교사는 승인 신청 |
| `/approval-pending` | 현재 사용자와 `TeacherApprovalRequest` 조회 | 신청 학교·부서와 진행 상태. 세션을 15초마다 갱신해 승인 시 원래 경로, 반려 시 온보딩으로 이동 |
| `/` | `app/(dashboard)/page.tsx` → `getCurrentUser` → `getDashboardHomeData` | 비로그인은 `HomeAccessGate`(최소 로그인 화면), 로그인은 `MyPadsView`(관계 탭·카드 그리드·템플릿·접근 요청) + `ArchivedBoards` |
| `/favorites` | `app/(dashboard)/favorites/page.tsx` → 같은 조회 | `FavoritesView`(정렬 + 즐겨찾기 카드 그리드만); 비로그인은 `/?login=1&callbackUrl=%2Ffavorites`로 리다이렉트 |
| `/search` | `app/(dashboard)/search/page.tsx` → 같은 조회 | `SearchView`(검색 입력 + 결과 그리드, 제목·소유자 클라이언트 필터); 비로그인은 리다이렉트 |
| `/folders/[folderId]` | `app/(dashboard)/folders/[folderId]/page.tsx` → 같은 조회 | `FolderView`(폴더 이름·이름변경·삭제 + 그 폴더의 그리드); 사용자 소유 폴더가 아니면 404 |
| `/profile` | `app/(dashboard)/profile/page.tsx` → `getCurrentUser`만 | `ProfileForm`(닉네임·사진·데이터 내보내기·탈퇴). 모달이 아니라 페이지 본문; 비로그인은 `/?login=1&callbackUrl=%2Fprofile`로 리다이렉트 |
| `/admin` | `app/admin/page.tsx` → 사용자·교사 승인 대기열·감사 로그 최초 페이지 직접 조회 | 권한이 있으면 `AdminConsole`, 없으면 권한 안내. 학교 대표교사의 승인 대기열은 자기 학교로 제한 |
| `/b/[slug]` | `getBoardPageData`가 로그인·읽기·비밀번호·게시물 공개 상태와 capability 계산 | `PadCanvas`, `PadAccessGate`, `PadPasswordGate`, 로그인 리다이렉트 또는 404 |
| `/b/[slug]/print` | 보드 페이지와 같은 접근 검사 | `PadPrintView`; 읽을 수 있는 게시물의 인쇄·PDF·PNG 흐름 |
| `/b/[slug]/present` | 같은 접근 검사 후 `gatherBoardExportData(..., "PUBLISHED")`로 전체 게시 글 조회 | `PadPresentation` |
| `/copy/[slug]` | `getCopyLinkData`가 로그인·생성 역할·원본 접근·비밀번호 검사 | `PadReuseDialog` 또는 권한 획득 안내 |
| `/invite/[token]` | 토큰 해시로 유효성·만료·사용 횟수만 읽기 검사 | `JoinBoardButton`; 참여는 별도 POST에서만 실행 |

루트 `app/layout.tsx`는 Pretendard 글꼴, 전역 CSS, FOUC 방지 테마 초기화만 담당한다. 사용자·보드 데이터는 이 루트 레이아웃에서 읽지 않는다.

`app/(dashboard)/layout.tsx`(라우트 그룹이라 URL에는 안 나타남)는 위 표의 `/`, `/favorites`, `/search`, `/profile`, `/folders/[folderId]` 라우트가 공유하는 셸이다. 로그인 사용자에게만 `DashboardChrome`(좌측 사이드바·상단바·프로필/보드생성 Provider)을 그리고, Next.js가 라우트 이동 시 바뀐 `page.tsx`만 갱신하므로 라우트를 오가도 사이드바와 알림 SSE가 다시 마운트되지 않는다. 960px 미만에서는 같은 사이드바가 버튼으로 여닫는 드로어가 된다. 레이아웃과 페이지가 같은 `getCurrentUser`/`getDashboardHomeData`를 각자 호출해도 두 함수가 React `cache()`로 감싸져 있어 실제 조회는 요청당 한 번이다. `/b/[slug]`는 이 그룹 밖이며 `AppShell showSidebar={false}`라 데스크톱 사이드바와 모바일 드로어 버튼을 모두 렌더링하지 않는다.

## 3. 주요 컴포넌트 계층

### 홈과 관리자

| 컴포넌트 | 책임 | 연결되는 API |
|---|---|---|
| `DashboardChrome`(`components/shell/`) | layout에 상주하는 셸: 사이드바 + 상단바 + 푸터 + Provider | 직접 호출 없음 |
| `HomeAccessGate` / `ArchivedBoards` | 비로그인 로그인 게이트 / 보관된 패드 복구·영구삭제 | 보드 복구, 관리자 보드 영구 삭제 |
| `home-actions.tsx` | 카카오 로그인/로그아웃, 패드 생성·복구·영구 삭제 버튼과 모달 | `/api/auth/*`, `/api/boards`, 보드 복구, 관리자 보드 영구 삭제 |
| `PadGrid` | 목록 화면 공용 카드 그리드와 카드 액션 | favorite, template, `/api/dashboard` |
| `MyPadsView`/`FavoritesView`/`SearchView`/`FolderView` | `/`·`/favorites`·`/search`·`/folders/[id]` 각 화면 구성 | 위 `PadGrid`를 통해서만 |
| `ProfileForm` | `/profile` 닉네임·사진·데이터 내보내기·탈퇴 | `/api/me`, `/api/me/avatar`, `/api/me/export` |
| `PadReuseDialog` | 복제 제목·포함 항목 선택과 자동 복제 링크 | 보드 clone API |
| `NotificationBell` | 알림 목록·읽음 처리·실시간 새 알림 | notifications API와 개인 SSE |
| `OnboardingExperience` / `ApprovalPendingExperience` | 학생 즉시 가입, 교사 승인 신청과 승인 상태 자동 확인 | onboarding API, NextAuth 세션 갱신 |
| `AdminConsole` | 사용자·소속·교사 가입 요청·감사 로그 검색과 페이지네이션 | admin users, teacher-approvals, audit-logs |
| `TeacherApprovalQueue` | 마스킹 신청자·학교·부서 확인, 사유 입력 승인/반려 | admin teacher-approvals |
| `UserEditor` | 역할·상태·시스템 권한·세션·PII 조회 | admin user 하위 API |
| `AppShell`/`AppSidebar`(`components/shell/`) | 데스크탑 고정 사이드바와 모바일·태블릿 드로어. 활성 항목은 `usePathname()`으로 계산 | 사이드바의 폴더 생성만 `/api/dashboard` POST |

### 보드 화면

```text
PadCanvas
├─ 상단 공통: NotificationBell, ThemeToggle, PadMoreMenu
├─ 패널: Share, Activity, ModerationQueue, Export, Trash
├─ 설정: PadSettingsTabs
│  ├─ Appearance / PostFieldDesigner / AttachmentPolicy
│  ├─ AccessRequests / InviteLinks
│  └─ Members
├─ SECTIONS 레이아웃: SectionColumn
│  ├─ PostComposer
│  └─ PostCard → PostDetail
└─ WALL/GRID/STREAM/TIMELINE/TABLE
   └─ PadLayoutRenderer → 레이아웃별 컴포넌트 → PostCard/PostDetail
```

| 컴포넌트 | 주 역할 | 연결되는 API |
|---|---|---|
| `PadCanvas` | 보드 로컬 상태, 설정·멤버·섹션, DnD, 검색·페이지네이션, SSE 이벤트 반영 | board PATCH/DELETE/follow/search, sections, members, section/post reorder |
| `SectionColumn` | 섹션 편집·삭제, 섹션별 글 추가 | section PATCH/DELETE, section posts |
| `PostComposer` | 로컬 임시저장, 글 생성·수정, 사용자 필드, 파일·링크 업로드 큐 | section posts, post PATCH, post attachments/links |
| `PostCard` | 요약 표시와 빠른 반응 | post reactions |
| `PostDetail` | 본문·첨부·댓글·반응 편집, 첨부 순서·메타데이터 | post/comment/reaction/attachment API |
| `PadSettingsTabs` | 외형, 필드, 참여, 승인·동결, 접근·초대, 멤버 UI를 묶음 | 저장 자체는 `PadCanvas`; 하위 요청·초대 컴포넌트는 각 API 호출 |
| `PadSharePanel` | 상단 공유창의 링크 복사·QR 표시 | 클라이언트 QR 생성 |
| `PadSharingSettings` | 설정의 발견 범위·비밀번호 관리 | board PATCH |
| `PadAccessGate` / `PadAccessRequests` | 비멤버 요청 생성, 관리자 승인·거절 | access-requests GET/POST/PATCH |
| `PadInviteLinks` / `JoinBoardButton` | 초대 링크 생성·폐기와 명시적 참여 | invite-links, invite redeem |
| `PadModerationQueue` | 승인 대기 목록과 승인·거절 | pending-posts, post moderate |
| `PadActivityPanel` | 보드 공용 활동 타임라인 | board activity |
| `PadTrash` | 숨김 섹션·글·댓글·첨부 조회와 30일 내 복구 | board trash, 종류별 restore |
| `PadExportPanel` | 인쇄·발표 링크와 관리자용 CSV·XLSX·ZIP | export API와 print/present 페이지 |
| `usePadEvents` | 보드 SSE 연결, 재연결 누락 감지 | board events, activity 보충 조회 |

## 4. API와 소비 컴포넌트

표의 API는 모두 `app/` 아래 Route Handler다. 동적 ID는 클라이언트가 보낸 값이므로 서버에서 소속과 권한을 다시 조회한다.

### 인증·내 계정

| API | 메서드 | 주 소비자·역할 |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | `home-actions`; Kakao OAuth, JWT 발급·갱신·로그아웃 |
| `/api/onboarding` | POST | `OnboardingExperience`; 학생 소속 즉시 확정 또는 교사 승인 신청 생성 |
| `/api/me` | PATCH, DELETE | 프로필 이름 변경, 계정 탈퇴 |
| `/api/me/avatar` | POST, DELETE | 프로필 이미지 WebP 업로드·제거 |
| `/api/me/export` | GET | `/profile`의 내 데이터 JSON 다운로드 |
| `/api/users/[userId]/avatar` | GET | 저장된 공개 프로필 이미지 제공 |

### 홈·대시보드·재사용

| API | 메서드 | 주 소비자·역할 |
|---|---|---|
| `/api/boards` | POST | `CreateBoardButton`; 교사 이상 새 보드 생성 |
| `/api/boards/[boardId]/favorite` | PUT, DELETE | `PadGrid`; 팔로우와 별도인 개인 즐겨찾기 |
| `/api/boards/[boardId]/template` | PATCH | `PadGrid`; 관리 가능한 패드의 템플릿 표시 |
| `/api/boards/[boardId]/clone` | POST | `PadReuseDialog`; 선택 복제와 파일 롤백 |
| `/api/dashboard` | POST, PATCH, DELETE | `AppSidebar`(생성)·`FolderView`(이름 변경·삭제)·`PadGrid`(패드 포함) |

### 보드 설정·접근·운영

| API | 메서드 | 주 소비자·역할 |
|---|---|---|
| `/api/boards/[boardId]` | PATCH, DELETE | `PadCanvas`, `PadSharingSettings`; 설정·공유 정책 저장과 보관 |
| `/api/boards/[boardId]/restore` | POST | 홈 보관함; 보드 복구 |
| `/api/boards/[boardId]/sections` | POST | `PadCanvas`; 섹션 생성 |
| `/api/boards/[boardId]/members` | POST | `PadCanvas`; 이메일 기반 멤버 추가 |
| `/api/boards/[boardId]/members/[userId]` | PATCH, DELETE | `PadCanvas`; 역할 변경·제거 |
| `/api/boards/[boardId]/access-requests` | GET, POST, PATCH | 접근 안내·설정 패널; 요청 생성과 승인·거절 |
| `/api/boards/[boardId]/verify-password` | POST | `PadPasswordGate`; 보드 전용 서명 쿠키 발급 |
| `/api/boards/[boardId]/follow` | GET, POST, DELETE | `PadCanvas`; 활동 팔로우와 최근 본 시각 |
| `/api/boards/[boardId]/invite-links` | GET, POST | `PadInviteLinks`; 목록·생성 |
| `/api/boards/[boardId]/invite-links/[linkId]` | DELETE | `PadInviteLinks`; 폐기 |
| `/api/invite/[token]/redeem` | POST | `JoinBoardButton`; 사용 횟수 증가와 멤버 참여 |
| `/api/boards/[boardId]/pending-posts` | GET | `PadModerationQueue`; 승인 대기 목록 |
| `/api/boards/[boardId]/activity` | GET | `PadActivityPanel`, SSE 재연결 보충 조회 |
| `/api/boards/[boardId]/events` | GET, SSE | `usePadEvents`; 보드 변경 신호 |
| `/api/boards/[boardId]/search` | GET | `PadCanvas`; 최초 30개 밖의 서버 검색 |
| `/api/boards/[boardId]/trash` | GET | `PadTrash`; 복구 가능한 숨김 항목 |

### 섹션·게시물·댓글·반응

| API | 메서드 | 주 소비자·역할 |
|---|---|---|
| `/api/sections/[sectionId]` | PATCH, DELETE | `SectionColumn`, 레이아웃 편집 모달 |
| `/api/sections/[sectionId]/reorder` | POST | `PadCanvas`; LexoRank형 위치 갱신 |
| `/api/sections/[sectionId]/restore` | POST | `PadTrash` |
| `/api/sections/[sectionId]/posts` | GET, POST | 더 보기 cursor 페이지와 `PostComposer` 새 글 |
| `/api/posts/[postId]` | PATCH, DELETE | `PostComposer`, `PostDetail` |
| `/api/posts/[postId]/reorder` | POST | `PadCanvas`; 섹션 안/사이 이동 |
| `/api/posts/[postId]/restore` | POST | `PadTrash` |
| `/api/posts/[postId]/moderate` | POST | `PadModerationQueue`; 게시·거절, 활동·알림 생성 |
| `/api/posts/[postId]/comments` | GET, POST | `PostDetail`; 댓글 트리 조회·작성 |
| `/api/comments/[commentId]` | PATCH, DELETE | `PostDetail`; 댓글 수정·숨김 |
| `/api/comments/[commentId]/restore` | POST | `PadTrash` |
| `/api/posts/[postId]/reactions` | PUT, DELETE | `PostCard`, `PostDetail`; 단일/복수 정책을 트랜잭션에서 강제 |

### 첨부·링크·파일

| API | 메서드 | 주 소비자·역할 |
|---|---|---|
| `/api/link-preview` | POST | `LinkPreviewInput`; SSRF 방어 후 공개 메타데이터만 반환 |
| `/api/posts/[postId]/attachments` | POST multipart | `PostComposer` 업로드 큐; 파일별 XHR 진행률 |
| `/api/posts/[postId]/links` | POST | `PostComposer`; 로컬 파일 없는 LINK 첨부 |
| `/api/posts/[postId]/attachments/reorder` | POST | `PostDetail`; 게시물 첨부 전체 순서 저장 |
| `/api/comments/[commentId]/attachments` | POST multipart | `PostDetail`; 댓글 이미지·음성 최대 4개 |
| `/api/attachments/[attachmentId]` | PATCH, DELETE | `PostDetail`; 대체텍스트·캡션 수정과 숨김 |
| `/api/attachments/[attachmentId]/restore` | POST | `PadTrash` |
| `/files/[attachmentId]` | GET | `AttachmentViewer`, 카드 썸네일, 인쇄·발표; Range·download 정책 재검사 |

### 알림

| API | 메서드 | 주 소비자·역할 |
|---|---|---|
| `/api/notifications` | GET | `NotificationBell`; 개인 알림 목록 |
| `/api/notifications/[notificationId]` | PATCH | `NotificationBell`; 한 건 읽음 |
| `/api/notifications/read-all` | POST | `NotificationBell`; 모두 읽음 |
| `/api/notifications/events` | GET, SSE | `NotificationBell`; `notification.created` 신호 |

### 내보내기·발표

| API·페이지 | 메서드 | 주 소비자·역할 |
|---|---|---|
| `/api/boards/[boardId]/exports/csv?type=...` | GET | `PadExportPanel`; 관리자용 게시물·댓글·반응 CSV |
| `/api/boards/[boardId]/exports/xlsx` | GET | 관리자용 3시트 XLSX |
| `/api/boards/[boardId]/exports/attachments-zip` | GET stream | 관리자 + 다운로드 정책; 로컬 파일을 ZIP 스트리밍 |
| `/b/[slug]/print` | page | 읽기 권한 기반 인쇄·PDF·PNG |
| `/b/[slug]/present` | page | 읽기 권한 기반 게시 글 발표 |

### 관리자

| API | 메서드 | 주 소비자·역할 |
|---|---|---|
| `/api/admin/users` | GET | `AdminConsole`; 역할·상태 필터와 마스킹 목록 |
| `/api/admin/audit-logs` | GET | `AdminConsole`; 감사 로그 cursor 조회 |
| `/api/admin/teacher-approvals` | GET | `TeacherApprovalQueue`; 전체관리자는 전체, 대표교사는 자기 학교 대기열 |
| `/api/admin/teacher-approvals/[requestId]` | PATCH | 신청 학교·교사 부서·학생 상태를 재검증하고 승인 또는 사유 포함 반려 |
| `/api/admin/users/[userId]` | PATCH | `UserEditor`; 역할·상태 변경 |
| `/api/admin/users/[userId]/permissions` | PUT | `UserEditor`; 보조관리자 시스템 권한 동기화 |
| `/api/admin/users/[userId]/revoke-sessions` | POST | `UserEditor`; `authVersion` 증가 |
| `/api/admin/users/[userId]/pii` | POST | `UserEditor`; 최근 로그인·사유·감사 후 일시 복호화 |
| `/api/admin/boards/[boardId]/purge` | DELETE | 홈 보관함; 30일 이후 보드와 실제 파일 영구 삭제 |
| `/api/admin/boards/[boardId]/transfer` | POST | 현재 직접 연결된 UI 없음; 소유권 이전 운영 API |
| `/api/admin/posts/[postId]/purge` | DELETE | 현재 직접 연결된 UI 없음; 30일 이후 게시물·파일 영구 삭제 API |

## 5. 공통 서버 계층

| 경로 | 책임 |
|---|---|
| `lib/auth/auth-options.ts` | Kakao OAuth, JWT의 내부 사용자 ID·세션 버전, 최초 사용자 생성 |
| `proxy.ts` | 신규 사용자 프로필 설정·교사 승인 대기·완료 상태에 따른 페이지/API 게이트 |
| `lib/auth/current-user.ts` | NextAuth 세션에서 ID를 읽고 DB의 최신 활성 사용자 DTO 조회 |
| `lib/auth/authorization.ts` | 역할·시스템 권한·보드 capability·동결·승인 정책의 중앙 판정 |
| `lib/board/permissions.ts` | 보드, 소유자, 현재 사용자 멤버 역할을 한 번에 조회 |
| `lib/board/queries.ts` | 홈 공개 보드와 보드 페이지 SSR DTO, 게시물 30개 초기 페이지 |
| `lib/dashboard/queries.ts` | 홈 개인 보드·최근·즐겨찾기·폴더·템플릿·요청 DTO |
| `lib/board/validators.ts` | 보드·섹션·글·댓글·반응 요청 스키마 |
| `lib/post-fields/*`, `lib/reactions/*` | JSON 필드 버전과 반응 키·집계 검증 |
| `lib/board/activity.ts` | 보드 전체에 보이는 활동 로그와 팔로우 |
| `lib/notifications/create.ts` | 개인 알림 저장과 사용자 SSE 발행 |
| `lib/files/*` | multipart 스트리밍, MIME·시그니처, WebP·썸네일, UUID 저장명, Range·정리 |
| `lib/link-preview/*` | DNS·리다이렉트 단계별 SSRF 방어와 HTML 메타 파싱 |
| `lib/board-reuse/*` | 안전한 비공개 복제, 선택 항목, 파일 복사·실패 롤백 |
| `lib/exports/*` | 내보내기 권한, 공통 조회, CSV·XLSX·ZIP 생성 |
| `lib/security/*`, `lib/users/*` | PII AES-GCM/HMAC과 목적별 최소 DTO |
| `lib/users/teacher-approvals.ts` | 가입자 신청 상태와 학교 범위 관리자 승인 대기열 DTO |
| `lib/http.ts` | 인증·권한 오류 응답과 same-origin 검사 |
| `lib/prisma.ts` | `DATABASE_URL`을 지연 로딩하는 Prisma 단일 인스턴스와 연결 풀 |

## 6. 대표 상호작용 흐름

### 글 작성과 첨부

1. `PostComposer`가 제목·본문·사용자 필드를 로컬에 임시저장한다.
2. `POST /api/sections/[sectionId]/posts`가 최신 보드 권한·동결·필드 버전·승인 모드를 검사하고 글을 저장한다.
3. 파일은 성공한 글 ID를 대상으로 `/attachments`에 파일별 HTTP multipart로 최대 3개씩 업로드한다. 이미지는 WebP와 썸네일로 변환한다.
4. 링크는 `/api/link-preview`로 미리보기 후 `/links`에 URL 메타데이터만 저장한다.
5. API가 `BoardActivity`와 `BoardEvent`를 만들고, 다른 브라우저는 SSE로 로컬 패치 또는 병합 새로고침한다.

### 게시물 승인

1. 승인 모드에 따라 새 글은 `PENDING` 또는 `PUBLISHED`가 된다.
2. `PadModerationQueue`가 pending-posts를 읽고 moderate API를 호출한다.
3. API는 `Post.status`, `POST_MODERATED` 활동, 작성자 개인 알림을 함께 남긴다.
4. 보드 SSE는 게시물 변경을, 사용자 SSE는 알림 벨 갱신 신호를 전달한다.

### 접근 요청과 초대

- 접근 요청: `PadAccessGate` → access-requests POST → 관리자 설정 패널 GET/PATCH → 승인 시 `BoardMember` 생성·요청 상태 변경·활동·알림.
- 초대 링크: 관리자가 해시 토큰 생성 → 사용자가 `/invite/[token]`에서 확인 → 버튼으로 redeem POST → 멤버·팔로우 생성. 페이지 진입만으로 자동 참여하지 않는다.

### 학생 가입과 교사 승인

1. 카카오의 검증 이메일이 DB에 없으면 소속 없는 `STUDENT`, `onboardingCompletedAt = null` 사용자로 생성한다.
2. 학생 선택은 학교의 `CLASS`인지 확인한 뒤 사용자 소속과 완료 시각을 저장한다.
3. 교사 선택은 학교의 `DEPARTMENT`인지 확인하고 실제 역할을 바꾸지 않은 채 `TeacherApprovalRequest(PENDING)`만 저장한다. 해당 학교 대표교사와 전체관리자에게 알림을 보낸다.
4. 승인 전 `proxy.ts`가 `/approval-pending`, 인증·프로필 API 외 접근을 막는다.
5. 전체관리자 또는 같은 학교 대표교사가 승인하면 신청 상태, `TEACHER` 역할, 학교·부서, 완료 시각과 감사 로그를 한 트랜잭션에 저장한다. 반려하면 사유와 함께 `REJECTED`로 바꾸고 재신청 화면으로 보낸다.
6. 대기 화면의 NextAuth 세션 갱신과 다음 로그인은 DB 상태를 다시 읽으므로 브라우저가 끊겨도 승인 결과가 유지된다.

### 실시간 처리

```text
쓰기 API 성공
├─ publishBoardEvent(boardId)
│  └─ /api/boards/[id]/events → usePadEvents
│     ├─ 댓글·반응 수: 해당 항목만 로컬 갱신
│     ├─ 게시물 삭제: 로컬 제거
│     └─ 구조 변경: 800ms 병합 후 router.refresh()
└─ createNotification(userId)
   └─ publishUserEvent → /api/notifications/events → NotificationBell 재조회
```

업로드 데이터 자체는 SSE나 WebSocket으로 전송하지 않는다. 보드와 알림 SSE는 작은 변경 신호만 전달한다. 이벤트 버스는 프로세스 내부 `EventEmitter`이므로 현재는 단일 앱 인스턴스가 전제다.

## 7. 데이터 모델 관계

```text
User
├─ 소유 Board / BoardMember
├─ BoardFollow / BoardFavorite
├─ DashboardFolder ─ DashboardFolderBoard ─ Board
├─ Notification
├─ UserSystemPermission
├─ AdminAuditLog
└─ TeacherApprovalRequest ─ School / SchoolGroup(DEPARTMENT) / 검토 User

Board
├─ Section ─ Post
│            ├─ Attachment
│            ├─ Comment ─ CommentMention / 댓글 Attachment
│            └─ Reaction
├─ BoardMember / BoardAccessRequest
├─ BoardInviteLink
├─ BoardActivity
└─ BoardFollow / BoardFavorite
```

- `deletedAt`은 보드·섹션·글·댓글·첨부의 30일 복구 가능한 숨김 상태다. 영구 삭제와 별개다.
- `Board.state`와 `freezeAt`은 쓰기 동결이며 보관 상태가 아니다.
- `Notification`은 개인 수신함, `BoardActivity`는 보드 공용 타임라인이다.
- `BoardFollow`는 알림·최근 방문, `BoardFavorite`은 사용자가 직접 저장한 즐겨찾기다.
- 이메일·이름·프로필 URL은 암호문으로 저장하고 Client Component에는 목적별 DTO만 전달한다.
- `TeacherApprovalRequest`는 승인 전 희망 학교·부서를 보관하고, 승인 시에만 실제 `User.role/schoolId/schoolGroupId`로 연결한다.

## 8. 저장소와 운영 전제

- PostgreSQL 스키마는 `prisma/schema.prisma`, 이력은 `prisma/migrations/**`, 생성 타입은 `generated/prisma/**`에 있다.
- 첨부와 아바타는 오브젝트 스토리지 없이 `UPLOAD_DIR`의 로컬 영구 디스크를 사용한다. DB와 파일 백업을 함께 해야 한다.
- 파일·SSE 구조 때문에 현재 운영은 단일 앱 인스턴스가 기준이다. 다중 인스턴스로 갈 때는 공유 파일 저장소와 Redis 또는 PostgreSQL pub/sub 계층이 필요하다.
- 쓰기 API는 일반적으로 활성 세션, same-origin, Zod 입력, 최신 대상 소속, capability, 동결 상태 순서로 검사한다.
- 상세 정책을 바꿀 때는 `UI → Route Handler → lib 도메인 모듈 → Prisma/파일 → 활동·알림·SSE` 순서로 영향 범위를 확인한다.

## 9. 기능을 찾는 빠른 기준

| 바꾸려는 것 | 먼저 볼 파일 |
|---|---|
| 홈·역할별 노출 | `app/page.tsx`, `components/home/*`, `lib/dashboard/*` |
| 보드 접근 정책 | `lib/board/permissions.ts`, `lib/auth/authorization.ts`, `lib/board/queries.ts` |
| 보드 화면 상호작용 | `components/pad/pad-canvas.tsx`, 하위 패널·레이아웃 |
| 게시물 입력 계약 | `post-composer.tsx`, section posts API, `lib/post-fields/*` |
| 댓글·반응 | `post-detail.tsx`, comments/reactions API, notifications |
| 첨부 파일 | attachments API, `lib/files/*`, `/files/[attachmentId]` |
| 실시간 갱신 | `use-pad-events.ts`, `lib/realtime/*`, events Route Handler |
| 관리자 권한 | `app/admin`, `components/admin/*`, `app/api/admin/*`, `lib/auth/*` |
| 최초 가입·교사 승인 | `app/onboarding`, `app/approval-pending`, `app/api/onboarding`, `app/api/admin/teacher-approvals`, `lib/users/teacher-approvals.ts` |
| DB 변경 | `prisma/schema.prisma` → 새 migration → `generated/prisma/**` |

새 폴더나 기능을 추가하면 해당 폴더의 `overview.md`와 이 문서의 관련 흐름이 실제 구현과 계속 맞는지 함께 확인한다.
