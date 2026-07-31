# 실시간 처리 개요

PyxPad의 사용자 데이터 업로드는 WebSocket이 아니라 일반 HTTP multipart 요청입니다. 보드 변경 알림은 단방향 SSE(`EventSource`)를 사용하고, 개발 화면의 `/_next/webpack-hmr` WebSocket은 Next.js HMR 전용입니다.

좋아요와 댓글 이벤트는 정확한 카운트만 전달해 클라이언트 상태를 부분 갱신합니다. 게시물·섹션·설정처럼 구조가 바뀌는 이벤트만 800ms 단위로 합쳐 서버 컴포넌트 데이터를 새로고침하며, 요청을 보낸 본인의 중복 이벤트는 무시합니다. SSE는 20초 heartbeat와 프록시 버퍼링 방지 헤더를 사용합니다.

현재 이벤트 버스는 프로세스 내부 `EventEmitter`이므로 로컬 업로드 디스크와 마찬가지로 단일 앱 인스턴스를 전제로 합니다. 100~200개의 SSE 연결은 작은 알림 스트림만 유지하며 Prisma 연결을 점유하지 않습니다. 여러 앱 인스턴스로 확장할 때는 PostgreSQL LISTEN/NOTIFY 또는 Redis pub/sub 같은 공유 이벤트 계층이 필요합니다.

`user-events.ts`는 `board-events.ts`와 같은 구조의 사용자별(개인 알림) SSE 채널입니다(`user:{userId}` 채널명). `app/api/notifications/events`가 이 채널을 구독해 알림 벨에 실시간으로 새 알림을 알립니다.

`board-viewers.ts`는 "지금 이 보드의 SSE에 연결되어 있는 사용자" 메모리 레지스트리입니다. `app/api/boards/[boardId]/events`가 연결·해제 시점에 등록·해제하고, `lib/notifications/create.ts`가 알림을 만들기 전에 이걸 확인해 지금 그 보드를 보고 있는 사용자에게는 중복 알림을 만들지 않습니다. 이벤트 버스와 마찬가지로 프로세스 내부 상태라 단일 인스턴스 전제입니다.

`BoardEvent.activityId`는 `lib/board/activity.ts`의 `recordBoardActivity`가 만든 `BoardActivity.id`를 실어 보내는 단조 증가 활동 ID입니다(post/comment/member/access 이벤트에서 채움). `use-pad-events.ts`는 마지막으로 본 이벤트 시각(`emittedAt`)을 기억해 두었다가, 브라우저의 `EventSource` 자동 재연결로 "ready"가 다시 오면 `/api/boards/[boardId]/activity?since=...`로 그 사이 놓친 활동이 있었는지 확인해 있으면 한 번 새로고침합니다(padupgrade.md 4.4). 구조 이벤트마다 서버 컴포넌트를 통째로 새로고침하던 것 중 `post.deleted`는 `pad-canvas.tsx`에서 로컬 상태로 직접 지워 전체 재조회를 건너뛰고, 댓글·반응처럼 카운트만 바뀌는 이벤트와 800ms 단위 병합은 기존에도 이미 그렇게 동작하고 있었습니다. `post.created`/`post.updated`/섹션·보드 설정 변경은 여전히 전체 새로고침 경로를 씁니다(다음 개선 과제).
