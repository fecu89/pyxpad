# Overview

이 폴더는 PyxPad 구현에서 `app/api/boards` 영역을 담당합니다.

`POST /api/boards`는 학생을 포함한 활성 사용자가 새 패드를 만들 수 있게 하고, 입력 스키마를 통과한 뒤 소유자
멤버십과 함께 빈 패드(섹션 없음)를 생성합니다. 학생은 보관된 패드까지 포함해 최대 10개를 소유할 수 있으며,
사용자별 PostgreSQL advisory transaction lock 안에서 개수를 확인해 동시 생성으로 한도를 넘지 못하게 합니다. 복제와
관리자 소유권 이전도 같은 정책을 사용합니다. 섹션은 사용자가 직접 추가합니다. `discoveryScope=LINK`
요청은 클라이언트가 다른 방문자 권한이나 로그인 요구 값을 보내더라도 `visitorPermission=READER`,
`loginRequired=false`로 정규화합니다.
