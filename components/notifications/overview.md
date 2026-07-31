# 알림 컴포넌트 개요

`notification-bell.tsx`는 홈 네비게이션과 보드 상단 네비게이션에서 공용으로 쓰는 알림 벨입니다.

- `GET /api/notifications`로 최근 알림·안 읽음 개수를 불러오고, `GET /api/notifications/events`(SSE, `lib/realtime/user-events.ts`)로 새 알림이 생기면 목록을 다시 불러옵니다.
- 알림을 클릭하면 `PATCH /api/notifications/[id]`로 읽음 처리합니다. 게시물이 연결된 알림은 `/b/{slug}/posts/{postId}`로, 댓글 ID까지 있는 댓글·멘션 알림은 같은 경로의 `#comment-{commentId}`로 이동해 해당 댓글을 바로 강조합니다. 게시물 없이 보드만 연결된 알림은 보드로 이동합니다. "모두 읽음"은 `POST /api/notifications/read-all`을 호출합니다.
- 알림은 `lib/notifications/create.ts`의 `createNotification`이 댓글·반응·멤버 참여·접근 요청 라우트에서 생성하며, 알림을 받을 사용자가 그 보드의 실시간 스트림(SSE)에 지금 연결되어 있으면(=지금 그 보드를 보고 있으면) 중복 알림을 만들지 않습니다(`lib/realtime/board-viewers.ts`).
- 보드 내부의 전체 활동 로그(누가 무엇을 했는지의 타임라인)는 이 벨과 별개로 `BoardActivity`/보드의 "활동" 패널이 담당합니다. 개인 알림은 "나에게 온" 항목(내 글에 댓글·반응, 댓글에서 나를 `@` 언급, 내가 관리하는 보드에 새 멤버·접근 요청, 내 접근 요청 결과)만 다룹니다.
