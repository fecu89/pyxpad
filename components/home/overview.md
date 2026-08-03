# 대시보드 본문 컴포넌트

로그인 전용 라우트(`/dashboard`, `/favorites`, `/search`, `/archived`, `/profile`, `/folders/[folderId]`)의 본문을 담당합니다. 공개 홈페이지(`/`)는 `components/landing/`에 있고, 영속 사이드바·상단바는 `components/shell/`이 담당합니다.

| 파일 | 역할 |
|---|---|
| `my-pads-view.tsx` | `/dashboard` — 참여 권한 탭, 관계별 그리드, 템플릿, 접근 요청. 학생은 참여 패드를 우선 표시 |
| `favorites-view.tsx` | `/favorites` — 정렬과 즐겨찾기 카드 그리드 |
| `search-view.tsx` | `/search` — 제목·소유자 검색과 결과 그리드 |
| `folder-view.tsx` | `/folders/[folderId]` — 폴더 이름 변경·삭제와 포함 패드 목록. 삭제 뒤 `/dashboard`로 이동 |
| `profile-form.tsx` | `/profile` — 데스크톱 2열·모바일 1열 프로필, 학교·반/부서·학생 번호, 고유 닉네임 확인·사진·Credentials 비밀번호 변경·내보내기·탈퇴 |
| `password-change-form.tsx` | 프로필의 일반 변경과 `/change-password` 최초 로그인 강제 변경이 공유하는 현재/새 비밀번호 폼 |
| `pad-grid.tsx` | 목록 화면 공용 compact 카드. 즐겨찾기·폴더·복제·템플릿·보관을 `…` 메뉴로 제공 |
| `pad-reuse-dialog.tsx` | 복제 제목·포함 항목·보안 정책을 확인하고 clone API 호출 |
| `home-shell.tsx` | 상단바 공용 `Brand`와 `/archived`의 `ArchivedBoards`만 제공 |
| `home-actions.tsx` | 로그인 아이디 중복 확인 → 비밀번호 설정의 2단계 일반 회원가입과 로그인·카카오·로그아웃 컨텍스트. 기본 로그인 목적지는 `/dashboard` |

## 데이터와 권한

- 각 페이지는 Server Component에서 `getCurrentUser`와 `getDashboardHomeData`를 호출합니다. 서버가 읽기 권한을 통과시킨 DTO만 본문 컴포넌트에 전달하고, Client Component는 그 목록 안에서 정렬·필터링합니다.
- 학생은 참여한 패드가 있으면 `참여한 패드` 탭을 기본 선택합니다. 참여 패드는 `글쓰기 가능`과 `보기 전용`으로 다시 나눌 수 있고, `allowMemberPosting`을 포함한 서버 capability를 기준으로 합니다.
- 최근 방문은 `BoardVisit.lastVisitedAt` 최신순 최대 6개를 사이드바에 표시합니다. 활동 알림 구독인 `BoardFollow`나 수동 `BoardFavorite`과 별도입니다.
- 접근 요청은 본인의 `PENDING`·`REJECTED`만 표시하고, 승인된 요청은 멤버십 패드로 이동합니다.
- 폴더 생성·변경·삭제와 포함 여부 변경은 `/api/dashboard`가 사용자 소유 폴더인지와 대상 패드 읽기 권한을 다시 확인합니다. 새 폴더는 사이드바, 패드 포함은 카드의 `…` 메뉴에서 처리합니다.
- 보관은 목록에서 사라지는 작업이므로 카드 메뉴의 마지막 위험색 항목입니다. 보관된 패드는 `/archived`에서 30일 안에 복구하며, 소유자 또는 전체관리자만 영구 삭제할 수 있습니다.
- 학생을 포함한 활성 사용자에게 새 패드·복제 UI를 서버 분기로 넣고 API가 최신 권한을 다시 검사합니다. 학생은 보관된 패드까지 합쳐 최대 10개를 소유할 수 있고 생성·복제·관리자 소유권 이전이 같은 서버 한도를 공유합니다.

## compact 카드와 반응형

- 배경 이미지가 없는 카드는 장식용 임의 색상 썸네일 없이 제목·소유자·공개 범위·섹션/글 수에 집중합니다. 배경 이미지를 지정한 패드만 상단 88px WebP 커버를 지연 로드합니다.
- 데스크톱 최대 4열, 1080px 이하 3열, 720px 이하 2열, 작은 모바일 1열로 줄어듭니다. 새 패드 타일도 같은 높이 규칙을 씁니다.
- 보조 동작은 `…` 메뉴로 묶고 바깥 클릭과 Escape로 닫습니다. `aria-expanded`/`aria-controls`를 제공하며 즐겨찾기 상태는 카드 본문의 작은 별표로도 확인할 수 있습니다.

## 인증과 화면 이동

- 회원가입은 3~20자 영문·숫자 로그인 아이디 확인 단계와 비밀번호 단계로 분리됩니다. 입력 중에는 10자 이상·영문자·숫자·특수문자 충족 여부를 표시하지만, 신뢰 경계인 등록 API가 아이디 형식·중복·예약값·흔한 비밀번호·비밀번호의 아이디 포함 여부까지 다시 검사합니다.
- 프로필 닉네임은 저장 전 명시적으로 중복 확인할 수 있고, 저장 API와 DB 고유 인덱스가 확인 직후 다른 사용자가 같은 이름을 선점하는 경쟁 조건까지 차단합니다.
- 아이디·비밀번호 계정은 프로필에서 현재 비밀번호를 확인한 뒤 회원가입과 같은 강도의 새 비밀번호로 바꿀 수 있습니다. 관리자가 일괄 생성·초기화한 계정은 첫 로그인에 `/change-password`만 열리며, 변경 성공 뒤 기존 JWT가 모두 무효화되어 새 비밀번호로 다시 로그인합니다.
- 공개 루트가 인증 오류와 `/?login=1&callbackUrl=...`를 처리합니다. `safeInternalCallbackUrl`이 외부 URL과 프로토콜 상대 URL을 거부한 뒤 `HomeAuthActionsProvider`에 목적지를 전달합니다.
- `/dashboard`와 이 라우트 그룹의 다른 페이지는 비로그인 사용자를 공개 루트 로그인 모달로 보내고, 성공하면 요청했던 내부 경로로 복귀합니다.
- 로그아웃·계정 탈퇴 뒤에는 공개 루트(`/`)로, 폴더 삭제·패드 보관·관리자 화면 복귀는 작업공간(`/dashboard`)으로 이동합니다.
- `ProfileButton`은 `/profile` 링크입니다. `ProfileForm` 저장 뒤 `router.refresh()`가 공유 layout의 아바타와 사용자 요약도 다시 조회합니다.

과거 비로그인 최소 게이트였던 `HomeAccessGate`와 `app/(dashboard)/page.tsx`는 공개 랜딩과 `/dashboard` 분리 과정에서 제거했습니다. 대시보드 상단바·사이드바가 라우트 이동 때 재마운트되지 않는 구조는 `components/shell/overview.md`를 참고합니다.
