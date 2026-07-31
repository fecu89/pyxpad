# Overview

이 폴더는 PyxPad 구현에서 `scripts` 영역을 담당합니다.

- `backfill-user-pii.ts`: 기존 사용자 평문 프로필을 AES-GCM 암호문과 이메일 HMAC으로 백필합니다. `--dry-run`으로 DB 변경 없이 검증할 수 있으며 원문 개인정보를 출력하지 않습니다.
- `test-pii-crypto.ts`: 무작위 IV, HMAC 정규화, AAD 격리, 변조 탐지와 키 버전 복호화를 검증합니다. 키나 개인정보 원문은 출력하지 않습니다.
- `verify-security-data.ts`: 평문 컬럼 제거, 활성 전체관리자, 암호화 누락, 학생의 금지된 보드 역할과 시스템 권한 대상을 원문 출력 없이 검증합니다. 특정 제목의 운영 보드 존재 여부에는 의존하지 않으며, 비공개 보드의 소유자·멤버 접근은 `verify-board-access-policy.ts`의 임시 fixture가 검증합니다.
- `verify-admin-http.ts`: 짧은 검증용 전체관리자 세션과 임시 학교·반·부서·회원 11명을 만들어 비로그인 401, 학생 403, 10+1 오프셋 페이지네이션, 일괄 수정, 소속 CRUD·인원수·감사 로그, 회원 소프트 삭제를 실제 HTTP와 DB 양쪽에서 확인한 뒤 모두 정리합니다. 홈 SSR과 학생의 직접 보드 생성 차단도 함께 검사하며 토큰이나 사용자 ID는 출력하지 않습니다.
- `verify-board-access-policy.ts`: 임시 사용자·보드를 생성해 발견 범위, 방문자 권한, 로그인 요구, 멤버십과 소유자 조합 12개를 DAL에서 검증하고 즉시 정리합니다. 과거 `LINK/WRITER/loginRequired=true` 데이터도 익명 읽기는 허용하면서 비멤버의 글·댓글·반응·파일·기존 콘텐츠 수정은 차단하는지, 새 LINK 저장값이 `READER/loginRequired=false`로 정규화되는지도 확인합니다. `server-only` 모듈을 Node에서 검사하므로 `npm run verify:access`의 `react-server` 조건으로 실행합니다.
- `verify-seo-metadata.ts`: 임시 LINK·PUBLIC·PRIVATE·비밀번호 보호 패드를 만들어 LINK/PUBLIC의 제목·설명 노출, LINK noindex, PUBLIC index, 보호 패드의 제목 비노출과 기본 썸네일 전환을 검사합니다. 공개 패드의 OG 입력이 같으면 이미지 URL 버전이 유지되고 표시 값이 바뀌면 버전이 달라지는지도 확인합니다. Pretendard와 logo.svg를 포함한 보드/기본 OG 이미지도 실제 PNG 바이트로 렌더링한 뒤 fixture를 정리합니다. `npm run verify:seo`로 실행합니다.
- `verify-link-preview.ts`: HTML 3MB 상한과 `</head>` 조기 종료, YouTube URL 형식, `javascript:` URL과 `onerror` 속성 탈출 문자열 거부를 네트워크 요청 없이 검증합니다. `npm run verify:link-preview`로 실행합니다.
- `verify-post-pagination.ts`: 공개 임시 보드에 고정 글을 포함한 게시물 35개를 만들고 실제 3001 HTTP API의 30개/5개 cursor 페이지를 조회해 중복·누락·정렬을 검증한 뒤 보드를 삭제합니다.
- `verify-post-participation.ts`: 짧은 검증 세션과 임시 보드로 레이아웃·필드 설정, 오래된 필드 버전 거부, 링크 첨부와 20개 제한, 단일/복수 반응, 댓글 답글·수정, 서버 검색을 실제 HTTP API에서 검사하고 관련 DB 행을 함께 확인한 뒤 보드를 삭제합니다.
- `verify-dashboard-data.ts`: 검증용 공유 보드와 접근 요청 보드를 잠시 생성해 `SHARED`·최근 본·`PENDING` 표시를 확인하고 항상 삭제합니다. 이어 활성 사용자들의 대시보드 DTO에서 소유·공유·전역 관리 관계, 멤버 역할, 최근 본 보드 최대 6개와 내림차순, 접근 요청 상태가 실제 관계 테이블과 일치하는지 검사합니다. `server-only` 데이터 계층이므로 `NODE_OPTIONS=--conditions=react-server npx tsx scripts/verify-dashboard-data.ts`로 실행합니다.
- `verify-board-reuse.ts`: 전용 원본 보드·게시물·로컬 파일을 만들어 선택 복제, 비공개 기본값, 작성자 치환, 첨부 파일 복사, 멤버 정책, 템플릿, 즐겨찾기, 사용자 폴더와 `SAVED` 관계를 검사합니다. 원본 파일이 없을 때 복제본 DB·파일이 남지 않는 실패 복구도 확인하고 모든 fixture를 정리합니다. `NODE_OPTIONS=--conditions=react-server npx tsx scripts/verify-board-reuse.ts`로 실행합니다.
- `rotate-user-pii.ts`: 암호문에 기록된 이전 키로 복호화한 뒤 현재 활성 키로 사용자 프로필을 재암호화합니다. 먼저 `--dry-run`으로 전체 복호화·재암호화 검증을 수행합니다. HMAC 검색 키 회전은 이 스크립트 범위가 아닙니다.
