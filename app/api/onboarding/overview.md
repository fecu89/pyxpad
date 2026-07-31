# 최초 가입 정보 API

`POST /api/onboarding`은 로그인한 신규 사용자의 닉네임, 가입 유형, 학교, 반/부서를 처리합니다.

- 동일 출처 요청과 활성 세션을 요구합니다.
- 학생은 `CLASS`, 교사 신청자는 `DEPARTMENT`만 선택할 수 있습니다.
- 그룹이 선택한 학교에 실제로 속하는지 DB에서 다시 확인합니다.
- 표시 이름은 암호화해 저장하며 이메일·역할은 요청 본문으로 받지 않습니다.
- 동시 요청은 `onboardingCompletedAt IS NULL` 조건의 `updateMany`로 한 요청만 성공시킵니다.
- 학생은 즉시 `onboardingCompletedAt`을 채웁니다. 교사 신청자는 실제 역할을 `STUDENT`로 유지하고 `TeacherApprovalRequest`만 만들며, 승인 전 일반 페이지와 API 접근이 차단됩니다.
- 교사 신청 시 해당 학교 대표교사와 전체관리자에게 알림을 만듭니다.
