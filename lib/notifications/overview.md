# 알림 개요

`create.ts`의 `createNotification`은 특정 사용자를 대상으로 하는 개인 알림(`Notification` 테이블) 한 건을 만들고, `lib/realtime/user-events.ts`로 실시간 신호를 보냅니다.

- 알림을 만드는 사람(`actorId`)이 받는 사람(`userId`)과 같으면 만들지 않습니다(자기 행동에 스스로 알림받지 않음).
- 받는 사람이 지금 그 보드의 SSE에 연결되어 있으면(`lib/realtime/board-viewers.ts`로 확인) 만들지 않습니다 — 이미 실시간으로 보고 있는 화면에 굳이 또 알리지 않기 위해서입니다.
- 트리거: 내 글에 댓글(`POST_COMMENTED`), 내 글에 반응(`REACTION_ON_POST`, 새로 좋아요를 누른 경우만), 내가 관리하는 보드에 새 멤버(`MEMBER_JOINED`), 내가 관리하는 보드에 접근 요청 도착(`ACCESS_REQUEST_RECEIVED`), 내 접근 요청이 승인·거절(`ACCESS_REQUEST_APPROVED`/`ACCESS_REQUEST_REJECTED`), 교사 가입 신청과 승인·반려(`TEACHER_APPROVAL_*`).
- 보드 전체의 활동 타임라인(누가 무엇을 했는지)은 이 알림과 별개로 `lib/board/activity.ts`의 `BoardActivity`가 담당합니다. 알림은 "나에게 온" 항목만 다루고, 활동 로그는 보드에 접근 권한이 있는 모두에게 보이는 공용 기록입니다.
