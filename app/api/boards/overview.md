# Overview

이 폴더는 PyxPad 구현에서 `app/api/boards` 영역을 담당합니다.

`POST /api/boards`는 교사 이상만 새 패드를 만들 수 있게 하고, 입력 스키마를 통과한 뒤 소유자
멤버십과 기본 섹션을 함께 생성합니다. `discoveryScope=LINK` 요청은 클라이언트가 다른 방문자 권한이나
로그인 요구 값을 보내더라도 `visitorPermission=READER`, `loginRequired=false`로 정규화합니다.
