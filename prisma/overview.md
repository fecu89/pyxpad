# Prisma 개요

`schema.prisma`는 PostgreSQL의 사용자·학교·패드·콘텐츠·알림·감사·인증 보안 모델을 정의하고, `migrations/`는 배포 순서대로 적용할 변경 이력을 보관합니다.

- 학생 소속은 `School → SchoolGrade → SchoolGroup(type=CLASS)` 계층이며 `User.studentNumber`가 반 안의 1~99 출석번호를 저장합니다. `(schoolGroupId, studentNumber)` 복합 고유 인덱스가 같은 반의 번호 중복을 막고, 교사 부서는 학년과 무관한 `SchoolGroup(type=DEPARTMENT)`입니다.
- `School`은 코드·급별·지역·운영 상태를 저장합니다. 대표교사는 별도 학급 관계가 아니라 활성 교사의 `User.isSchoolRepresentative`로 표현하며 전체관리자만 부여·회수합니다.
- 일반 로그인 비밀번호는 `User.passwordHash`의 scrypt 해시만 저장합니다. `mustChangePassword`는 명단 발급·관리자 초기화 뒤 전용 비밀번호 변경이 필요한 상태입니다.
- `AdminAuditLog`에는 학생 명단 발급·비밀번호 초기화·반 이동·대표교사 변경을 포함한 민감한 관리 작업과 사유를 남기되 평문 비밀번호는 넣지 않습니다. 제거 전 기록을 읽을 수 있도록 과거 학적·진급 감사 action enum 값은 보존합니다.
- 스키마 변경 뒤에는 새 SQL 마이그레이션, `prisma validate`, `prisma generate`, 실제 마이그레이션 적용을 함께 수행합니다. 생성 결과는 `generated/prisma/`에 둡니다.
