# Prisma 마이그레이션 개요

이 폴더는 PyxPad PostgreSQL 스키마 변경 이력을 순서대로 보관합니다.

- 초기 마이그레이션: 보드·글·첨부·댓글·반응·멤버십 초기 모델
- `20260726000000_add_board_access_requests`: 비멤버의 접근 요청과 승인 상태 모델
- `20260726010000_add_user_roles_permissions_pii`: 사용자 역할·상태·세션 버전, 시스템 권한, 감사 로그와 암호화 개인정보 컬럼
- `20260726020000_drop_plain_user_pii`: 백필 검증 후 사용자 평문 이메일·이름·프로필 이미지 컬럼 제거
- `20260726030000_add_notifications_invite_links_deleted_status`: 인앱 알림, 초대 링크, 삭제 사용자 상태
- `20260726040000_add_board_activity_follow_hashed_invite`: 활동·팔로우와 해시 기반 초대 링크
- `20260726050000_add_discovery_scope_visitor_permission`: 발견 범위·방문자 권한·로그인 및 비밀번호 설정
- `20260726060000_drop_board_visibility`: 백필을 마친 기존 공개 범위 제거
- `20260727000000_add_post_status_moderation_board_state`: 게시물 승인 상태·승인 방식·보드 동결 상태
- `20260727010000_add_post_moderation_notification_types`: 승인 활동과 결과 알림
- `20260727020000_add_board_freeze_at`: 예약 동결 시각
- `20260727030000_add_post_participation_and_board_design`: 게시물 필드·댓글 멘션/첨부·반응·레이아웃/디자인 설정
- `20260727040000_add_board_reuse_dashboard_folders`: 보드 템플릿 표시, 개인 즐겨찾기와 사용자별 다중 보드 폴더
- `20260728000000_add_board_visits`: 알림 팔로우와 분리된 사용자별 최근 방문 시각
- `20260728010000_add_school_groups`: 학교와 역할별 반/부서 관계, 청학고등학교·3학년 5반·3학년부 초기 데이터, 조직 변경/회원 삭제 감사 액션
- `20260728020000_add_user_auditlog_indexes`: 관리자 사용자 목록과 감사 로그 조회 인덱스
- `20260729000000_add_school_audit_actions`: 학교·반/부서 CRUD 감사 액션 6종
- `20260730000000_add_user_onboarding`: 신규 카카오 계정의 가입 정보 완료 시각. 기존 사용자는 마이그레이션에서 완료 상태로 백필
- `20260730010000_add_teacher_approval_requests`: 학교별 교사 가입 신청·승인·반려 상태와 감사·알림 유형
- `20260801000000_add_user_password_credentials`: 카카오 계정과 함께 쓸 수 있는 일반 이메일 로그인용 nullable scrypt 해시
- `20260801010000_add_auth_security_nickname_uniqueness`: 닉네임 HMAC 고유 키, DB 공유형 인증 제한과 HMAC 인증 이벤트 집계
- `20260801020000_add_student_roster_password_reset_grade_hierarchy`: 학교 → 학년 → 반 계층, 학생 번호, 최초 비밀번호 변경 상태, 학생 명단 발급·관리자 비밀번호 초기화 감사 액션. 기존 `N학년 M반` 이름은 자동 백필
- `20260802000000_add_student_number_uniqueness`: 같은 학급의 출석번호 중복을 막는 `(schoolGroupId, studentNumber)` 복합 고유 인덱스. 번호 미지정 `NULL`은 여러 명 허용
- `20260802010000_add_academic_management`: 학교 코드·급별·지역·학년도·운영 상태, 학급 별칭·정원·담임, 학생 학적 상태와 학적 변경·반 이동·진급 감사 액션. 기존 삭제되지 않은 학생은 `ENROLLED`로 백필
- `20260802020000_remove_unneeded_academic_features`: 실제 운영 범위에 필요하지 않은 학생 학적 상태 enum/컬럼, 학급 별칭·정원·담임 관계, 학교 학년도 컬럼 제거. 과거 감사 로그 해석을 위해 기존 감사 action enum 값은 유지
