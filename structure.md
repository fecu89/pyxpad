# PyxPad 구조와 상호작용

마지막 확인일: 2026-08-02

이 문서는 코드 전문 대신 화면, 컴포넌트, API, 서버 도메인 모듈, 저장소가 어떻게 이어지는지 보여주는 탐색 지도다. 폴더별 세부 정책은 각 폴더의 `overview.md`를 참고한다.

## 1. 전체 요청 흐름

```text
브라우저
├─ 공개 루트 `/`
│  └─ 세션·DB 조회 없이 랜딩 UI + OAuth 쿼리 처리
├─ 인증 화면 최초 진입 / 새로고침
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
- `proxy.ts`는 신규 사용자의 `PROFILE | TEACHER_PENDING | COMPLETE` 상태와 임시 비밀번호 상태를 라우팅한다. 공개 루트 `/`는 온보딩 상태와 무관하게 볼 수 있지만, 프로필 설정 중에는 `/onboarding`, 교사 승인 중에는 `/approval-pending`으로 보낸다. `mustChangePassword` 계정은 `/change-password`와 비밀번호 변경·인증 API만 허용한다. 나머지 API는 428로 막고, 보드 권한은 JWT로 확정하지 않으며 페이지와 모든 API가 DB의 최신 사용자·멤버십·정책을 다시 확인한다.
- Client Component가 받은 capability는 UI 노출용이다. 실제 보안 경계는 Route Handler와 서버 권한 함수다.

## 2. 페이지 진입점

| URL | Server Component와 조회 | 최종 화면·분기 |
|---|---|---|
| `/` | `app/page.tsx`; 인증 쿼리만 검증하고 세션·DB 조회 없음 | `LandingPage`(서비스 소개·CSS 패드 예시·학생/교사 흐름·로그인 CTA). 일반 로그인·회원가입·카카오와 오류 쿼리를 모달로 처리 |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` → `getCurrentUser` → `getDashboardHomeData` | `MyPadsView`(관계 탭·카드 그리드·템플릿·접근 요청). 비로그인은 `/?login=1&callbackUrl=%2Fdashboard`로 리다이렉트 |
| `/onboarding` | `getCurrentUser` + 학교/학년/반·부서 목록 + 기존 교사 신청 조회 | 프로필 → 학생은 학교·학년·반·번호, 교사는 학교·부서 → 확인. 학생은 즉시 완료, 교사는 승인 신청 |
| `/approval-pending` | 현재 사용자와 `TeacherApprovalRequest` 조회 | 신청 학교·부서와 진행 상태. 세션을 15초마다 갱신해 승인 시 원래 경로, 반려 시 온보딩으로 이동 |
| `/favorites` | `app/(dashboard)/favorites/page.tsx` → 같은 조회 | `FavoritesView`(정렬 + 즐겨찾기 카드 그리드만); 비로그인은 `/?login=1&callbackUrl=%2Ffavorites`로 리다이렉트 |
| `/search` | `app/(dashboard)/search/page.tsx` → 같은 조회 | `SearchView`(검색 입력 + 결과 그리드, 제목·소유자 클라이언트 필터); 비로그인은 리다이렉트 |
| `/folders/[folderId]` | `app/(dashboard)/folders/[folderId]/page.tsx` → 같은 조회 | `FolderView`(폴더 이름·이름변경·삭제 + 그 폴더의 그리드); 사용자 소유 폴더가 아니면 404 |
| `/profile` | `app/(dashboard)/profile/page.tsx` → `getCurrentUser`만 | `ProfileForm`(닉네임·사진·소속·학생 번호·Credentials 비밀번호 변경·데이터 내보내기·탈퇴). 모달이 아니라 페이지 본문; 비로그인은 `/?login=1&callbackUrl=%2Fprofile`로 리다이렉트 |
| `/change-password` | `getCurrentUser`; `mustChangePassword`와 Credentials 보유 여부 검사 | 명단 발급·관리자 초기화 계정의 최초 로그인 전용 변경 폼. 완료 계정은 `/dashboard`로 보냄 |
| `/admin` | `app/admin/page.tsx` → 사용자·학교/학년/반 집계·교사 승인 대기열·감사 로그 최초 페이지 직접 조회 | `AdminConsole`의 학교 대시보드·사용자·소속·계정 발급 메뉴. 일반 교사는 자기 학교 구조를 읽고 학생 번호만 수정하며, 대표교사는 자기 학교 소속 구조·계정 발급을 관리 |
| `/b/[slug]` | `getBoardPageData`가 로그인·읽기·비밀번호·게시물 공개 상태와 capability 계산 | `PadCanvas`, `PadAccessGate`, `PadPasswordGate`, 로그인 리다이렉트 또는 404 |
| `/b/[slug]/print` | 보드 페이지와 같은 접근 검사 | `PadPrintView`; 읽을 수 있는 게시물의 인쇄·PDF·PNG 흐름 |
| `/b/[slug]/present` | 같은 접근 검사 후 `gatherBoardExportData(..., "PUBLISHED")`로 전체 게시 글 조회 | `PadPresentation` |
| `/copy/[slug]` | `getCopyLinkData`가 로그인·생성 역할·원본 접근·비밀번호 검사 | `PadReuseDialog` 또는 권한 획득 안내 |
| `/invite/[token]` | 토큰 해시로 유효성·만료·사용 횟수만 읽기 검사 | `JoinBoardButton`; 참여는 별도 POST에서만 실행 |

루트 `app/layout.tsx`는 Pretendard 글꼴, 전역 CSS, FOUC 방지 테마 초기화만 담당한다. 사용자·보드 데이터는 이 루트 레이아웃에서 읽지 않는다.

`app/(dashboard)/layout.tsx`(라우트 그룹이라 URL에는 안 나타남)는 위 표의 `/dashboard`, `/favorites`, `/search`, `/archived`, `/profile`, `/folders/[folderId]` 라우트가 공유하는 셸이다. 로그인 사용자에게만 `DashboardChrome`(좌측 사이드바·상단바·프로필/보드생성 Provider)을 그리고, Next.js가 라우트 이동 시 바뀐 `page.tsx`만 갱신하므로 라우트를 오가도 사이드바와 알림 SSE가 다시 마운트되지 않는다. 960px 미만에서는 같은 사이드바가 버튼으로 여닫는 드로어가 된다. 레이아웃과 페이지가 같은 `getCurrentUser`/`getDashboardHomeData`를 각자 호출해도 두 함수가 React `cache()`로 감싸져 있어 실제 조회는 요청당 한 번이다. 공개 루트와 `/b/[slug]`는 이 그룹 밖이며, 패드는 `AppShell showSidebar={false}`라 데스크톱 사이드바와 모바일 드로어 버튼을 모두 렌더링하지 않는다.

## 3. 주요 컴포넌트 계층

### 홈과 관리자

| 컴포넌트 | 책임 | 연결되는 API |
|---|---|---|
| `LandingPage`(`components/landing/`) | 공개 소개·반응형 패드 예시·일반/카카오 로그인 CTA | `/api/auth/*` |
| `DashboardChrome`(`components/shell/`) | layout에 상주하는 셸: 사이드바 + 상단바 + Provider | 직접 호출 없음 |
| `ArchivedBoards` | 보관된 패드 복구·영구삭제 | 보드 복구, 관리자 보드 영구 삭제 |
| `home-actions.tsx` | 로그인 아이디 중복 확인 → 강한 비밀번호 설정의 2단계 일반 회원가입, 로그인·카카오·로그아웃 컨텍스트와 모달 | `/api/auth/register/check-login-id`, `/api/auth/register`, `/api/auth/*` |
| `PadGrid` | 목록 화면 공용 카드 그리드와 카드 액션 | favorite, template, `/api/dashboard` |
| `MyPadsView`/`FavoritesView`/`SearchView`/`FolderView` | `/dashboard`·`/favorites`·`/search`·`/folders/[id]` 각 화면 구성 | 위 `PadGrid`를 통해서만 |
| `ProfileForm` / `PasswordChangeForm` | `/profile` 고유 닉네임·사진·비밀번호·데이터 관리와 최초 로그인 강제 비밀번호 변경 | `/api/me/nickname-availability`, `/api/me`, `/api/me/password`, `/api/me/avatar`, `/api/me/export` |
| `PadReuseDialog` | 복제 제목·포함 항목 선택과 자동 복제 링크 | 보드 clone API |
| `NotificationBell` | 알림 목록·읽음 처리·실시간 새 알림 | notifications API와 개인 SSE |
| `OnboardingExperience` / `ApprovalPendingExperience` | 학생 학교·학년·반·번호 즉시 가입, 교사 승인 신청과 승인 상태 자동 확인 | onboarding API, NextAuth 세션 갱신 |
| `AdminConsole` | 학교 대시보드·사용자·소속·학생 계정 발급·교사 가입 요청·감사 로그 사이드바와 사용자 페이지네이션 | admin users, schools/groups/members, students/import/move, teacher-approvals, audit-logs |
| `SchoolDashboard` / `SchoolManager` | 학교별 학생·교사·학급 지표와 번호/학급 미지정 점검, 학교 메타데이터, 학급·부서·대표교사 관리 | schools PATCH, groups PATCH, user representative PATCH, students move |
| `StudentRosterImport` | XLSX 양식·미리보기·충돌 확인·초기 계정 발급·일회성 CSV 다운로드 | `/api/admin/students/import` |
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
| `PadCanvas` | 보드 로컬 상태, 설정·멤버·섹션, DnD, 검색·페이지네이션, SSE 이벤트와 모바일 검색·글 추가 플로팅 액션 | board PATCH/DELETE/follow/search, sections, members, section/post reorder |
| `SectionColumn` | 섹션 편집·삭제, 데스크톱 섹션별 글 추가. 숫자 인덱스 없는 한 줄 헤더 | section PATCH/DELETE, section posts |
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
| `/api/auth/register/check-login-id` | POST | `home-actions`; 3~20자 영문·숫자 형식, 기존 계정, 예약 시스템 아이디 확인. IP·계정별 DB 제한 적용 |
| `/api/auth/register` | POST | `home-actions`; 서버에서 아이디·비밀번호 규칙을 다시 검사하고 암호화 로그인 식별자·scrypt 해시의 일반 학생 계정만 생성 |
| `/api/auth/[...nextauth]` | GET, POST | `home-actions`; Credentials·Kakao 인증, JWT 발급·갱신·로그아웃. IP·계정·조합별 DB 제한과 점진적 계정 대기 적용 |
| `/api/onboarding` | POST | `OnboardingExperience`; 고유 닉네임을 다시 검사하고 학생 학년·반·중복 없는 번호를 즉시 확정하거나 교사 승인 신청 생성 |
| `/api/me/nickname-availability` | POST | 온보딩·프로필; 로그인 사용자의 정규화 닉네임 HMAC 중복 확인 |
| `/api/me` | PATCH, DELETE | 고유 닉네임 변경, 계정 탈퇴 |
| `/api/me/password` | POST | Credentials 계정의 현재 비밀번호·새 강도 검증, 해시 교체, 강제 변경 해제와 전체 세션 무효화 |
| `/api/me/avatar` | POST, DELETE | 프로필 이미지 WebP 업로드·제거 |
| `/api/me/export` | GET | `/profile`의 내 데이터 JSON 다운로드 |
| `/api/users/[userId]/avatar` | GET | 저장된 공개 프로필 이미지 제공 |

### 홈·대시보드·재사용

| API | 메서드 | 주 소비자·역할 |
|---|---|---|
| `/api/boards` | POST | `CreateBoardButton`; 활성 사용자 새 보드 생성. 학생은 보관된 패드를 포함해 최대 10개이며 사용자별 DB 트랜잭션 잠금으로 동시 요청 우회 차단 |
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
| `/api/boards/[boardId]/members` | POST | `PadCanvas`; 일반 `loginId`, 카카오 이메일 또는 후보 `userId`로 멤버 추가 |
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
| `/api/admin/users` | GET | `AdminConsole`; 역할·상태 필터와 마스킹 목록. 교사는 요청 필터와 무관하게 자기 학교로 강제 제한 |
| `/api/admin/audit-logs` | GET | `AdminConsole`; 감사 로그 cursor 조회 |
| `/api/admin/students/import` | GET, POST multipart | `StudentRosterImport`; XLSX 양식, 미리보기, 학교→학년→반과 학생 계정 일괄 생성 |
| `/api/admin/students/move` | PATCH | 선택한 학생 최대 100명을 도착 반으로 이동하고 빈 번호 자동 배정. 기존 학교 권한·번호 중복을 학교 단위 트랜잭션에서 검사 |
| `/api/admin/schools`, `/api/admin/schools/[schoolId]` | POST, PATCH, DELETE | 학교 생성·이름 변경·삭제 |
| `/api/admin/schools/[schoolId]/groups/**` | GET, POST, PATCH, DELETE | 학생 학년·반 번호와 교사 부서 이름을 구분한 소속 CRUD. 같은 학교 교사는 구성원을 조회하고 구조 변경은 허가된 관리자·대표교사만 수행 |
| `/api/admin/teacher-approvals` | GET | `TeacherApprovalQueue`; 전체관리자는 전체, 대표교사는 자기 학교 대기열 |
| `/api/admin/teacher-approvals/[requestId]` | PATCH | 신청 학교·교사 부서·학생 상태를 재검증하고 승인 또는 사유 포함 반려 |
| `/api/admin/users/[userId]` | PATCH | 행 편집기·소속 구성원 번호 편집기; 역할·상태·소속 및 학생 번호 변경. 일반 교사는 자기 학교 학생 번호만 허용 |
| `/api/admin/users/[userId]/permissions` | PUT | `UserEditor`; 보조관리자 시스템 권한 동기화 |
| `/api/admin/users/[userId]/revoke-sessions` | POST | `UserEditor`; `authVersion` 증가 |
| `/api/admin/users/[userId]/password-reset` | POST | 관리 가능한 Credentials 계정에 무작위 임시 비밀번호 발급, 강제 변경 설정, 세션 해제·감사 |
| `/api/admin/users/[userId]/pii` | POST | `UserEditor`; 최근 로그인·사유·감사 후 일시 복호화 |
| `/api/admin/boards/[boardId]/purge` | DELETE | 홈 보관함; 30일 이후 보드와 실제 파일 영구 삭제 |
| `/api/admin/boards/[boardId]/transfer` | POST | 현재 직접 연결된 UI 없음; 소유권 이전 운영 API |
| `/api/admin/posts/[postId]/purge` | DELETE | 현재 직접 연결된 UI 없음; 30일 이후 게시물·파일 영구 삭제 API |

## 5. 공통 서버 계층

| 경로 | 책임 |
|---|---|
| `lib/auth/auth-options.ts` | Credentials·Kakao 인증, JWT의 내부 사용자 ID·세션 버전·온보딩·강제 비밀번호 변경 상태 |
| `lib/auth/credentials.ts` | 일반 계정 `loginId`와 회원가입·변경 비밀번호 정책의 서버 계약 |
| `lib/auth/password.ts` | 고정 비용 scrypt 사용자 비밀번호 해시·검증과 미등록 계정 더미 연산 |
| `lib/auth/registration.ts`, `lib/auth/security.ts` | 예약 시스템 아이디 선점 차단, DB 기반 IP·계정별 제한, 점진적 대기와 집계 보안 이벤트 |
| `proxy.ts` | 신규 사용자 프로필 설정·교사 승인 대기와 임시 비밀번호 계정의 페이지/API 게이트, 요청별 nonce CSP 발급, 전체 쓰기 API의 요청량 백스톱 |
| `lib/security/request-identity.ts`, `lib/security/rate-limit*.ts` | 신뢰 가능한 요청자 식별과 인메모리 고정 윈도 제한, `assertRateLimit`/`RateLimitError` |
| `lib/realtime/sse-stream.ts` | 두 SSE 라우트 공용 스트림: enqueue 예외 격리, 연결 수 상한, 백프레셔 종료, heartbeat |
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
| `lib/users/student-roster.ts` | XLSX 3MB·500행·필수 열·수식·숫자·중복 검사, 학생 ID/초기 비밀번호 계산과 템플릿 생성 |
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

1. 카카오는 검증 이메일이 DB에 없을 때, 일반 회원가입은 `loginId`·비밀번호 검증을 통과했을 때 소속 없는 `STUDENT`, `onboardingCompletedAt = null` 사용자로 생성한다. 일반 계정은 salt+scrypt 해시만 저장하며 관리자 부트스트랩 권한을 자동 부여하지 않는다.
2. 학생 선택은 학교의 `CLASS`인지 확인한 뒤 사용자 소속과 완료 시각을 저장한다.
3. 교사 선택은 학교의 `DEPARTMENT`인지 확인하고 실제 역할을 바꾸지 않은 채 `TeacherApprovalRequest(PENDING)`만 저장한다. 해당 학교 대표교사와 전체관리자에게 알림을 보낸다.
4. 승인 전 `proxy.ts`가 `/approval-pending`, 인증·프로필 API 외 접근을 막는다.
5. 전체관리자 또는 같은 학교 대표교사가 승인하면 신청 상태, `TEACHER` 역할, 학교·부서, 완료 시각과 감사 로그를 한 트랜잭션에 저장한다. 반려하면 사유와 함께 `REJECTED`로 바꾸고 재신청 화면으로 보낸다.
6. 대기 화면의 NextAuth 세션 갱신과 다음 로그인은 DB 상태를 다시 읽으므로 브라우저가 끊겨도 승인 결과가 유지된다.

### 관리자 학생 명단과 최초 비밀번호

1. 전체관리자 또는 학교 대표교사가 `학생 계정 발급`에서 학교·학년·반·번호·이름 XLSX와 접두어를 제출한다. 대표교사는 자기 학교 이름만 사용할 수 있다.
2. 미리보기와 등록 요청은 각각 파일을 서버에서 다시 파싱한다. 3MB·500명·수식 금지·숫자 범위·파일 내부와 DB 아이디 중복을 검사한다.
3. 등록 시 scrypt 초기 비밀번호 해시를 먼저 계산하고, 학교 → `SchoolGrade` → `SchoolGroup(CLASS)`와 `User(STUDENT)`를 직렬화 트랜잭션으로 생성한다. 하나라도 충돌하면 일부 계정을 남기지 않는다.
4. 접두어는 1~10자 영문자·숫자만 허용한다. `{접두어}{학년}{반 2자리}{번호 2자리}` 로그인 아이디와 `{이름 첫 글자}{학생 코드}` 초기 비밀번호는 응답·CSV에서 한 번만 관리자에게 제공하며 초기 비밀번호는 DB·감사 로그에 평문으로 저장하지 않는다.
5. `mustChangePassword` JWT는 `/change-password`와 변경 API만 열어 준다. 새 비밀번호는 일반 가입과 같은 규칙을 통과해야 하며, 성공하면 `authVersion`을 올려 모든 기기의 기존 세션을 끊는다.
6. 관리자는 사용자 상세 작업에서 Credentials 계정을 무작위 임시 비밀번호로 초기화할 수 있고, 같은 강제 변경·세션 해제·감사 기록 흐름을 사용한다.

### 학교 대시보드·대표교사·반 이동

1. `SchoolDashboard`는 `getSchoolDirectory()`가 학교별 학생·교사·학급 수와 번호/학급 미지정 학생을 집계해 그립니다.
2. `SchoolManager`는 학교 아래에서 학년→반과 교사 부서를 분리해 보여주고, 전체관리자에게 대표교사 지정·해제 UI를 제공합니다.
3. 대표교사 변경은 일반 사용자 PATCH를 재사용하되 전체관리자만 허용하고, 활성 교사·학교 소속을 서버에서 다시 검증해 감사 로그와 함께 저장합니다. 정지·교사 역할 이탈·학교 이동·삭제 시 자동 해제합니다.
4. 사용자 목록에서 학생만 선택하면 반 이동 작업이 열립니다. 서버는 대표교사의 기존 학교와 도착 학교 범위를 모두 확인하고, 학교 advisory lock 안에서 빈 출석번호를 확정합니다.
5. 전출·재적 상태·담임·정원·학년도 진급은 현재 제품 범위에 없어 UI·API와 관련 DB 컬럼을 제거했습니다.

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

발행은 동기 `emit`이라 구독자 쪽 예외가 발행자(쓰기 API)까지 올라간다. `lib/realtime/sse-stream.ts`가 모든 전송을 감싸 이 경로를 끊고, 동시에 연결 수 상한(사용자·보드당 6, 익명 버킷 60, 프로세스 전체 `MAX_SSE_CONNECTIONS`)과 백프레셔 종료를 함께 강제한다. 상한을 넘은 새 연결은 429로 거절하며 기존 연결은 유지된다.

## 7. 데이터 모델 관계

```text
User
├─ 소유 Board / BoardMember
├─ BoardFollow / BoardFavorite / BoardVisit
├─ DashboardFolder ─ DashboardFolderBoard ─ Board
├─ Notification
├─ UserSystemPermission
├─ AdminAuditLog
└─ TeacherApprovalRequest ─ School / SchoolGroup(DEPARTMENT) / 검토 User

학교 소속
└─ School
   ├─ code / level / district / academicYear / operatingStatus
   ├─ SchoolGrade ─ SchoolGroup(CLASS: displayName / capacity / homeroomTeacher) ─ User.studentNumber
   └─ SchoolGroup(DEPARTMENT)

인증 보안
├─ User.loginIdentifierLookup / nameLookup: 원문 없는 고유 HMAC 조회 키
├─ AuthRateLimit: IP·계정·IP+계정별 만료 제한 상태
└─ AuthSecurityEvent: 시간대별 성공·실패·제한 집계(90일 보존)

Board
├─ Section ─ Post
│            ├─ Attachment
│            ├─ Comment ─ CommentMention / 댓글 Attachment
│            └─ Reaction
├─ BoardMember / BoardAccessRequest
├─ BoardInviteLink
├─ BoardActivity
└─ BoardFollow / BoardFavorite / BoardVisit
```

- `deletedAt`은 보드·섹션·글·댓글·첨부의 30일 복구 가능한 숨김 상태다. 영구 삭제와 별개다.
- `Board.state`와 `freezeAt`은 쓰기 동결이며 보관 상태가 아니다.
- `Notification`은 개인 수신함, `BoardActivity`는 보드 공용 타임라인이다.
- `BoardFollow`는 활동 알림 구독, `BoardFavorite`은 사용자가 직접 저장한 즐겨찾기, `BoardVisit`은 실제 최근 방문 시각이다.
- 일반 아이디 또는 카카오 이메일인 로그인 식별자와 이름·프로필 URL은 암호문으로, 중복 판정용 로그인 식별자·닉네임은 목적별 HMAC으로, 일반·초기·임시 계정 비밀번호는 salt+scrypt 단방향 해시로 저장하고 Client Component에는 목적별 DTO만 전달한다. 초기·임시 평문은 발급 응답에서만 한 번 전달한다.
- `TeacherApprovalRequest`는 승인 전 희망 학교·부서를 보관하고, 승인 시에만 실제 `User.role/schoolId/schoolGroupId`로 연결한다.
- 학생 학급은 `SchoolGrade`와 반 번호로 정규화하고, 출석번호는 `User.studentNumber`, 강제 비밀번호 변경 여부는 `User.mustChangePassword`가 보관한다.
- 학생 번호 변경은 `(schoolGroupId, studentNumber)` 고유 제약과 API의 선행 충돌 검사로 같은 반 중복을 막는다. 번호만 바꿀 때는 권한·소속 변화가 아니므로 학생 세션 버전을 올리지 않고, 변경 전후 값과 사유는 감사 로그에 남긴다.

## 8. 저장소와 운영 전제

- PostgreSQL 스키마는 `prisma/schema.prisma`, 이력은 `prisma/migrations/**`, 생성 타입은 `generated/prisma/**`에 있다.
- 첨부와 아바타는 오브젝트 스토리지 없이 `UPLOAD_DIR`의 로컬 영구 디스크를 사용한다. DB와 파일 백업을 함께 해야 한다.
- 파일·SSE 구조 때문에 현재 운영은 단일 앱 인스턴스가 기준이다. 다중 인스턴스로 갈 때는 공유 파일 저장소와 Redis 또는 PostgreSQL pub/sub 계층이 필요하다.
- 인증 속도 제한은 `AuthRateLimit`에 저장하므로 앱 재시작·다중 인스턴스에서도 공유된다. Vercel의 위조 방지 헤더 외 프록시 전달 IP는 `.env.example`의 신뢰 옵션을 명시적으로 켠 배포에서만 사용하며, 운영에서는 WAF의 인증 경로 IP 제한도 함께 둔다.
- 일반 회원가입은 항상 `STUDENT`를 만들고 `BOOTSTRAP_SUPER_ADMIN_EMAIL`을 선점할 수 없다. 해당 이메일의 최초 전체관리자 승격은 카카오가 검증한 이메일 경로에서만 일어난다.
- 학생 명단 등록은 최대 500개의 고비용 scrypt 연산을 수행할 수 있어 해당 관리자 Route Handler만 `maxDuration = 300`을 선언한다. 실행 환경의 함수 시간 한도가 더 짧으면 학년 단위 파일로 나누거나 장기 작업 큐로 옮겨야 한다.
- 쓰기 API는 일반적으로 요청량 제한, 활성 세션, same-origin, Zod 입력, 최신 대상 소속, capability, 동결 상태 순서로 검사한다.
- 요청량 제한은 두 겹이다. `proxy.ts`가 `/api/auth/*` 밖의 모든 쓰기 메서드에 계정(또는 신뢰 IP)당 분당 200회 백스톱을 걸고, 비용이 큰 라우트는 `assertRateLimit()`으로 더 좁은 상한을 따로 건다(`lib/security/overview.md`에 목록). 인증 경로는 `AuthRateLimit` DB 제한이 이미 더 촘촘하므로 백스톱에서 제외한다. 신뢰할 수 있는 IP를 얻을 수 없는 배포에서는 익명 요청이 한 버킷으로 묶여 자기 DoS가 되므로 익명 제한을 걸지 않는다 — 그 구간은 WAF 몫이다.
- 보안 응답 헤더 중 CSP만 `proxy.ts`가 요청마다 새 nonce와 함께 발급하고, 나머지 고정 헤더(HSTS·X-Frame-Options·nosniff·Referrer-Policy·Permissions-Policy)는 `next.config.ts`가 프록시 매처 밖 경로까지 덮는다. `app/layout.tsx`는 `headers()`의 `x-nonce`를 읽어 테마 초기화 인라인 스크립트에 붙이고, Next.js가 주입하는 인라인 스크립트에는 프레임워크가 같은 nonce를 자동으로 적용한다.
- 상세 정책을 바꿀 때는 `UI → Route Handler → lib 도메인 모듈 → Prisma/파일 → 활동·알림·SSE` 순서로 영향 범위를 확인한다.

## 9. 기능을 찾는 빠른 기준

| 바꾸려는 것 | 먼저 볼 파일 |
|---|---|
| 공개 홈·로그인 진입 | `app/page.tsx`, `components/landing/*`, `components/home/home-actions.tsx` |
| 내 패드·역할별 노출 | `app/(dashboard)/dashboard/page.tsx`, `components/home/*`, `lib/dashboard/*` |
| 보드 접근 정책 | `lib/board/permissions.ts`, `lib/auth/authorization.ts`, `lib/board/queries.ts` |
| 보드 화면 상호작용 | `components/pad/pad-canvas.tsx`, 하위 패널·레이아웃 |
| 게시물 입력 계약 | `post-composer.tsx`, section posts API, `lib/post-fields/*` |
| 댓글·반응 | `post-detail.tsx`, comments/reactions API, notifications |
| 첨부 파일 | attachments API, `lib/files/*`, `/files/[attachmentId]` |
| 실시간 갱신 | `use-pad-events.ts`, `lib/realtime/*`, events Route Handler |
| 관리자 권한·학생 명단 | `app/admin`, `components/admin/*`, `app/api/admin/*`, `lib/users/student-roster.ts`, `lib/auth/*` |
| 최초 가입·교사 승인 | `app/onboarding`, `app/approval-pending`, `app/api/onboarding`, `app/api/admin/teacher-approvals`, `lib/users/teacher-approvals.ts` |
| DB 변경 | `prisma/schema.prisma` → 새 migration → `generated/prisma/**` |

새 폴더나 기능을 추가하면 해당 폴더의 `overview.md`와 이 문서의 관련 흐름이 실제 구현과 계속 맞는지 함께 확인한다.
