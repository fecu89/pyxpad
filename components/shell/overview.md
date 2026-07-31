# 앱 셸 개요

대시보드의 데스크톱 고정 사이드바와 모바일·태블릿 드로어 내비게이션을 담당합니다.

- `app-sidebar.tsx`의 `AppSidebar`: 브랜드 + 내 패드/즐겨찾기/검색/마이페이지 + 폴더 + 최근 방문을 한 내비게이션에 모읍니다. `≥960px`에서는 고정 사이드바이고, 그 아래에서는 왼쪽 아래 메뉴 버튼으로 여닫는 드로어입니다. 열리면 배경 스크롤을 잠그고 Escape·배경·닫기 버튼·링크로 닫힙니다.
- `app-shell.tsx`의 `AppShell`: `children`과 `AppSidebar`를 함께 렌더링합니다. `showSidebar={false}`인 `/b/[slug]` 패드 캔버스에서는 고정 사이드바와 모바일 드로어·메뉴 버튼을 모두 렌더링하지 않습니다.
- `dashboard-chrome.tsx`의 `DashboardChrome`: `app/(dashboard)/layout.tsx`가 로그인 사용자에게만 그리는 상주 셸 — `AppShell` + 상단바 + `HomeAuthActionsProvider`/`CreateBoardActionsProvider`를 묶습니다.

## `app/(dashboard)` 라우트 그룹으로 셸을 진짜 영속시킴 (사용자 피드백 반영)

**문제**: `/`, `/favorites`, `/profile`을 실제 라우트로 분리했던 이전 버전은 각 `page.tsx`가 독립적으로 `AppShell`을 그렸습니다. Next.js 라우팅은 세그먼트 단위로 갱신되므로, 공유 `layout.tsx`가 없으면 라우트를 옮길 때마다 사이드바까지 포함해 전부 다시 마운트됩니다("사이드바가 리로딩된다"는 피드백의 원인). 사이드바가 화면 전체 높이를 못 덮는 문제도 같은 원인이었습니다 — `.home-nav`(전체 폭 헤더)가 `.app-shell` 위에 별도로 얹혀 있어서 사이드바가 헤더 높이만큼 아래에서 시작했습니다.

**해결**: `app/(dashboard)/layout.tsx`가 로그인 여부를 확인해, 로그인 상태면 `DashboardChrome`(사이드바+상단바+Provider)으로 `children`을 감싸고, 비로그인이면 `children`을 그대로 반환합니다(비로그인 게이트는 `app/(dashboard)/page.tsx` 자신의 몫). `/`, `/favorites`, `/search`, `/profile`, `/folders/[folderId]`는 모두 이 레이아웃의 `children`입니다. 전역 `app/loading.tsx`처럼 셸보다 위에서 전체 트리를 교체하는 자동 로딩 경계는 두지 않고, 레이아웃 내부의 `Suspense`가 본문만 `DashboardLoading`으로 바꿉니다. 따라서 라우트 이동 중에도 사이드바 DOM과 알림 연결이 유지됩니다.

레이아웃과 그 아래 `page.tsx`가 똑같이 `getCurrentUser()`/`getDashboardHomeData(user)`를 호출하는데(레이아웃은 사이드바용 `recentBoards`만 필요, 페이지는 전체 대시보드 데이터가 필요), 이 두 함수는 `react`의 `cache()`로 감싸져 있어(`lib/auth/current-user.ts`, `lib/dashboard/queries.ts`) 같은 요청 안에서 두 번 호출돼도 실제 DB 조회는 한 번만 일어납니다(Next.js가 권장하는 "레이아웃·페이지가 겹치는 데이터" 패턴).

## 활성 탭·필터는 `usePathname()`으로 직접 계산

레이아웃이 라우트 이동 중에도 다시 렌더링되지 않으므로, "지금 어느 라우트인지"를 매번 새 prop으로 내려주는 방식은 애초에 성립하지 않습니다. 그래서 `AppSidebar`가 `usePathname()`으로 자기 활성 항목을 직접 계산합니다(`/` → 내 패드, `/favorites`, `/search`, `/profile`, `/folders/[id]`는 해당 폴더 항목, 그 외(`/b/[slug]` 등)는 전부 비활성). `AppShell`에는 `active` prop이 없습니다.

## 라우트별 화면 (`components/home/`)

사이드바 항목마다 전용 라우트와 화면이 있습니다 — `/`(내 패드), `/favorites`, `/search`, `/profile`, `/folders/[folderId]`. 각 `page.tsx`는 `getDashboardHomeData`로 받은 목록을 해당 화면 컴포넌트에 넘기기만 하고, 화면 구성은 `components/home/`이 담당합니다(`components/home/overview.md`의 표 참고). 비로그인 게이트(`HomeAccessGate`)는 `app/(dashboard)/page.tsx`가 비로그인일 때만 `HomeAuthActionsProvider`로 감싸 렌더링합니다 — 로그인 에러 메시지·OAuth 콜백은 `searchParams`가 필요한데 layout에는 `searchParams`가 내려오지 않아 페이지가 직접 처리합니다.

사이드바의 폴더 목록·폴더 생성 폼도 layout이 내려준 `dashboardFolders`를 씁니다. 폴더를 만들면 `POST /api/dashboard` 후 `router.refresh()`로 layout까지 다시 조회되어 목록이 갱신됩니다.

## 데이터 소스

- "최근 방문"은 `BoardVisit.lastVisitedAt` 최신순 최대 6개입니다. 패드 페이지는 접근 허가 뒤 방문만 기록하고 대시보드 내비게이션은 렌더링하지 않습니다. 대시보드로 돌아오면 갱신된 최근 목록이 표시됩니다.
- 로그인 게이트(비로그인 최소 로그인 화면)와 `/b/[slug]/print`, `/b/[slug]/present`는 이 셸을 쓰지 않습니다.

## PyxPad 리브랜딩

브랜드 워드마크를 "pyxpad"로 통일하고, 보드를 가리키던 사용자 문구는 "패드"로 통일했습니다.
