# Overview

이 폴더는 PyxPad 구현에서 `lib` 영역을 담당합니다.

- `auth/`: NextAuth 세션과 중앙 인증·인가
- `board/`: 보드 접근 계산과 조회
- `files/`: 업로드 검증, 파일명, 경로, 이미지 변환과 정리
- `security/`: 개인정보 암호화와 검색용 HMAC
- `users/`: 암호화 사용자 레코드를 목적별 최소 DTO로 변환
- `http.ts`: 모든 Route Handler가 공유하는 `apiError()`(에러 응답 통일)와 `assertSameOrigin()`(CSRF 방지 same-origin 검사)

## `apiError()` 내부 에러 메시지 노출 방지 (2026-07-29 보안 점검)

기존에는 `AuthenticationError`/`AuthorizationError`가 아닌 에러는 전부 `error.message`를 그대로 응답에 실었습니다. 라우트가 의도적으로 던지는 `new Error("한글 사용자 메시지")`나 `AttachmentLimitError` 같은 커스텀 에러는 그게 맞지만, 체크가 `instanceof Error`뿐이라 예상 못 한 Prisma 내부 에러(제약조건·필드명 노출)나 버그로 난 `TypeError` 등의 메시지까지 그대로 새어나갔습니다.

`isSafeToExposeMessage()`를 추가해 생성자 이름이 `PrismaClient`로 시작하거나 `TypeError`/`RangeError`/`ReferenceError`/`SyntaxError`/`URIError`/`EvalError`인 경우에만 라우트가 넘긴 `fallback` 문자열로 바꿔치기합니다. 그 외(코드베이스 전체가 실제로 쓰는 의도적인 에러 메시지 패턴)는 그대로 통과하므로, `apiError`를 쓰는 약 150개 라우트 어디도 고칠 필요 없이 이 한 곳만 바꿔서 적용됩니다. `console.error(error)`는 그대로 남아있어 서버 로그에는 전체 에러가 계속 기록됩니다.

변경한 경로: `lib/http.ts`
