# 앱 셸 개요

로그인 전용 대시보드의 데스크톱 고정 사이드바와 모바일·태블릿 드로어 내비게이션을 담당합니다. 공개 홈페이지(`/`)와 패드 본문(`/b/[slug]`)에는 이 셸을 그리지 않습니다.

- `app-sidebar.tsx`: `/dashboard`(내 패드), `/favorites`, `/search`, `/archived`, 폴더, 최근 방문, 프로필·관리자·테마·로그아웃을 한 내비게이션에 모읍니다. 960px 이상은 고정 사이드바, 그 아래는 왼쪽 아래 버튼으로 여닫는 드로어입니다.
- `app-shell.tsx`: 본문과 `AppSidebar`를 나란히 렌더링합니다. `showSidebar={false}`인 패드 캔버스에서는 고정 사이드바와 모바일 열기 버튼을 모두 생략합니다.
- `dashboard-chrome.tsx`: `AppShell`, 상단 알림·새 패드 버튼, 인증·패드 생성 Provider를 묶어 `app/(dashboard)/layout.tsx`에 상주시킵니다.

## 영속 레이아웃

`app/(dashboard)/layout.tsx`는 `/dashboard`, `/favorites`, `/search`, `/archived`, `/profile`, `/folders/[folderId]`가 공유합니다. 로그인 사용자는 한 번 그린 `DashboardChrome` 안에서 `page.tsx` 본문만 교체되므로, 라우트를 옮겨도 사이드바 DOM과 알림 SSE가 다시 마운트되지 않습니다. 비로그인 상태에서는 셸 없이 `children`만 반환하고 각 보호 페이지가 `/?login=1&callbackUrl=...`로 이동시킵니다.

레이아웃은 사이드바의 최근 방문·폴더를, 각 페이지는 본문 목록을 위해 같은 `getCurrentUser`/`getDashboardHomeData`를 사용할 수 있습니다. 두 서버 함수는 React `cache()`로 감싸져 같은 요청 안의 중복 DB 조회를 피합니다.

사이드바는 영속하므로 활성 항목을 서버 prop으로 고정하지 않고 `usePathname()`으로 계산합니다. `/dashboard`만 “내 패드”를 활성화하며 공개 루트 `/`는 이 라우트 그룹 밖입니다. 브랜드 링크도 셸 안에서는 `/dashboard`로 이동합니다.

모바일 드로어가 열리면 배경 스크롤을 잠그고 Escape, 배경, 닫기 버튼, 링크 선택으로 닫습니다. `/b/[slug]`는 `showSidebar={false}`를 사용하므로 모바일에서도 사이드바 버튼이 나타나지 않습니다.

최근 방문 데이터는 `BoardVisit.lastVisitedAt` 최신순 최대 6개입니다. 읽기 권한을 통과한 패드 진입만 기록하며, 활동 알림용 `BoardFollow`와 독립적으로 동작합니다.
