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
