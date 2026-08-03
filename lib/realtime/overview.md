# 실시간 처리 개요

PyxPad의 사용자 데이터 업로드는 WebSocket이 아니라 일반 HTTP multipart 요청입니다. 보드 변경 알림은 단방향 SSE(`EventSource`)를 사용하고, 개발 화면의 `/_next/webpack-hmr` WebSocket은 Next.js HMR 전용입니다.

좋아요와 댓글 이벤트는 정확한 카운트만 전달해 클라이언트 상태를 부분 갱신합니다. 게시물·섹션·설정처럼 구조가 바뀌는 이벤트만 800ms 단위로 합쳐 서버 컴포넌트 데이터를 새로고침하며, 요청을 보낸 본인의 중복 이벤트는 무시합니다. SSE는 20초 heartbeat와 프록시 버퍼링 방지 헤더를 사용합니다.

현재 이벤트 버스는 프로세스 내부 `EventEmitter`이므로 로컬 업로드 디스크와 마찬가지로 단일 앱 인스턴스를 전제로 합니다. 100~200개의 SSE 연결은 작은 알림 스트림만 유지하며 Prisma 연결을 점유하지 않습니다. 여러 앱 인스턴스로 확장할 때는 PostgreSQL LISTEN/NOTIFY 또는 Redis pub/sub 같은 공유 이벤트 계층이 필요합니다.

`sse-stream.ts`는 두 SSE 라우트가 공유하는 스트림 골격이며, 직접 `ReadableStream`을 다룰 때 문제가 됐던 세 가지를 한곳에서 막습니다.

- **enqueue 예외 격리** — `publishBoardEvent`는 `EventEmitter`의 동기 `emit`이라, 끊어진 연결의 컨트롤러에 `enqueue`하면 그 `TypeError`가 발행자(=쓰기 API Route Handler)까지 그대로 올라가 DB 저장이 끝난 요청을 400으로 실패시켰습니다. heartbeat의 `setInterval` 콜백에서 같은 일이 나면 잡아줄 곳이 없어 `uncaughtException`이 됩니다. 모든 쓰기를 감싸 실패 시 조용히 연결만 정리합니다.
- **연결 수 상한** — LINK/PUBLIC 보드의 SSE는 비로그인도 붙을 수 있어 상한이 없으면 연결마다 리스너 + 20초 타이머 + 스트림이 그대로 쌓입니다. 로그인 사용자는 보드당 6개, 익명 버킷은 60개, 프로세스 전체는 `MAX_SSE_CONNECTIONS`(기본 2000)로 제한하고 초과분은 429로 거절합니다.
- **백프레셔** — 응답을 읽지 않는 클라이언트에 대해 `controller.desiredSize`가 일정 이하로 내려가면 연결을 끊습니다. 브라우저 `EventSource`가 자동 재연결하고 `usePadEvents`가 놓친 변경을 활동 로그로 보충하므로 데이터 유실로 이어지지 않습니다.

`user-events.ts`는 `board-events.ts`와 같은 구조의 사용자별(개인 알림) SSE 채널입니다(`user:{userId}` 채널명). `app/api/notifications/events`가 이 채널을 구독해 알림 벨에 실시간으로 새 알림을 알립니다.

`board-viewers.ts`는 "지금 이 보드의 SSE에 연결되어 있는 사용자" 메모리 레지스트리입니다. `app/api/boards/[boardId]/events`가 연결·해제 시점에 등록·해제하고, `lib/notifications/create.ts`가 알림을 만들기 전에 이걸 확인해 지금 그 보드를 보고 있는 사용자에게는 중복 알림을 만들지 않습니다. 사용자별 **연결 수를 세는 참조 카운트**입니다 — `Set<userId>`로 두면 같은 사용자가 탭 두 개를 열었을 때 항목이 하나만 생기고, 탭 하나를 닫는 순간 아직 보고 있는 다른 탭까지 "안 보는 중"으로 잡혔습니다. 이벤트 버스와 마찬가지로 프로세스 내부 상태라 단일 인스턴스 전제입니다.

`BoardEvent.activityId`는 `lib/board/activity.ts`의 `recordBoardActivity`가 만든 `BoardActivity.id`를 실어 보내는 단조 증가 활동 ID입니다(post/comment/member/access 이벤트에서 채움). `use-pad-events.ts`는 마지막으로 본 이벤트 시각(`emittedAt`)을 기억해 두었다가, 브라우저의 `EventSource` 자동 재연결로 "ready"가 다시 오면 `/api/boards/[boardId]/activity?since=...`로 그 사이 놓친 활동이 있었는지 확인해 있으면 한 번 새로고침합니다(padupgrade.md 4.4). 구조 이벤트마다 서버 컴포넌트를 통째로 새로고침하던 것 중 `post.deleted`는 `pad-canvas.tsx`에서 로컬 상태로 직접 지워 전체 재조회를 건너뛰고, 댓글·반응처럼 카운트만 바뀌는 이벤트와 800ms 단위 병합은 기존에도 이미 그렇게 동작하고 있었습니다. `post.created`/`post.updated`/섹션·보드 설정 변경은 여전히 전체 새로고침 경로를 씁니다(다음 개선 과제).
