# Overview

padupgrade.md 8.3 "게시물별 슬라이드 발표 모드"입니다. `page.tsx`는 인쇄 페이지와 같은 방식으로 `getBoardPageData`로 읽기 권한만 검사합니다.

`getBoardPageData`가 SSR용으로 담아주는 `board.sections[].posts`는 섹션당 최대 `POST_PAGE_SIZE`(30)개로 잘려 있어(4.1 페이지네이션), 발표 모드에는 그대로 쓰지 않습니다. 대신 `lib/exports/data.ts`의 `gatherBoardExportData(board.id, "PUBLISHED")`를 다시 호출해 섹션 순서·게시물 순서를 유지한 채 게시된 글 전체를 가져온 뒤, `components/pad/export/pad-presentation.tsx`(Client Component)에 넘겨 한 장씩 넘기는 슬라이드로 보여줍니다. 좌우 화살표 키와 이전/다음 버튼으로 이동하며, 새로고침하면 처음부터 다시 시작합니다(진행 상태 저장은 이번 범위에 없음).
