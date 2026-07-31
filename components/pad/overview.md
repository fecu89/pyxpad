# PyxPad 보드 컴포넌트 개요

이 폴더는 보드 캔버스, 섹션, 게시물 카드·상세·작성 UI와 SSE 클라이언트 상태를 담당합니다.

`post-composer.tsx`의 첨부 입력은 파일 선택, 드래그앤드롭, 클립보드 이미지 붙여넣기를 같은 검증·중복 제거 경로로 처리합니다. 지원 형식과 파일당 30MB 제한을 클라이언트에서 먼저 안내하고, 사용자는 업로드 전에 목록에서 개별 파일을 제거할 수 있습니다. 붙여넣기 이벤트는 파일만 첨부하며 textarea의 일반 텍스트 붙여넣기는 방해하지 않습니다. 최종 파일 검증과 WebP 변환은 서버 첨부 API가 다시 수행합니다.

`pad-access-gate.tsx`는 인증된 비멤버에게 권한 획득 절차와 요청 버튼을 제공하고, `pad-access-requests.tsx`는 소유자·관리자의 설정 모달에서 대기 요청 승인·거절을 처리합니다.

`pad-trash.tsx`는 서버가 사용자별로 필터링한 숨김 섹션·글·댓글·첨부를 30일 안에 복구하는 보관함 UI입니다. 개별 영구 삭제 외에도 현재 보이는 종류가 다른 항목을 모두 선택해 공통 사유 한 번으로 일괄 영구 삭제할 수 있습니다. 서버는 모든 항목의 패드 소속·숨김 상태·항목별 권한을 먼저 검증하고, 부모/자식 중복을 제거한 뒤 한 트랜잭션에서 처리합니다.

`pad-canvas.tsx`의 드래그앤드롭: 섹션은 하나의 `SortableContext`(가로) 안에 있어 드래그 중 재배치가 dnd-kit 기본 동작만으로 자연스럽습니다. 게시물은 섹션마다 별도의 `SortableContext`(세로)라 다른 섹션으로 넘어갈 때는 `onDragOver`에서 `localSections`를 직접 옮겨줘야 드래그 도중 다른 카드들이 자리를 비켜주는 것처럼 보입니다. `onDragEnd`는 이미 옮겨진 컨테이너 안에서 최종 순서만 확정해 `/api/posts/[postId]/reorder`를 호출합니다.

`.post-list`(섹션 내부 스크롤 영역)는 `overflow-y: auto`라, `useSortable`의 transform만으로 카드를 옮기면 다른 섹션으로 넘어가는 동안 카드가 원래 섹션의 스크롤 박스 경계에 시각적으로 잘려 "갇혀 있는" 것처럼 보였습니다. 그래서 `DndContext`에 `DragOverlay`를 추가해, 드래그 중인 카드/섹션은 포털로 최상위에 떠 있는 `PostDragPreview`/`SectionDragPreview` 복제본으로 그리고, 원래 자리의 카드는 `.dragging` 클래스(옅은 투명도)로만 남겨둡니다.

`pad-canvas.tsx`의 게시물 목록은 섹션당 최초 30개(`section.totalPostCount`로 실제 전체 개수를 앎)만 서버에서 내려오고, `section-column.tsx`의 "더 보기" 버튼이 `GET /api/sections/[sectionId]/posts?cursor=...`로 다음 페이지를 이어 붙입니다. 검색어를 입력하면(300ms 디바운스) 로컬 30개만 걸러내는 대신 `GET /api/boards/[boardId]/search`로 서버 검색한 결과가 `filteredSections`를 대체합니다 — 검색 중에는 드래그가 막힙니다(`filtering`). (padupgrade.md 4.1)

`pad-share-panel.tsx`는 보드 상단 "공유" 버튼이 여는 전달 전용 모달입니다. 링크 복사와 `qrcode` 패키지로 클라이언트에서 직접 생성하는 QR 코드만 보여주며, 발견 범위·비밀번호·iframe 삽입은 두지 않습니다. 발견 범위와 비밀번호는 설정의 `settings/pad-sharing-settings.tsx`, 접근 요청과 초대 링크는 같은 `공개·공유` 탭에서 관리합니다. `pad-password-gate.tsx`는 비밀번호가 걸린 보드에 비멤버 방문자가 들어왔을 때 보여주는 입력 화면입니다(`app/b/[slug]/page.tsx`의 `password-required` 상태).

별도로 열리던 게시물 `승인 대기함` 메뉴와 모달은 접근 요청 관리와 혼동된다는 피드백으로 제거했습니다. 서버의 게시물 검토 API는 기존 데이터와 직접 호출 호환성을 위해 유지합니다.

`pad-activity-panel.tsx`는 Prisma의 `BoardActivityType`을 그대로 DTO 타입과 아이콘 맵의 키로 사용합니다. 게시물 생성·수정·삭제·승인 처리(`POST_MODERATED`), 댓글 작성, 멤버 참여, 접근 요청 처리를 모두 표시하며, enum에 새 값이 추가됐는데 아이콘을 빠뜨리면 TypeScript 검사에서 실패하도록 `Record`로 완전성을 확인합니다. 배포 전환 중 예상하지 못한 활동 값이 들어와도 패널 전체가 깨지지 않도록 기본 아이콘도 둡니다.

보드 동결(padupgrade.md 5.4)은 `pad-canvas.tsx`의 `isFrozenNow(board)`가 `board.state === "FROZEN"`이거나 `board.freezeAt`이 이미 지났으면 참을 반환하는 것으로 판정합니다 — 서버(`isBoardFrozen`, `lib/auth/authorization.ts`)도 같은 두 조건으로 판정하므로 화면 표시와 실제 API 차단 여부가 항상 일치합니다. `freezeAt`은 크론 없이 매 쓰기 요청 시점에 지연 평가되므로, 예약 시각이 지나도 `board.state` 자체는 `ACTIVE`로 남아 있을 수 있습니다(다음 새로고침부터 배너가 뜨고 쓰기가 막힘). 동결 해제 버튼은 `state: "ACTIVE"`와 함께 `freezeAt: null`도 같이 보내 지나간 예약이 남아 즉시 다시 동결로 판정되는 걸 막습니다. 설정 모달의 동결 방식 선택(`moderationMode` select)과 동결 토글·예약 입력은 `PATCH /api/boards/[boardId]`를 그대로 씁니다.

`post-composer.tsx`는 padupgrade.md 6.1~6.3 작성 흐름을 통합합니다. `usePostDraft`가 제목·본문을 로컬에 자동저장하고 복구·이탈 경고를 제공하며, 본문 저장 뒤 `useAttachmentUploadQueue`가 파일별 진행률·취소·재시도와 최대 3개 동시 업로드를 처리합니다. 성공한 파일은 다시 올리지 않고 실패 항목과 실패 링크만 남기므로 게시물 본문을 보존한 채 재시도할 수 있습니다. 파일 선택·드롭·클립보드와 `MediaCapture`의 사진·음성·영상 파일은 같은 검증 큐를 사용합니다. `LinkPreviewInput`은 여러 URL을 줄 단위로 받아 최대 3개씩 미리보기를 확인하고 중복·전체 첨부 20개 한도를 적용한 다음, 대기 목록의 링크를 게시물 수정 또는 작성 한 번으로 저장합니다. 링크의 검증된 대표 이미지도 이때 함께 저장해 패드 카드와 상세 화면이 제목·출처 호스트가 있는 같은 링크 카드 디자인을 사용합니다.

`settings/`의 게시물 필드 디자이너는 제목·본문·첨부 표시/필수/placeholder와 사용자 정의 필드의 종류·선택지·순서·버전을 관리합니다. 작성기는 현재 설정 버전을 함께 제출하고, 카드·상세·Table 레이아웃은 게시 당시 고정된 사용자 정의 값을 표시합니다. 외형 설정은 레이아웃, 수동/작성일/제목/무작위 정렬, 새 글 위치, 카드 크기, 배경색·강조색, 글꼴, 작성자·시각 표시를 관리합니다. 기본 정보의 배경 이미지 필드는 전용 업로드 API로 JPG·PNG·WebP를 WebP로 변환해 저장하며, `pad-canvas.tsx`가 이 이미지를 SECTIONS를 포함한 모든 레이아웃의 패드 페이지 배경에 공통 적용합니다. 개별 레이아웃 surface에는 배경을 다시 그리지 않아 같은 이미지가 이중으로 반복되지 않습니다.

`comments/`는 게시물의 댓글·멘션·수정·삭제와 이미지·음성 첨부를 담당합니다. 화면 안에 계속 중첩되는 대댓글 폼은 모바일 레이아웃과 대화 흐름을 깨뜨려 제거했고, 새 댓글은 모두 시간순의 한 대화로 표시합니다. 기존 `parentId` 데이터와 API 입력은 호환을 위해 유지하되 옛 답글도 평면 목록에서 빠짐없이 보여줍니다. 댓글의 `언급하여 답장`은 하단의 단일 작성기로 이동해 작성자 토큰을 채우며, 사용자가 직접 `@` 뒤에 이름을 입력해도 패드 멤버·기존 댓글 작성자를 최대 6명까지 좁혀 찾습니다. 선택한 내부 사용자 ID만 `CommentMention`으로 저장하므로 같은 이름이나 표시 문자열만으로 알림 대상을 추측하지 않습니다. 참여자 전원을 나열하던 하단 `@` 칩은 제거했습니다. 댓글 응답은 작성자가 현재 활성 상태인지 `mentionable`로만 알려주고, 자동완성은 비활성 작성자를 제외합니다. 서버도 `mentionedUserIds`가 `ACTIVE` 사용자인지 다시 확인하므로 과거 댓글에 남은 삭제 계정은 멘션할 수 없습니다.

댓글 작성기는 목록과 섞이지 않도록 아이콘·제목·도움말·독립 테두리·글자 수·등록 영역을 갖춘 카드로 구분합니다. 데스크톱 댓글 패널 안에서는 아래에 붙어 있고, 모바일 1단 레이아웃에서는 일반 문서 흐름으로 이어집니다. `COMMENT_MENTIONED` 알림에는 `postId`와 `commentId`가 함께 저장되며 알림을 누르면 독립 게시물 경로의 `#comment-{id}`로 이동해 대상 댓글을 스크롤하고 강조합니다.

`reactions/`는 기본 반응과 한 grapheme 이모지, 단일/복수 정책을 표시하며 API가 반환한 키별 집계로 낙관 상태를 교정합니다. SSE `reaction.changed` 이벤트는 전체 보드를 다시 조회하지 않고 해당 게시물의 집계만 로컬로 교체합니다.

`comment-attachment-input.tsx`는 파일 선택(`이미지·음성`)만 제공합니다. 원래는 `MediaCapture`(카메라 촬영·마이크 녹음)도 같이 있었는데, "촬영·녹음은 어차피 파일 못 올리는 것 같은데 왜 있냐"는 피드백으로 제거했습니다 — 녹음 쪽은 실제로 버그가 있었습니다: `MediaCapture`가 녹음 결과 File의 `type`을 `recorder.mimeType`(예: `audio/webm;codecs=opus`, 코덱 파라미터 포함)으로 그대로 채우는데, `comment-attachment-input.tsx`의 `allowedAudioTypes`는 코덱 파라미터 없는 정확한 문자열(`audio/webm` 등)만 허용해 매번 "이미지 또는 음성 파일만 첨부할 수 있습니다"로 거부됐습니다(사진 촬영은 `image/jpeg`로 고정 저장해 이 문제가 없었음). `MediaCapture` 컴포넌트 자체는 `post-composer.tsx`(게시물 작성, modes 전체)가 계속 쓰고 있어 지우지 않았고, 댓글 쪽 연결(버튼·`captureOpen` 상태·`.capturePanel` CSS)만 제거했습니다.

`layouts/`에는 Columns·Wall·Grid·Stream·Timeline·Table 렌더러가 있습니다. 현재 `SECTIONS`는 기존 dnd-kit 섹션/게시물 편집 흐름을 계속 사용하고, 나머지 형식은 `PadLayoutRenderer`를 통해 같은 게시물 데이터를 다른 배치로 읽습니다. 자동 정렬과 검색 중에는 드래그를 비활성화해 화면 순서와 저장 순서가 충돌하지 않게 합니다.

`pad-export-panel.tsx`는 보드 상단의 내보내기·발표 모달입니다. 읽기 권한이 있는 사용자에게 인쇄·발표 링크를, 보드 소유자·관리자에게만 CSV·XLSX·첨부 ZIP 작업을 보여줍니다. `export/`는 인쇄용 게시물 뷰, 브라우저 PDF 인쇄·PNG 캡처 액션, 키보드와 버튼으로 이동하는 발표 화면을 담당합니다. 실제 다운로드 Route Handler가 같은 권한을 다시 검사하므로 클라이언트 노출 조건은 권한 경계가 아닙니다.

## 보드 상단바 정리 (사용자 UX 피드백 반영)

기능이 하나씩 추가될 때마다 `pad-canvas.tsx` 상단바에 아이콘이 하나씩 늘어나(활동·즐겨찾기·공유·내보내기·보관함·설정 등) 모바일에서 아이콘으로 가득 차고, "무슨 아이콘이 무슨 기능인지 모르겠다"는 사용성 피드백을 받았습니다. 두 가지로 정리했습니다.

- 보드의 별표는 홈과 똑같은 `BoardFavorite`/`/favorite` API를 사용하고 문구도 `즐겨찾기 추가·해제`로 통일했습니다. 활동 타임라인의 읽음 추적용 `BoardFollow`는 별개의 내부 모델이며 별표 UI로 노출하지 않습니다.
- `pad-more-menu.tsx`는 자주 안 쓰는 보조 기능(보드 활동 기록, 즐겨찾기, 보관함, 내보내기·발표)을 "⋯" 버튼 하나의 드롭다운으로 묶습니다. `notification-bell.tsx`와 같은 클릭 바깥 감지 패턴을 그대로 씁니다. 항목은 `{key, label, icon, onClick}` 배열로 받으므로 보드 관련 로직은 전혀 모르고, 어떤 항목을 보여줄지는 `pad-canvas.tsx`가 `capabilities`·로그인 여부로 결정합니다.
- 상단바에 항상 보이는 것은 이제 동기화 상태, 다크모드 토글, 알림 벨, 공유 버튼, 더보기(⋯), 설정(관리자만) 6개뿐입니다.
- 720px 이하에서 보드 도구의 `글 추가`·`섹션 추가` 버튼은 텍스트 크기를 0으로 줄여 아이콘만 남깁니다. 공용 `.button`의 `gap: 8px`까지 남으면 폭이 0인 텍스트 flex 항목 때문에 아이콘이 왼쪽으로 4px 밀리므로, 이 두 모바일 버튼에만 `gap: 0`을 적용해 SVG와 39px 버튼의 중심을 정확히 일치시킵니다.

보드 설정 모달을 기능별 탭으로 나눈 내용은 `settings/overview.md`를 참고하세요.

## 섹션 "글 추가" 버튼 위치, 보드 소개 압축 (사용자 UX 피드백 반영)

- `section-column.tsx`의 "글 추가" 버튼(`.section-add-trigger`)은 예전에 섹션 맨 아래(스크롤해야 보이는 `.section-footer`)에 있었는데, 헤더 바로 아래로 옮겼습니다. 처음에는 텍스트 라벨이 있는 작은 pill 버튼으로 만들었는데, "Padlet처럼 크고 확실한 버튼으로"라는 피드백을 받아 텍스트 없이 아이콘만 있는 전체 너비 버튼으로 다시 바꿨습니다 — 설명은 `title` 속성 툴팁("이 섹션에 게시 추가")으로만 제공합니다. 배경색은 처음엔 Padlet 스크린샷처럼 검정(`--ink`)이었는데, "내꺼(이 앱)에 맞춰봐"라는 피드백으로 이 앱의 기본 primary 색(`--green`, `.button.primary`와 같은 톤)으로 바꿨고, 보드 외형 설정에 강조색(`board.accentColor`)이 지정돼 있으면 `style={{background: accentColor}}`로 그 색을 우선합니다(보드마다 달라 CSS만으로 표현 못 함).
- 같은 헤더의 섹션 이동 손잡이(드래그 핸들)는 예전에 헤더 위에 따로 뜬 채(`position:absolute`) 세로 공간을 차지했는데, "⋯" 메뉴 버튼 옆 `.section-header-actions`로 옮겨 한 줄에 모았습니다.
- 섹션 제목에 더블클릭하면(`onDoubleClick`, 관리 권한 있을 때만) 기존 "⋯ → 수정"과 같은 편집 모달이 열립니다 — 더 빠른 진입점을 하나 더 추가한 것이고, 기존 메뉴 경로도 그대로 남아 있습니다. 섹션 설명은 이 레이아웃 헤더에서 더 이상 보여주지 않습니다("설명이 너무 길다"는 피드백) — 데이터는 계속 저장되고 편집 화면에서는 그대로 바꿀 수 있습니다.
- `pad-canvas.tsx`의 보드 소개 영역(`.board-hero`)은 예전에 발견 범위·제목(`clamp(30px,4vw,46px)`, 최대 46px)·설명이 각각 줄을 차지해 세로로 길었는데, 한 줄(`.board-hero-line`)로 압축했습니다(전체 높이 100px 이내). 설명(`board.description`)은 더 이상 화면에 표시하지 않고 `app/b/[slug]/page.tsx`의 `generateMetadata`가 `<meta name="description">`에만 내려줍니다 — 대신 한 줄 영역에 `title` 속성으로 마우스 오버 시 볼 수 있게 했습니다. 모바일(720px 이하)에서는 제작자 이름과 "N명이 함께해요" 텍스트를 숨기고 아바타만 남겨 한 줄을 유지합니다.

## 게시물 독립 상세 라우트

카드를 클릭했을 때 열리던 오른쪽 모달은 폭 규칙이 서로 충돌하고, 긴 본문과 댓글이 한 패널 안에서 경쟁해 읽기 흐름도 좋지 않았습니다. 상세 화면을 `/b/{slug}/posts/{postId}` 독립 경로로 옮겼습니다.

- `post-card.tsx`는 카드 클릭과 키보드 Enter/Space를 새 경로로 연결합니다. 드래그 직후의 click 차단과 카드 안 반응 버튼의 독립 동작은 유지합니다. 첨부 순서상 첫 시각 자료가 이미지면 기존 파일 썸네일을 사용합니다. 링크면 YouTube의 고정 썸네일 또는 일반 웹의 저장된 대표 이미지를 16:9 커버로 쓰고, 이미지 위에 링크 제목과 `youtube.com` 같은 호스트를 표시합니다. YouTube 카드에는 재생 표시도 함께 둡니다.
- 한글 slug는 `useParams()`에서 이미 `%EC...`로 들어오므로 그대로 다시 `encodeURIComponent`하지
  않습니다. `lib/board/route-paths.ts`가 입력을 정규화한 뒤 정확히 한 번만 인코딩해 `%25EC...`
  이중 인코딩과 그에 따른 상세 페이지 404를 방지합니다.
- `post-detail.tsx`의 `PostDetailPage`는 본문·사용자 정의 필드·첨부·반응·댓글·수정·삭제를 페이지형 UI로 제공합니다. 데스크톱은 본문과 댓글의 2단 구성, 900px 이하는 본문 다음 댓글로 이어지는 1단 구성입니다. 댓글 API는 최신 20개부터 가져오고 “이전 댓글 더 보기”로 과거 대화를 앞쪽에 붙여, 새 멘션 알림의 대상이 첫 화면에서 빠지는 일을 줄입니다.
- 상세 서버 페이지는 `getBoardPageData(..., { focusPostId })`를 사용해 보드와 같은 공개 범위·비밀번호·멤버·게시 상태 권한을 적용하면서 해당 게시물만 조회합니다.
- 수정은 기존 `PostComposer`를 열고, 삭제가 끝나면 원래 패드 경로로 이동합니다.

세부 라우팅과 권한 설명은 `app/b/[slug]/posts/[postId]/overview.md`를 참고하세요.

## 전체 글자 크기 확대, 섹션 컬럼 너비 축소 (사용자 UX 피드백 반영)

"전체적인 픽셀 크기가 너무 작다. 패들렛은 기본 14px인데 여긴 11px다"라는 피드백과 "열 가로 너비가 너무 넓다, 256 정도면 적당하다"는 피드백을 받아 반영했습니다.

- **글자 크기**: `app/globals.css`와 board 하위 각 컴포넌트의 `.module.css`(댓글, 반응, 첨부, 설정, 레이아웃, 작성기 등)에 있는 `font-size` 선언을 7~20px 구간에서 **약 1.27배(11px → 14px가 사용자가 준 정확한 기준점)** 비례 확대했습니다. 인쇄물/발표 화면 전용 스타일(`export/pad-print-view.module.css`, `export/pad-presentation.module.css`)은 종이 크기·슬라이드 비율에 맞춰 이미 별도로 튜닝돼 있어 이번 확대에서 제외했습니다. 22px 이상(홈 마케팅 히어로, 관리자 패널 제목 등)은 이미 충분히 크고 "기본 글자가 작다"는 피드백과 무관해 손대지 않았습니다.
- **섹션 컬럼 너비**: `.section-column`을 326px → 256px로 줄였습니다(`add-section-card`의 230px보다 살짝 넓은 정도로, 화면에 더 많은 섹션이 한 번에 보입니다).
- **두 변경이 겹쳐서 생긴 회귀**: `.section-header h2`(섹션 제목)가 원래 `white-space: nowrap; text-overflow: ellipsis`로 한 줄만 보여주고 나머지는 잘라냈는데, 컬럼이 좁아지고(326→256) 동시에 글자도 커지면서(16→20px) "오늘의 작은 실천"처럼 이전엔 한 줄에 다 들어가던 평범한 길이의 제목도 "오늘의 작은 실…"으로 잘려 보이는 문제가 실제로 생겼습니다. 헤드리스 브라우저로 확인하다가 발견했고, 한 줄 자르기 대신 `-webkit-line-clamp: 2`로 2줄까지 보여주도록 고쳐서(헤더 높이는 `min-height`만 있고 `max-height`가 없어 2줄이 되어도 레이아웃이 깨지지 않음) 정보 손실 없이 해결했습니다.
- 나머지 한 줄 말줄임 요소들(상단 유저 알약, 보드 소개 한 줄, 설정 목록의 이름·이메일 등)은 원래도 "너무 길면 잘라내는" 목록형 UI라 글자가 커져 조금 더 일찍 잘리는 것 자체는 의도된 동작이라 그대로 뒀습니다.

변경한 경로: `app/globals.css` 및 `components/`, `components/pad/` 아래 대부분의 `.module.css` (export/ 인쇄·발표 스타일 제외)

## 담벼락 디자인 리스킨 (Claude Design `담벼락 앱.dc.html` 적용)

Claude Design 프로젝트의 목업 7장(모바일 보드 목록·칸반·카드 상세·교사 관리자 뷰, 데스크탑 대시보드·칸반+사이드 패널·교사 관리자 뷰)을 참고해 기존 화면을 새 시각 언어(oklch 색상, Pretendard, 둥근 카드, 필 필터)로 다시 스킨했습니다. 상세 범위 판단은 `/home/fecu/.claude/plans/cheeky-zooming-journal.md`를 참고하세요. 새 기능을 만들지 않고 기존 화면 구조를 재활용한 지점이 많습니다.

- **섹션 바로가기 필**(`pad-canvas.tsx`의 `.board-section-pills`): 목업의 "전체/질문/아이디어/완료" 필터 pill을 그대로 하드코딩하지 않고 `board.sections`에서 동적으로 만듭니다. 실제로 카드를 걸러내진 않고(섹션은 이미 다 나란히 보임) 클릭하면 `scrollIntoView`로 해당 `.section-column`(`section-column.tsx`에 `id={`section-${section.id}`}` 추가)으로 가로 스크롤만 이동시키는 순수 UI 내비게이션입니다. 새 로컬 상태 `activeSectionPill`이 활성 pill을 추적하고, 섹션 pill을 누르면 기존 `quickSectionId`(원래 SECTIONS 아닌 레이아웃의 빠른 글쓰기 드롭다운용 상태)도 같이 갱신해 모바일 FAB(`.board-fab`, ≤720px에서만 보임)가 "지금 보고 있는 섹션"에 글을 추가하도록 재사용합니다.
- **카드 상세 페이지**: 카드 상세는 더 이상 사이드 패널을 쓰지 않고 `/b/{slug}/posts/{postId}`에서 엽니다. 보드로 돌아가는 링크와 독립적인 본문·댓글 레이아웃을 제공하며 모바일에서는 자연스럽게 한 줄로 쌓입니다.
- **모더레이터에게도 "검토 필요" 배지 노출**: `post-card.tsx`는 `!isOwnPost && capabilities.moderatePosts && PENDING` 조건에서 승인 권한자에게 `review-needed` 스타일 배지를 보여줍니다. 별도의 승인 대기함 UI는 더 이상 없습니다.
- **보드 상태 배지**: `pad-canvas.tsx`의 `.board-hero-line`에 `capabilities.manageBoard`일 때만 `Board.state` 기반 배지(ACTIVE→"운영중", FROZEN→"동결됨")를 추가했습니다. 기존 `frozen`(`isFrozenNow(board)`) 변수를 그대로 재사용합니다.
- **죽은 CSS 정리**: `post-card.tsx`가 붙이던 `accent-${index % 5}` 클래스는 어떤 CSS도 참조하지 않는 죽은 코드였습니다(과거 왼쪽 색 스트라이프 디자인의 흔적으로 추정). 목업이 카드에 색 스트라이프를 쓰지 않기도 해서, 클래스와 이제 안 쓰는 `PostCard`의 `index` prop, `app/globals.css`의 `.post-card::before`/`.accent-1~4` 규칙을 함께 제거했습니다.
- 대시보드의 좌측 사이드바·모바일 드로어는 `components/shell/`이 담당합니다(`components/shell/overview.md` 참고). `app/b/[slug]/page.tsx`는 `PadCanvas`를 `showSidebar={false}`인 `AppShell`로 감싸므로 패드 작성 화면에는 사이드바와 모바일 메뉴 버튼이 나타나지 않습니다.

변경한 경로: `components/pad/pad-canvas.tsx`, `components/pad/section-column.tsx`, `components/pad/post-card.tsx`, `components/pad/post-detail.tsx`, `app/globals.css`, `app/b/[slug]/page.tsx`

## PyxPad 리브랜딩

`pad-canvas.tsx`의 `inviteMember()`가 띄우는 `window.prompt` 안내문과 placeholder 이메일을 "PyxPad"와 `student@pyxpad.demo`로 통일했습니다. 데모 계정 이메일은 `prisma/seed.ts`에서도 같습니다.

## 카드/섹션 아무 데나 길게 눌러 드래그, 담벼락·격자 순서 변경 지원 (사용자 UX 피드백 반영)

안내 문구는 "카드를 길게 눌러 순서를 바꿀 수 있어요"였는데 실제로는 카드 오른쪽 아래 작은 그립 아이콘 버튼만 드래그 시작점이라 문구와 동작이 어긋났습니다. 문구를 실제 동작에 맞춘 게 아니라 반대로 동작을 문구에 맞췄습니다.

- `post-card.tsx`: `useSortable`의 `listeners`/`attributes`를 그립 버튼이 아니라 `<article>` 전체에 붙여 카드 아무 데나 누르고 있으면 드래그가 시작됩니다. `listeners`에서 `onKeyDown`만 따로 떼어 시각적으로 숨긴(`.drag-handle`, 키보드 포커스 시에만 보임) span에 붙여, 카드에 포커스가 있을 때 Enter/Space가 "글 열기"와 dnd-kit의 "키보드 드래그 시작"으로 충돌하지 않게 분리했습니다. 드래그 직후 뒤따라오는 클릭이 곧바로 상세 페이지를 열어버리지 않도록 `wasDraggingRef`로 한 번 걸러냅니다.
- 마우스는 8px 이동(`MouseSensor`), 터치는 250ms 누르고 있어야(`TouchSensor`, `delay`+`tolerance`) 드래그가 시작되도록 센서를 분리했습니다(예전엔 `PointerSensor` 하나로 거리 8px만 봤음). 터치에서 거리 기준을 쓰면 스크롤하려는 손가락도 드래그로 잡혀버리는데, 지연 기준은 그 시간 동안 손가락이 tolerance 이상 움직이면 드래그를 취소하고 기본 스크롤에 넘겨줍니다.
- `section-column.tsx`의 섹션(열) 이동도 같은 방식으로 바꿨습니다 — 헤더 전체가 드래그 대상이고, 그립 아이콘은 키보드 포커스 전용으로 숨겼습니다. 섹션을 드래그할 때 뜨는 `SectionDragPreview`(`pad-sections-board.tsx`)는 원래부터 섹션 헤더만(안의 게시물 카드 전부가 아니라) 복제해서 커서를 따라다니게 했었습니다.
- **다른 섹션으로 게시물을 옮기는 무한루프 버그**: 예전엔 좁은 그립 버튼으로 다른 섹션까지 정확히 끌고 가기 어려워 거의 재현이 안 됐는데, 카드 전체를 눌러 끄는 방식으로 바뀌면서 쉽게 걸리게 됐습니다. 게시물을 다른 섹션으로 옮기면 원래 섹션은 줄고 대상 섹션은 커지는데, `closestCenter` 충돌 감지는 "가장 가까운 컨테이너"를 기준으로 판단해 커서가 안 움직여도 판정이 원래 섹션으로 도로 뒤집히고, 그 되돌림이 다시 같은 뒤집힘을 유발해 `setLocalSections`가 끝없이 재호출됐습니다("Maximum update depth exceeded"). `pad-sections-board.tsx`의 충돌 감지를 `pointerWithin`(커서가 실제로 그 영역 안에 있을 때만 인정) 우선 + `closestCenter` 보조로 바꿔 해결했습니다.
- **담벼락·격자 순서 변경**: 두 레이아웃은 SECTIONS처럼 컬럼이 옆으로 나뉘어 있지 않고 섹션별로 이어붙인 하나의 평면 목록이라, 새 `pad-flat-board.tsx`(`FlatDragBoardView`)가 SECTIONS의 다중 컨테이너 `onDragOver` 로직 없이 `arrayMove` 한 번과 `rectSortingStrategy`만으로 재정렬합니다. 드롭한 위치의 이웃 게시물이 속한 섹션으로 자동 재배정되고, 대상 섹션 안에서의 앞뒤 이웃을 찾아 `/api/posts/[postId]/reorder`의 `previousItemId`/`nextItemId`를 계산합니다. 로컬 낙관적 갱신은 `sortLayoutPosts`로 먼저 정렬한 배열을 옮긴 뒤 대상 섹션 게시물에 순번을 다시 매겨야 합니다 — `WallLayout`/`GridLayout`이 렌더링 시점에 `position` 기준으로 다시 정렬하므로, 배열 순서만 바꾸고 `position` 값을 그대로 두면 화면이 바로 원래대로 튕겨 보입니다. Stream·Table·Timeline은 아직 이 작업 대상이 아닙니다(Stream은 항상 최신순으로 강제 정렬해서 별도 설계 판단이 필요하고, Table은 `dragDisabled` 계산까지는 이미 있었지만 감싸는 `DndContext`가 없어 동작하지 않는 죽은 코드였음).

변경한 경로: `components/pad/post-card.tsx`, `components/pad/section-column.tsx`, `components/pad/pad-sections-board.tsx`, `components/pad/pad-flat-board.tsx`(신규), `components/pad/pad-canvas.tsx`, `app/globals.css`
