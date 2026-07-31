# 홈 컴포넌트 개요

대시보드 라우트(`/`, `/favorites`, `/search`, `/profile`, `/folders/[folderId]`)의 본문 화면을 담당합니다. 사이드바·상단바 같은 셸은 `components/shell/`이 맡습니다(`components/shell/overview.md`).

| 파일 | 역할 |
|---|---|
| `pad-grid.tsx` | 네 목록 화면이 공유하는 compact 카드 그리드. 즐겨찾기·폴더 담기·복제·템플릿·보관을 카드의 `…` 메뉴로 묶고 `PadReuseDialog`를 연결합니다. 정렬 헬퍼 `sortPads`도 export |
| `my-pads-view.tsx` | `/` — 정렬 + 참여 권한 탭(글쓰기 가능/보기 전용) + 관계별 그리드 + 템플릿 + 접근 요청. 학생은 참여 패드 우선 |
| `favorites-view.tsx` | `/favorites` — 정렬 + 즐겨찾기 그리드만 |
| `search-view.tsx` | `/search` — 검색 입력 + 결과 그리드 |
| `folder-view.tsx` | `/folders/[folderId]` — 폴더 이름·이름변경·삭제 + 그 폴더의 그리드 |
| `profile-form.tsx` | `/profile` — 데스크톱 2열/모바일 1열 프로필, 학교·반/부서 요약, 닉네임·사진·데이터 내보내기·탈퇴 |
| `home-shell.tsx` | 비로그인 로그인 게이트(`HomeAccessGate`), 보관된 패드 섹션(`ArchivedBoards`), 공용 워드마크(`Brand`) |
| `home-actions.tsx` | 로그인·로그아웃·패드 생성·복구·영구삭제 버튼과 그 모달 |

네 목록 화면 모두 서버가 이미 권한 필터링한 `getDashboardHomeData`의 `myBoards`/`dashboardFolders`를 받아 클라이언트에서 거르기만 합니다(새 쿼리 없음). CSS는 `pad-dashboard.module.css`에 격리해 보드 캔버스와 전역 스타일을 건드리지 않습니다.

- 최근 방문은 독립 `BoardVisit.lastVisitedAt`을 사용합니다. 로그인 사용자가 읽기 권한을 통과한 패드 페이지를 열 때 기록하고 최신순 최대 6개를 사이드바에 표시합니다.
- 접근 요청은 현재 사용자 본인의 `PENDING`·`REJECTED` 요청만 표시합니다. 승인된 요청은 멤버십 보드로 이동합니다.
- 보관된 보드는 기존 서버 렌더링 복구·영구삭제 UI를 유지해 같은 홈에서 요청 상태와 보관함을 함께 확인할 수 있습니다.
- 즐겨찾기는 활동 알림용 팔로우와 별도 API로 저장합니다. 폴더 생성·이름 변경·삭제와 보드 포함 여부 변경은 `/api/dashboard`가 현재 사용자 소유 폴더인지와 보드 읽기 권한을 다시 확인합니다.
- 카드의 `…` 메뉴 안에서 폴더 체크 목록을 열 수 있으며 모바일에서도 같은 동작을 유지합니다. 홈 안내문은 새 폴더를 사이드바의 `내 폴더`에서 만들고 카드 메뉴에서 담는 순서를 설명합니다.
- `OWNED` 카드의 `보관함으로 이동`은 `…` 메뉴 마지막에 두고 위험색 글자·아이콘·hover 배경을 적용합니다. 30일 안에 복구할 수 있는 보관이지만 목록에서 항목이 사라지는 작업이라 일반 액션과 시각적으로 구분합니다.
- `pad-reuse-dialog.tsx`는 보드 복제 옵션과 보안 정책, 자동 복제 링크를 보여주고 `/api/boards/{boardId}/clone`을 호출합니다. 교사 이상에게만 Server Component 권한 분기를 거쳐 렌더링됩니다.
- 템플릿 갤러리는 읽을 수 있는 공개 템플릿과 본인이 관리하는 템플릿만 표시합니다. 보드 관리자는 카드 메뉴에서 템플릿 표시를 전환할 수 있습니다.

- 비로그인 사용자가 로그인 또는 카카오로 시작하기를 누르면 카카오 로그인 모달을 엽니다.
- 로그인은 `next-auth/react`의 `signIn("kakao")`, 로그아웃은 `signOut()`을 사용합니다.
- OAuth 오류 쿼리는 홈 Server Component에서 사용자용 메시지로 변환해 모달에 전달합니다.
- 보호된 보드에서 이동한 경우 로그인 모달을 즉시 열고, 서버에서 검증한 내부 콜백 경로로 로그인 후 복귀합니다.
- 인증된 사용자 정보와 보드 데이터는 Server Component에서만 조회하고 역할·시스템 권한에 따라 관리자 링크, 보드 생성 UI, 전체 보드 목록, 영구삭제 UI의 존재 여부를 서버에서 결정합니다.
- 학생과 비로그인 응답에는 보드 생성 Client Component와 생성 모달 Provider를 RSC 트리에 넣지 않습니다. 실제 API도 같은 권한 헬퍼로 다시 검증합니다.
- 상단의 본인 이름(`ProfileButton`)은 `/profile` 페이지로 가는 링크입니다. 그 페이지의 `ProfileForm`이 닉네임은 `PATCH /api/me`, 사진 업로드·삭제는 `POST`/`DELETE /api/me/avatar`를 호출하고, 저장 후 `router.refresh()`로 서버에서 다시 조회한 값을 반영합니다(layout까지 갱신되어 헤더 아바타도 최신이 됩니다).
- (사용자 UX 피드백 반영) 프로필 화면은 어느 동작이 진행 중인지 알 수 없다는 지적을 받아, `pending: boolean` 하나 대신 `busy: "name" | "photo" | "remove" | "delete" | null`로 바꿔 버튼 문구가 동작별로 바뀝니다("업로드 중...", "저장하는 중..." 등). 닉네임 저장 성공 시에는 저장 버튼에 "저장됨" 체크 표시를 2.2초간 보여줍니다.

## 대시보드 compact 카드와 옵션 메뉴 (사용자 UX 피드백 반영)

기존 카드는 설정하지 않은 임의 색상까지 132px 썸네일 영역으로 크게 보여주고, 하단에 즐겨찾기·폴더·
보관·복제·템플릿 버튼을 한 줄로 노출해 실제 정보량에 비해 최소 높이가 255px였습니다.

- 장식용 `.thumb`과 `thumbStyle` 해시 팔레트를 제거했습니다. 카드에는 공개 범위·템플릿 여부,
  제목·소유자·섹션/글 수만 남기고 최소 높이를 150px로 줄였습니다.
- 데스크톱은 최대 4열, 1080px 이하는 3열, 720px 이하는 2열, 모바일은 1열 116px 카드로
  자연스럽게 줄어듭니다. 새 패드 타일도 같은 높이 규칙을 사용합니다.
- 모든 보조 동작은 카드 오른쪽 위 `…` 메뉴로 묶었습니다. 바깥 클릭과 Escape로 닫히고,
  `aria-expanded`/`aria-controls`로 열림 상태를 알립니다. 즐겨찾기된 카드는 작은 별표만 본문에
  남겨 현재 상태를 확인할 수 있습니다.
- 폴더는 메뉴 안의 접이식 체크 목록으로 관리하고, 보관은 메뉴 마지막 위험색 항목으로 표시합니다.
- 패드 설정에서 배경 이미지를 지정한 카드만 상단에 88px 커버를 추가합니다. 같은 권한 보호 WebP URL을 `loading="lazy"`로 불러오며, 이미지가 없는 카드는 기존 150px(모바일 116px) compact 높이를 유지합니다. 커버 위 `…` 버튼은 반투명 어두운 표면으로 바꿔 밝고 어두운 사진 모두에서 읽히게 합니다.

## 담벼락 디자인 리스킨 (Claude Design `담벼락 앱.dc.html` 적용)

- 초기에 추가했던 해시 기반 색상 썸네일과 모바일 56px 썸네일 행은 위의 compact 카드 개편에서
  제거했습니다. 현재는 화면 크기와 무관하게 정보 중심 카드와 동일한 `…` 옵션 메뉴를 사용합니다.
- 로그인한 사용자의 대시보드 영역은 `components/shell/app-shell.tsx`(`AppShell`)로 감싸 데스크탑에서 좌측 사이드바가 나란히 붙습니다. 자세한 내용은 `components/shell/overview.md`를 참고하세요.

변경한 경로: `components/home/pad-dashboard.tsx`, `components/home/pad-dashboard.module.css`, `components/home/home-shell.tsx`, `components/home/home-actions.tsx`, `app/globals.css`

## PyxPad 리브랜딩

`home-shell.tsx`의 `Brand` 컴포넌트 텍스트, 소유자 이름 fallback, `home-actions.tsx`의 로그인 버튼 문구, `pad-dashboard.tsx`의 소유자 이름 fallback을 전부 "PyxPad"로 통일했습니다. newDesign.html(Claude Design 목업 7장)의 oklch 팔레트·카드 모양은 이미 이 폴더에 구현돼 있어 색상·레이아웃은 그대로 두고 브랜드 텍스트만 교체했습니다.

## 마케팅 홈 콘텐츠 제거, 로그인 화면만 남김 (사용자 피드백 반영)

로그인 여부와 무관하게 항상 보이던 히어로(헤드라인·미리보기 목업·CTA), "함께 둘러볼 패드" 공개 보드 쇼케이스, "세 걸음이면 충분해요" 3단계 설명을 전부 제거했습니다("광고 필요 없다"는 피드백).

비로그인 상태는 새 CSS를 추가하지 않고 앱 전역에서 이미 쓰던 "접근 게이트" 패턴(`app/admin/page.tsx`의 권한 거부 화면과 동일한 `.access-page`/`.access-nav`/`.access-card`/`.access-icon`/`.access-eyebrow`/`.access-description`/`.access-actions`)을 그대로 재사용해 브랜드 + "로그인하고 시작하세요" + 카카오 로그인 버튼만 보여줍니다.

부수 정리: 공개 보드 쇼케이스 전용이던 `BoardCard` 컴포넌트와 `colors`/`discoveryScopeLabel` 상수를 삭제했고, `lib/board/queries.ts`의 `getHomeData`에서 `publicBoards` 쿼리 자체를 제거했습니다(다른 소비처 없음). `app/globals.css`의 `.hero*`/`.preview-*`/`.sticky*`/`.floating-note`/`.how-section`/`.how-grid*`/`.pad-grid`/`.board-card*`/`.empty-board-card`/`.desktop-only`와 관련 미디어쿼리·다크모드 예외도 함께 삭제했습니다(`.eyebrow`/`.boards-section`/`.section-heading`은 보관된 패드 섹션이 계속 써서 남겨뒀습니다).

## `home-shell.tsx` 분해와 라우트 그룹 (사용자 피드백 반영)

"라우트가 따로 빠지지만 layout을 쓰지 않아 사이드바 포함 전체가 리로딩된다"는 지적에 따라 `app/(dashboard)` 라우트 그룹 + `layout.tsx`로 재구성하면서, 하나였던 `HomeShell`을 역할별로 나눴습니다:

- `HomeAccessGate`: 비로그인 사용자가 보는 로그인 게이트 화면만.
- `DashboardHomeContent`: `/`, `/favorites`, `/profile` 세 페이지가 **완전히 똑같이** 재사용하는 대시보드 콘텐츠(`BoardDashboard` + 보관된 패드 섹션). 즐겨찾기 필터·프로필 모달은 각 컴포넌트가 `usePathname()`으로 스스로 판단하므로 페이지별로 다른 prop이 필요 없습니다.
- `Brand`: 상단바·게이트가 공유하는 워드마크 (`components/shell/dashboard-chrome.tsx`도 import).
- 상단바(관리자 링크·다크토글·알림벨·프로필·로그아웃·새 패드)와 `ProfileActionsProvider`/`CreateBoardActionsProvider`는 이 파일이 아니라 `components/shell/dashboard-chrome.tsx`로 옮겨져 layout에 상주합니다.

`pad-dashboard.tsx`의 관계 필터는 `initialFilter` prop 대신 `usePathname() === "/favorites"`로 초기값을 정하고, 사이드바와 중복이던 "전체"·"즐겨찾기" 탭 버튼은 제거했습니다(남은 소유/공유/관리/저장 버튼은 다시 누르면 전체 보기로 돌아가는 토글). `ProfileActionsProvider`는 layout에 상주해 리마운트되지 않으므로 `usePathname()` 변화를 이펙트로 감시해 `/profile`에서 모달을 엽니다. 자세한 구조는 `components/shell/overview.md`를 참고하세요.

## 라우트별 화면으로 분해 + 마이페이지 페이지화 (사용자 피드백 반영)

"root 페이지에서 너무 많은 것을 보여주려 한다 / 상단 탭이 사이드바와 기능이 같다 / 검색은 사이드바로 빼서 search 라우트로 / 마이페이지는 왜 굳이 창을 띄우냐"는 피드백을 받아, 한 덩어리였던 `pad-dashboard.tsx`를 없애고 사이드바 항목마다 전용 화면을 갖도록 나눴습니다(위 표 참고).

- **참여 탭**: `참여한 패드`, `글쓰기 가능`, `보기 전용`, `내가 만든 패드` 탭을 제공합니다. 글쓰기 가능 여부는 멤버 역할뿐 아니라 패드의 `allowMemberPosting` 설정까지 서버에서 계산합니다. 학생은 첫 진입과 전체 그룹 순서에서 참여 패드가 먼저 보입니다.
- **검색 분리**: 본문 툴바의 검색 입력을 `/search` 라우트(`search-view.tsx`)로 옮겼습니다. 검색 방식(제목·소유자 이름 대상 클라이언트 필터)은 그대로이고, 서버가 이미 권한 필터를 통과한 패드만 내려주므로 추가 권한 검사는 없습니다.
- **즐겨찾기 단순화**: `/favorites`는 이제 `/`와 같은 컴포넌트를 필터만 걸어 재사용하지 않고, 정렬 + 카드 그리드만 있는 전용 화면(`favorites-view.tsx`)입니다.
- **폴더 라우트화**: 본문의 폴더 칩 줄을 사이드바 목록으로 옮기고(폴더 생성도 사이드바에서), 폴더마다 `/folders/[folderId]` 화면(`folder-view.tsx`)에서 그 폴더의 패드를 보고 이름 변경·삭제를 합니다.
- **"최근 본 패드" 섹션 제거**: 사이드바의 "최근 방문"과 중복이라 본문에서 뺐습니다.
- **마이페이지 페이지화**: `ProfileActionsProvider`(모달 + 컨텍스트)를 통째로 제거하고 폼을 `profile-form.tsx`로 옮겨 `/profile` 페이지 본문으로 렌더링합니다. 탈퇴 후 로그아웃은 컨텍스트 대신 `signOut({ callbackUrl: "/" })`을 직접 호출합니다. `ProfileButton`은 모달을 여는 버튼에서 `/profile` 링크로 바뀌었고, 이름·아바타는 layout이 가진 `user`에서 그대로 받습니다.
- 대시보드와 패드의 중복 푸터는 제거했습니다.
- 죽은 CSS 정리: `pad-dashboard.module.css`의 `.folders`/`.folderRow`/`.folderChip`/`.folderCreate`/`.recent*` 규칙을 삭제하고(사이드바용 `.app-sidebar-*`가 대체), `.toolbar`는 화면마다 검색만·정렬만 있을 수 있어 고정 2열 그리드에서 flex로 바꿨습니다. `.root`의 `border-top`과 큰 위쪽 여백은 이제 본문이 셸 안에 들어가서 필요 없어 뺐습니다.

변경한 경로: `components/home/`(pad-grid·my-pads-view·favorites-view·search-view·folder-view·profile-form 신규, pad-dashboard 삭제, home-shell·home-actions 축소), `components/shell/`(app-sidebar·app-shell·dashboard-chrome), `app/(dashboard)/**`, `app/globals.css`

## 로그인 게이트 아이콘·파비콘 교체, 공용 access-* 토큰화 (사용자 피드백 반영)

"로그인 전 첫 화면이 구리고 아이콘도 브랜드랑 안 맞는다"는 지적을 받아 두 가지를 고쳤습니다.

- `public/favicon/*`, `app/favicon.ico`가 실제 로고(`public/logo.svg`, 남색 나침반+펜촉)와 무관한 주황색 아이콘이었습니다. `logo.svg`에서 전체 파비콘 세트(16/32px, apple-touch-icon, android-chrome 192/512, favicon.ico)를 새로 렌더링해 교체했습니다.
- `HomeAccessGate`(`home-shell.tsx`)의 아이콘을 브랜드와 무관한 lucide `LayoutGrid`에서 실제 로고 마크(`Logo`, `.access-brand-mark`)로 교체했습니다.
- `.access-page`/`.access-card`/`.access-icon`/`.access-description`/`.access-board-title`(`app/globals.css`)이 담벼락 리스킨 이전의 웜톤 하드코딩 색(`#f5f3ed` 등)을 그대로 쓰고 있어 나머지 화면의 쿨톤 oklch 토큰과 안 맞았던 것을 `var(--canvas)`/`var(--surface-strong)`/`var(--line)`/`var(--muted)`/`var(--ink)`로 교체했습니다. `.access-icon`은 다크모드 대응이 아예 없어(하드코딩 민트) 다크모드에서 밝은 사각형이 튀는 버그였는데 `var(--mint)`/`var(--green-dark)`로 고쳐 라이트·다크 모두 자연스럽습니다. 이 클래스들은 로그인 게이트뿐 아니라 관리자 권한 거부(`app/admin/page.tsx`)·비밀번호 게이트·초대·보드 접근 요청 화면이 전부 공유하므로 5개 화면이 다 같이 좋아집니다.

변경한 경로: `public/favicon/*`, `app/favicon.ico`, `components/home/home-shell.tsx`, `app/globals.css`
