/* ============================================================
   PyxPad 데모 — 시드 더미데이터
   prisma/seed.ts의 데모 계정(김하늘 선생님 / 이로운 / @pyxpad.demo)을 기준으로
   화면을 채울 만큼만 늘렸습니다. 실제 가입자 정보는 하나도 들어 있지 않습니다.
   ============================================================ */

const DAY = 86400000;
// 고정 기준 시각 — 매 실행마다 날짜가 달라지면 스크린샷·비교가 흔들립니다.
const T0 = new Date('2026-08-03T09:00:00+09:00').getTime();
const ago = (d, h = 0) => new Date(T0 - d * DAY - h * 3600000).toISOString();

window.PYXPAD_SEED = {
  version: 4,

  schools: [
    { id: 'sc1', name: '청학고등학교', groups: ['1학년부', '2학년부', '3학년부', '진로진학부'] },
    { id: 'sc2', name: '한빛중학교', groups: ['1학년부', '2학년부', '과학부'] },
  ],

  users: [
    { id: 'u1', name: '김하늘 선생님', initial: '김', tint: 'mint', loginId: 'teacher@pyxpad.demo',
      role: 'TEACHER', schoolId: 'sc1', group: '3학년부', status: 'ACTIVE', joinedAt: ago(96) },
    { id: 'u2', name: '이로운', initial: '이', tint: 'sky', loginId: 'student@pyxpad.demo',
      role: 'STUDENT', schoolId: 'sc1', group: '3학년부', status: 'ACTIVE', joinedAt: ago(94) },
    { id: 'u3', name: '힘센캥거루', initial: '힘', tint: 'violet', loginId: 'admin@pyxpad.demo',
      role: 'SUPER_ADMIN', schoolId: 'sc1', group: '진로진학부', status: 'ACTIVE', joinedAt: ago(120) },
    { id: 'u4', name: '박서준', initial: '박', tint: 'coral', loginId: 'student2@pyxpad.demo',
      role: 'STUDENT', schoolId: 'sc1', group: '3학년부', status: 'ACTIVE', joinedAt: ago(60) },
    { id: 'u5', name: '최다인', initial: '최', tint: 'sun', loginId: 'student3@pyxpad.demo',
      role: 'STUDENT', schoolId: 'sc1', group: '3학년부', status: 'ACTIVE', joinedAt: ago(58) },
    { id: 'u6', name: '정우진', initial: '정', tint: 'rose', loginId: 'student4@pyxpad.demo',
      role: 'STUDENT', schoolId: 'sc1', group: '2학년부', status: 'SUSPENDED', joinedAt: ago(40) },
    { id: 'u7', name: '한지음 선생님', initial: '한', tint: 'violet', loginId: 'teacher2@pyxpad.demo',
      role: 'TEACHER', schoolId: 'sc2', group: '과학부', status: 'ACTIVE', joinedAt: ago(30) },
  ],

  // 교사 가입 승인 대기열
  approvals: [
    { id: 'ap1', name: '오세라 선생님', initial: '오', tint: 'coral', loginId: 'pending1@pyxpad.demo',
      schoolId: 'sc1', group: '1학년부', requestedAt: ago(2, 4) },
    { id: 'ap2', name: '류민호 선생님', initial: '류', tint: 'sky', loginId: 'pending2@pyxpad.demo',
      schoolId: 'sc2', group: '2학년부', requestedAt: ago(0, 6) },
  ],

  folders: [
    { id: 'f1', name: '3학년 진로' },
    { id: 'f2', name: '수업 자료' },
  ],

  boards: [
    {
      id: 'b1', slug: 'career-explore', title: '우리 반 진로 탐색 패드',
      intro: '관심 있는 직업을 찾아보고 서로의 생각에 응답해요.',
      ownerId: 'u1', scope: 'PUBLIC', coverTint: 'sky', layout: 'columns',
      cardSize: 'md', frozen: false, archived: false, favorite: true, folderId: 'f1',
      allowPost: true, allowUpload: true, allowComment: true, allowReaction: true,
      requireApproval: false, createdAt: ago(8), updatedAt: ago(0, 3),
      members: [
        { userId: 'u1', role: 'OWNER' }, { userId: 'u2', role: 'MEMBER' },
        { userId: 'u4', role: 'MEMBER' }, { userId: 'u5', role: 'EDITOR' },
      ],
    },
    {
      id: 'b2', slug: 'exam-after', title: '우리 반 수능 끝나고 할 것',
      intro: '수능 끝나고 하고 싶은 일을 자유롭게 붙여주세요.',
      ownerId: 'u1', scope: 'SCHOOL', coverTint: 'sun', layout: 'grid',
      cardSize: 'md', frozen: false, archived: false, favorite: false, folderId: null,
      allowPost: true, allowUpload: true, allowComment: true, allowReaction: true,
      requireApproval: false, createdAt: ago(14), updatedAt: ago(2, 5),
      members: [{ userId: 'u1', role: 'OWNER' }, { userId: 'u2', role: 'MEMBER' }, { userId: 'u4', role: 'MEMBER' }],
    },
    {
      id: 'b3', slug: 'book-club', title: '한 학기 한 권 읽기',
      intro: '읽은 책과 인상 깊은 문장을 모읍니다.',
      ownerId: 'u1', scope: 'SCHOOL', coverTint: 'mint', layout: 'columns',
      cardSize: 'md', frozen: true, archived: false, favorite: true, folderId: 'f2',
      allowPost: true, allowUpload: false, allowComment: true, allowReaction: true,
      requireApproval: true, createdAt: ago(26), updatedAt: ago(6),
      members: [{ userId: 'u1', role: 'OWNER' }, { userId: 'u5', role: 'MEMBER' }],
    },
    {
      id: 'b4', slug: 'science-lab', title: '과학 실험 기록장',
      intro: '실험 과정을 사진과 함께 남겨요.',
      ownerId: 'u7', scope: 'SCHOOL', coverTint: 'violet', layout: 'grid',
      cardSize: 'md', frozen: false, archived: false, favorite: false, folderId: null,
      allowPost: true, allowUpload: true, allowComment: true, allowReaction: true,
      requireApproval: false, createdAt: ago(20), updatedAt: ago(9),
      members: [{ userId: 'u7', role: 'OWNER' }, { userId: 'u1', role: 'MEMBER' }],
    },
    {
      id: 'b5', slug: 'old-debate', title: '작년 토론 수업 아카이브',
      intro: '',
      ownerId: 'u1', scope: 'PRIVATE', coverTint: 'rose', layout: 'feed',
      cardSize: 'md', frozen: false, archived: true, favorite: false, folderId: null,
      allowPost: true, allowUpload: true, allowComment: true, allowReaction: true,
      requireApproval: false, createdAt: ago(200), updatedAt: ago(120),
      members: [{ userId: 'u1', role: 'OWNER' }],
    },
  ],

  sections: [
    { id: 's1', boardId: 'b1', title: '나를 소개해요', guide: '좋아하는 것과 잘하는 것을 적어주세요.', order: 0 },
    { id: 's2', boardId: 'b1', title: '관심 직업 탐구', guide: '직업 하나를 골라 하는 일을 조사해봅시다.', order: 1 },
    { id: 's3', boardId: 'b1', title: '오늘의 작은 실천', guide: '', order: 2 },

    { id: 's4', boardId: 'b2', title: '가고 싶은 곳', guide: '', order: 0 },
    { id: 's5', boardId: 'b2', title: '배우고 싶은 것', guide: '', order: 1 },

    { id: 's6', boardId: 'b3', title: '이번 달 읽은 책', guide: '제목과 지은이를 함께 적어주세요.', order: 0 },
    { id: 's7', boardId: 'b3', title: '밑줄 그은 문장', guide: '', order: 1 },

    { id: 's8', boardId: 'b4', title: '가설', guide: '', order: 0 },
    { id: 's9', boardId: 'b4', title: '관찰 기록', guide: '', order: 1 },

    { id: 's10', boardId: 'b5', title: '토론 주제', guide: '', order: 0 },
  ],

  posts: [
    { id: 'p1', boardId: 'b1', sectionId: 's1', authorId: 'u2', order: 0, pinned: false, tint: 'none',
      title: '그림으로 이야기하는 걸 좋아해요',
      body: '관찰한 것을 그림으로 기록하는 시간이 가장 즐거워요. 언젠가 사람들에게 힘을 주는 **일러스트레이터**가 되고 싶어요.',
      thumbTint: null, links: [], createdAt: ago(4, 2), reactions: { '👍': ['u1', 'u4'], '❤️': ['u5'] } },

    { id: 'p2', boardId: 'b1', sectionId: 's1', authorId: 'u4', order: 1, pinned: false, tint: 'sky',
      title: '숫자로 세상을 보는 게 재밌어요',
      body: '통계 자료를 정리해서 규칙을 찾아내는 게 좋아요. 데이터로 문제를 푸는 일을 해보고 싶습니다.',
      thumbTint: null, links: [], createdAt: ago(3, 6), reactions: { '👍': ['u1'] } },

    { id: 'p3', boardId: 'b1', sectionId: 's2', authorId: 'u1', order: 0, pinned: true, tint: 'sun',
      title: '환경 데이터 분석가',
      body: '기후와 환경 데이터를 분석해 더 나은 선택을 돕는 직업입니다. 수학적 사고, 데이터 시각화, 환경에 대한 관심이 필요해요.',
      thumbTint: null,
      links: [{ url: 'https://www.youtube.com/watch?v=demo', title: '환경 데이터 분석가는 무슨 일을 하나요', site: 'YouTube' }],
      createdAt: ago(5), reactions: { '👍': ['u2', 'u4', 'u5'], '🎉': ['u2'] } },

    { id: 'p4', boardId: 'b1', sectionId: 's2', authorId: 'u2', order: 1, pinned: false, tint: 'mint',
      title: '반려동물 행동 전문가',
      body: '동물의 행동을 관찰하고 보호자와 반려동물이 더 행복하게 지내도록 도와요. 관찰 기록을 꾸준히 남기는 습관이 중요하대요.',
      thumbTint: null, links: [], createdAt: ago(3, 1), reactions: { '❤️': ['u5', 'u1'] } },

    { id: 'p5', boardId: 'b1', sectionId: 's2', authorId: 'u5', order: 2, pinned: false, tint: 'none',
      title: '기록 보관 담당자(아키비스트)',
      body: '자료를 오래 남기려면 어떻게 정리해야 하는지 배우는 일이래요. 도서관에서 하는 일과 비슷하지만 더 넓어요.',
      thumbTint: 'violet', links: [], createdAt: ago(2, 4), reactions: {} },

    { id: 'p6', boardId: 'b1', sectionId: 's3', authorId: 'u1', order: 0, pinned: false, tint: 'rose',
      title: '이번 주 도전',
      body: '관심 있는 직업 하나를 골라 실제로 일하는 분의 인터뷰를 찾아보세요. 인상 깊은 문장을 댓글로 남겨주세요!',
      thumbTint: null, links: [], createdAt: ago(2), reactions: { '👍': ['u2', 'u4'] } },

    { id: 'p7', boardId: 'b2', sectionId: 's4', authorId: 'u2', order: 0, pinned: false, tint: 'sky',
      title: '기차 타고 바다 보러 가기', body: '정동진 일출을 꼭 보고 싶어요.',
      thumbTint: null, links: [], createdAt: ago(6), reactions: { '❤️': ['u4'] } },
    { id: 'p8', boardId: 'b2', sectionId: 's5', authorId: 'u4', order: 0, pinned: false, tint: 'none',
      title: '운전면허 따기', body: '수능 끝나자마자 학원 등록할 거예요.',
      thumbTint: null, links: [], createdAt: ago(5, 3), reactions: {} },
    { id: 'p9', boardId: 'b2', sectionId: 's5', authorId: 'u1', order: 1, pinned: false, tint: 'mint',
      title: '악기 하나 배우기', body: '기타든 우쿨렐레든 코드 세 개만 잡을 수 있으면 좋겠어요.',
      thumbTint: null, links: [], createdAt: ago(4), reactions: { '🎉': ['u2'] } },

    { id: 'p10', boardId: 'b3', sectionId: 's6', authorId: 'u5', order: 0, pinned: false, tint: 'none',
      title: '『아무튼, 계속』 — 김교석', body: '계속하는 힘에 대한 이야기예요.',
      thumbTint: null, links: [], createdAt: ago(10), reactions: { '👍': ['u1'] } },
    { id: 'p11', boardId: 'b3', sectionId: 's7', authorId: 'u1', order: 0, pinned: false, tint: 'sun',
      title: '밑줄', body: '"버티는 것과 계속하는 것은 다르다."',
      thumbTint: null, links: [], createdAt: ago(9), reactions: {} },

    { id: 'p12', boardId: 'b4', sectionId: 's8', authorId: 'u7', order: 0, pinned: false, tint: 'none',
      title: '소금물의 농도와 부력', body: '농도가 높아지면 달걀이 더 빨리 뜰 것이다.',
      thumbTint: null, links: [], createdAt: ago(12), reactions: {} },
    { id: 'p13', boardId: 'b4', sectionId: 's9', authorId: 'u1', order: 0, pinned: false, tint: 'sky',
      title: '3차 시도 기록', body: '소금 40g에서 완전히 떠올랐습니다. 사진 첨부.',
      thumbTint: 'sky', links: [], createdAt: ago(11), reactions: { '👍': ['u7'] } },

    { id: 'p14', boardId: 'b5', sectionId: 's10', authorId: 'u1', order: 0, pinned: false, tint: 'none',
      title: '교복 자율화에 대하여', body: '작년 자료입니다.',
      thumbTint: null, links: [], createdAt: ago(150), reactions: {} },
  ],

  comments: [
    { id: 'c1', postId: 'p3', authorId: 'u2', parentId: null, body: '데이터 시각화는 어떤 프로그램으로 배우면 좋을까요?', createdAt: ago(4, 8) },
    { id: 'c2', postId: 'p3', authorId: 'u1', parentId: 'c1', body: '@이로운 스프레드시트부터 시작해도 충분해요. 익숙해지면 파이썬으로 넘어가봅시다.', createdAt: ago(4, 5) },
    { id: 'c3', postId: 'p3', authorId: 'u4', parentId: null, body: '기후 관련 공개 데이터 링크 있으면 공유 부탁드려요!', createdAt: ago(3, 2) },
    { id: 'c4', postId: 'p1', authorId: 'u5', parentId: null, body: '그림 실력 진짜 좋아요. 다음에 같이 그려요.', createdAt: ago(3, 9) },
    { id: 'c5', postId: 'p4', authorId: 'u1', parentId: null, body: '관찰 기록을 꾸준히 남기는 게 핵심이라는 점, 잘 찾았어요.', createdAt: ago(2, 20) },
    { id: 'c6', postId: 'p6', authorId: 'u4', parentId: null, body: '"좋아하는 일을 오래 하려면 체력이 먼저다" — 인상 깊었어요.', createdAt: ago(1, 3) },
  ],

  auditLogs: [
    { id: 'l1', actorId: 'u3', action: '교사 승인', target: '한지음 선생님', reason: '재직증명서 확인', at: ago(30) },
    { id: 'l2', actorId: 'u3', action: '계정 정지', target: '정우진', reason: '반복 신고 접수 — 담임 확인 후 조치', at: ago(12) },
    { id: 'l3', actorId: 'u3', action: '소속 변경', target: '최다인 · 2학년부 → 3학년부', reason: '학년 진급', at: ago(7) },
    { id: 'l4', actorId: 'u1', action: '패드 동결', target: '한 학기 한 권 읽기', reason: '학기 마감', at: ago(6) },
    { id: 'l5', actorId: 'u3', action: '비밀번호 초기화', target: '박서준', reason: '본인 요청 — 담임 통해 확인', at: ago(3) },
    { id: 'l6', actorId: 'u3', action: '권한 부여', target: '김하늘 선생님 · 학교 대표교사', reason: '3학년부 대표 지정', at: ago(1) },
  ],

  notifications: [
    { id: 'n1', text: '이로운님이 「환경 데이터 분석가」에 댓글을 남겼어요.', at: ago(0, 5), read: false },
    { id: 'n2', text: '박서준님이 「우리 반 진로 탐색 패드」에 참여했어요.', at: ago(1, 2), read: false },
    { id: 'n3', text: '최다인님이 회원님의 글에 반응했어요.', at: ago(2, 6), read: true },
  ],
};
