/* ============================================================
   PyxPad 데모 — 스토어 · 라우터 · 화면
   백엔드가 없으므로 모든 변경은 localStorage에 저장됩니다.
   실서비스의 서버 권한 검사(lib/auth, lib/board/policy)를 흉내 낸
   can() 한 곳에서 권한을 판정합니다.
   ============================================================ */
(() => {
  'use strict';

  const KEY = 'pyxpad-demo';
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ── 상태 ─────────────────────────────────────────────── */
  let db, ui;

  const freshUi = () => ({
    me: 'u1',
    route: location.hash || '#/',
    dashTab: 'all',
    dashSort: 'updated',
    dashFolder: null,
    boardQuery: '',
    boardSection: 'all',
    adminTab: 'users',
    adminQuery: '',
    adminRole: 'all',
    adminStatus: 'all',
    adminPage: 1,
    sidebarOpen: false,
  });

  function load() {
    ui = freshUi();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && raw.version === window.PYXPAD_SEED.version) {
        db = raw.db;
        if (raw.me) ui.me = raw.me;
        return;
      }
    } catch { /* 손상된 저장본은 무시하고 시드로 시작합니다. */ }
    db = clone(window.PYXPAD_SEED);
  }

  /* ?as=u3 으로 특정 역할 시점의 화면을 바로 링크할 수 있게 합니다(관리자 화면 공유용). */
  function applyRoleParam() {
    const asId = new URLSearchParams(location.search).get('as');
    if (asId && db.users.some((u) => u.id === asId)) ui.me = asId;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: window.PYXPAD_SEED.version, db, me: ui.me }));
    } catch { /* 사파리 프라이빗 모드 등 — 저장 실패해도 화면은 계속 돕니다. */ }
  }

  function reset() {
    localStorage.removeItem(KEY);
    db = clone(window.PYXPAD_SEED);
    ui = freshUi();
    location.hash = '#/';
    render();
    toast('데모 데이터를 처음 상태로 되돌렸습니다');
  }

  /* ── 조회 헬퍼 ────────────────────────────────────────── */
  const me = () => db.users.find((u) => u.id === ui.me);
  const user = (id) => db.users.find((u) => u.id === id) || { name: '알 수 없음', initial: '?', tint: 'sky' };
  const school = (id) => db.schools.find((s) => s.id === id);
  const board = (slug) => db.boards.find((b) => b.slug === slug);
  const boardById = (id) => db.boards.find((b) => b.id === id);
  const sectionsOf = (bid) => db.sections.filter((s) => s.boardId === bid).sort((a, b) => a.order - b.order);
  const postsOf = (sid) => db.posts.filter((p) => p.sectionId === sid)
    .sort((a, b) => (b.pinned - a.pinned) || (a.order - b.order));
  const commentsOf = (pid) => db.comments.filter((c) => c.postId === pid);
  const memberRole = (b, uid_) => (b.members.find((m) => m.userId === uid_) || {}).role || null;
  /* 사이드바 카운트와 대시보드 목록이 어긋나지 않도록 가시성 규칙을 한 곳에 둡니다. */
  const visibleBoards = () => db.boards.filter((b) => memberRole(b, ui.me) || me().role === 'SUPER_ADMIN');

  /* 서버 권한 검사를 흉내 냅니다 — 실서비스는 lib/board/policy.ts가 담당합니다. */
  function can(action, b, post) {
    const u = me();
    if (!u) return false;
    if (u.role === 'SUPER_ADMIN') return true;
    const r = memberRole(b, u.id);
    const owner = r === 'OWNER';
    const manager = owner || r === 'ADMIN';
    const editor = manager || r === 'EDITOR';
    if (b && b.frozen && action !== 'view') return false;
    switch (action) {
      case 'view': return true;
      case 'post': return !!r && r !== 'VIEWER' && b.allowPost;
      case 'comment': return !!r && r !== 'VIEWER' && b.allowComment;
      case 'react': return !!r && r !== 'VIEWER' && b.allowReaction;
      case 'editPost': return post ? (post.authorId === u.id || manager) : false;
      case 'section': return editor;
      case 'settings': return manager;
      case 'boardDelete': return owner;
      default: return false;
    }
  }

  const roleLabel = { OWNER: '소유자', ADMIN: '관리자', EDITOR: '편집자', MEMBER: '멤버', VIEWER: '뷰어' };
  const acctLabel = { STUDENT: '학생', TEACHER: '교사', SUPER_ADMIN: '전체관리자' };
  const scopeLabel = { PUBLIC: '전체 공개', SCHOOL: '학교 공개', PRIVATE: '비공개' };
  const statusLabel = { ACTIVE: '활성', SUSPENDED: '정지', PENDING: '승인대기' };
  const layoutLabel = { columns: '열', grid: '격자', feed: '피드' };

  /* 로그인 아이디는 실서비스와 같이 마스킹해서 보여줍니다. */
  function maskId(loginId) {
    const [name, domain] = String(loginId).split('@');
    if (!domain) return name.slice(0, 2) + '*'.repeat(Math.max(1, name.length - 2));
    return name.slice(0, 2) + '*'.repeat(Math.max(3, name.length - 2)) + '@' + domain;
  }

  function when(iso) {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return '방금';
    if (diff < 3600000) return Math.floor(diff / 60000) + '분 전';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '시간 전';
    if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + '일 전';
    return `${d.getMonth() + 1}. ${d.getDate()}.`;
  }
  const fullDate = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  /* ── 아이콘 ───────────────────────────────────────────── */
  const I = {
    grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/></svg>',
    starFill: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
    archive: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></svg>',
    folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
    clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    dots: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    grip: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
    bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M10.5 20a2 2 0 0 0 3 0"/></svg>',
    gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19l-.1.1A2 2 0 1 1 5 16.3l.1-.1A1.6 1.6 0 0 0 4 13.5H4a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5.2 6.8L5 6.7A2 2 0 1 1 7.9 3.9l.1.1a1.6 1.6 0 0 0 1.8.3h.1A1.6 1.6 0 0 0 11 2.9V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 20.7 6l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>',
    share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    chat: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/></svg>',
    users: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 5.5a3.2 3.2 0 0 1 0 6M18 20a6.6 6.6 0 0 0-2-4.7"/></svg>',
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
    building: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M10.5 21v-4h3v4"/></svg>',
    shield: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5.5c0 4.3 2.9 8 7 9.5 4.1-1.5 7-5.2 7-9.5V6Z"/></svg>',
    globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18"/></svg>',
    pin: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3Z"/></svg>',
    link: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/></svg>',
    clip: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 11.5 12.4 19a4.6 4.6 0 0 1-6.5-6.5l7.9-7.9a3 3 0 0 1 4.3 4.3l-7.9 7.9a1.5 1.5 0 0 1-2.1-2.1l7-7"/></svg>',
    sparkle: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M3 12h4M17 12h4M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8"/></svg>',
    logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8M17 8l4 4-4 4M21 12H10"/></svg>',
    trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M9 6V4h6v2M7 6l1 14h8l1-14M10 10v6M14 10v6"/></svg>',
    pencil: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5Z"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    sort: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/></svg>',
    reset: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5"/></svg>',
    file: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></svg>',
  };

  const avatar = (u, cls = '') =>
    `<span class="avatar ${cls}" data-tint="${u.tint}" aria-hidden="true">${esc(u.initial)}</span>`;

  /* ── 토스트 ───────────────────────────────────────────── */
  function toast(msg) {
    const wrap = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  /* ── 라우터 ───────────────────────────────────────────── */
  function parseRoute() {
    const h = (location.hash || '#/').replace(/^#/, '');
    const parts = h.split('/').filter(Boolean);
    if (parts[0] === 'admin') return { name: 'admin' };
    if (parts[0] === 'b' && parts[1] && parts[2] === 'posts' && parts[3]) {
      return { name: 'post', slug: decodeURIComponent(parts[1]), postId: parts[3] };
    }
    if (parts[0] === 'b' && parts[1]) return { name: 'board', slug: decodeURIComponent(parts[1]) };
    return { name: 'dash' };
  }
  const go = (hash) => { location.hash = hash; };

  /* ── 렌더 진입점 ──────────────────────────────────────── */
  function render() {
    const r = parseRoute();
    const app = $('#app');
    closeMenu();
    if (r.name === 'post') app.innerHTML = viewPost(r);
    else if (r.name === 'board') app.innerHTML = shell(viewBoard(r), 'board');
    else if (r.name === 'admin') app.innerHTML = shell(viewAdmin(), 'admin');
    else app.innerHTML = shell(viewDash(), 'dash');
    save();
  }

  /* ── 셸 (사이드바 + 본문) ─────────────────────────────── */
  function shell(main, active) {
    const u = me();
    const mine = visibleBoards().filter((b) => !b.archived);
    const recent = mine.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
    const favs = mine.filter((b) => b.favorite).length;
    const arch = visibleBoards().filter((b) => b.archived).length;

    return `
<div class="app-shell">
  <aside class="app-sidebar" data-open="${ui.sidebarOpen}" id="sidebar">
    <a class="side-brand" href="#/"><span class="side-mark" aria-hidden="true">P</span> pyxpad</a>

    <nav class="side-nav" aria-label="주요 메뉴">
      <a class="side-link ${active === 'dash' && !ui.dashFolder ? 'active' : ''}" href="#/" data-act="dash-tab" data-tab="all">${I.grid} 내 패드</a>
      <button class="side-link ${ui.dashTab === 'fav' ? 'active' : ''}" data-act="dash-tab" data-tab="fav">${I.star} 즐겨찾기 <span class="count">${favs}</span></button>
      <button class="side-link" data-act="focus-search">${I.search} 검색</button>
      <button class="side-link ${ui.dashTab === 'archived' ? 'active' : ''}" data-act="dash-tab" data-tab="archived">${I.archive} 보관된 패드 <span class="count">${arch}</span></button>
    </nav>

    <div class="side-section">
      <div class="side-title">${I.folder} 내 폴더</div>
      <div class="side-list">
        ${db.folders.map((f) => `
          <button class="side-item ${ui.dashFolder === f.id ? 'active' : ''}" data-act="folder" data-id="${f.id}">
            <span>${esc(f.name)}</span>
            <small>${mine.filter((b) => b.folderId === f.id).length}</small>
          </button>`).join('')}
        ${db.folders.length ? '' : '<p class="side-empty">아직 폴더가 없어요.</p>'}
      </div>
      <div class="side-folder-add">
        <input type="text" placeholder="새 폴더" aria-label="새 폴더 이름" data-act="folder-input" />
        <button type="button" aria-label="폴더 만들기" data-act="folder-add">${I.plus}</button>
      </div>
    </div>

    <div class="side-section">
      <div class="side-title">${I.clock} 최근 방문</div>
      <div class="side-list">
        ${recent.map((b) => `<button class="side-item" data-act="open-board" data-slug="${b.slug}"><span>${esc(b.title)}</span></button>`).join('')}
      </div>
    </div>

    <div class="role-switch">
      <div class="role-switch-title">${I.sparkle} 역할 바꿔보기 (데모)</div>
      <div class="role-switch-list">
        ${['u1', 'u2', 'u3'].map((id) => {
          const p = user(id);
          return `<button class="role-opt" aria-pressed="${ui.me === id}" data-act="switch-user" data-id="${id}">
            ${avatar(p, 'avatar-sm')}<span>${esc(p.name)}</span><small>${acctLabel[p.role]}</small>
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="side-bottom">
      <div class="side-user">
        ${avatar(u)}
        <span class="side-user-name">${esc(u.name)}<br /><span class="side-user-role">${acctLabel[u.role]}</span></span>
      </div>
      <div class="side-actions">
        ${u.role === 'SUPER_ADMIN' ? `<button class="btn btn-sm" data-act="nav" data-to="#/admin">${I.shield} 관리자</button>` : ''}
        <button class="btn btn-icon" data-act="theme" aria-label="화면 밝기 바꾸기">${I.moon}</button>
        <button class="btn btn-icon" data-act="logout" aria-label="로그아웃">${I.logout}</button>
      </div>
    </div>
  </aside>
  <button class="side-backdrop" data-act="close-sidebar" aria-label="메뉴 닫기"></button>

  <div class="app-main">${main}</div>
</div>
<button class="side-toggle" data-act="open-sidebar" aria-label="메뉴 열기">${I.menu}</button>`;
  }

  /* ── 화면 1: 대시보드 ─────────────────────────────────── */
  function viewDash() {
    const u = me();
    let list = visibleBoards();

    if (ui.dashTab === 'archived') list = list.filter((b) => b.archived);
    else list = list.filter((b) => !b.archived);
    if (ui.dashTab === 'fav') list = list.filter((b) => b.favorite);
    if (ui.dashTab === 'mine') list = list.filter((b) => b.ownerId === u.id);
    if (ui.dashFolder) list = list.filter((b) => b.folderId === ui.dashFolder);
    if (ui.boardQuery) {
      const q = ui.boardQuery.toLowerCase();
      list = list.filter((b) => b.title.toLowerCase().includes(q) || b.intro.toLowerCase().includes(q));
    }
    list.sort((a, b) => (ui.dashSort === 'title'
      ? a.title.localeCompare(b.title, 'ko')
      : b.updatedAt.localeCompare(a.updatedAt)));

    const all = visibleBoards().filter((b) => !b.archived);
    const folderName = ui.dashFolder ? (db.folders.find((f) => f.id === ui.dashFolder) || {}).name : null;
    const unread = db.notifications.filter((n) => !n.read).length;

    return `
<header class="topbar">
  <div class="topbar-title"><b>${folderName ? esc(folderName) : '내 패드'}</b></div>
  <div class="topbar-actions">
    <button class="btn btn-icon" data-act="notif" aria-label="알림 ${unread}건">${I.bell}</button>
    <button class="btn btn-primary" data-act="new-board">${I.plus} 새 패드</button>
  </div>
</header>

<div class="page">
  <div class="page-narrow">
    <div class="page-head">
      <span class="page-eyebrow">My workspace</span>
      <h1 class="page-title">${esc(u.name.replace(/\s*선생님$/, ''))}님의 패드</h1>
    </div>

    <div class="dash-toolbar">
      <div class="board-search">
        ${I.search}
        <input class="field" type="search" id="dash-search" placeholder="패드 검색" value="${esc(ui.boardQuery)}" data-act="dash-search" aria-label="패드 검색" />
      </div>
      <select class="field" style="width:auto;min-height:36px;height:36px;border-radius:999px" data-act="dash-sort" aria-label="정렬">
        <option value="updated" ${ui.dashSort === 'updated' ? 'selected' : ''}>최근 수정순</option>
        <option value="title" ${ui.dashSort === 'title' ? 'selected' : ''}>이름순</option>
      </select>
    </div>

    <div class="dash-filters">
      <button class="pill" aria-pressed="${ui.dashTab === 'all' && !ui.dashFolder}" data-act="dash-tab" data-tab="all">전체 <b>${all.length}</b></button>
      <button class="pill" aria-pressed="${ui.dashTab === 'mine'}" data-act="dash-tab" data-tab="mine">내가 만든 패드 <b>${all.filter((b) => b.ownerId === u.id).length}</b></button>
      <button class="pill" aria-pressed="${ui.dashTab === 'fav'}" data-act="dash-tab" data-tab="fav">즐겨찾기 <b>${all.filter((b) => b.favorite).length}</b></button>
      <button class="pill" aria-pressed="${ui.dashTab === 'archived'}" data-act="dash-tab" data-tab="archived">보관함</button>
      ${ui.dashFolder ? `<button class="pill" aria-pressed="true" data-act="folder" data-id="${ui.dashFolder}">${I.folder} ${esc(folderName)} ✕</button>` : ''}
    </div>

    <div class="notice">
      <span class="notice-icon">${I.folder}</span>
      <div>
        <b>패드를 폴더로 정리할 수 있어요.</b>
        <p>카드의 '···' 메뉴에서 담을 폴더를 고르세요. 새 폴더는 왼쪽 사이드바의 '내 폴더'에서 만듭니다.</p>
      </div>
    </div>

    <div class="group-head">
      ${I.shield}
      <h2>${ui.dashTab === 'archived' ? '보관된 패드' : '패드 목록'}</h2>
      <span class="count">${list.length}개</span>
    </div>

    ${list.length || ui.dashTab !== 'archived' ? `
      <div class="pad-grid">
        ${ui.dashTab === 'archived' ? '' : `
          <button class="pad-tile" data-act="new-board">
            <span class="pad-tile-plus">${I.plus}</span>
            새 패드 만들기
          </button>`}
        ${list.map(padCard).join('')}
      </div>` : `
      <div class="empty">
        <div class="empty-icon">${I.archive}</div>
        <b>보관된 패드가 없어요</b>
        <p>패드를 보관하면 30일 동안 여기에서 되살릴 수 있습니다.</p>
      </div>`}
  </div>
</div>`;
  }

  function padCard(b) {
    const owner = user(b.ownerId);
    const secs = sectionsOf(b.id).length;
    const posts = db.posts.filter((p) => p.boardId === b.id).length;
    return `
<div class="pad-card" data-act="open-board" data-slug="${b.slug}" role="button" tabindex="0">
  <div class="pad-card-cover" data-tint="${b.coverTint}"></div>
  <div class="pad-card-body">
    <div class="pad-card-top">
      <span class="chip">${I.globe} ${scopeLabel[b.scope]}</span>
      ${b.frozen ? '<span class="chip" style="background:var(--sun);color:var(--warning-ink)">동결</span>' : ''}
      <button class="icon-btn" style="margin-left:auto" data-act="board-menu" data-id="${b.id}" aria-label="${esc(b.title)} 메뉴">${I.dots}</button>
    </div>
    <h3 class="pad-card-title">${esc(b.title)}</h3>
    <span class="pad-card-owner">${esc(owner.name)}</span>
    <p class="pad-card-meta">${secs}개 섹션 · ${posts}개 글 · ${when(b.updatedAt)}</p>
    <div class="pad-card-foot">
      <button class="icon-btn ${b.favorite ? 'on' : ''}" data-act="fav" data-id="${b.id}" aria-label="즐겨찾기" aria-pressed="${b.favorite}">${b.favorite ? I.starFill : I.star}</button>
      ${b.folderId ? `<span class="pad-card-meta">${I.folder} ${esc((db.folders.find((f) => f.id === b.folderId) || {}).name || '')}</span>` : ''}
    </div>
  </div>
</div>`;
  }

  /* ── 화면 2: 보드 ─────────────────────────────────────── */
  function viewBoard(r) {
    const b = board(r.slug);
    if (!b) return notFound('패드를 찾을 수 없습니다.');
    const secs = sectionsOf(b.id);
    const owner = user(b.ownerId);
    const q = ui.boardQuery.toLowerCase();
    const visible = ui.boardSection === 'all' ? secs : secs.filter((s) => s.id === ui.boardSection);
    const canPost = can('post', b);

    return `
<header class="topbar">
  <button class="btn btn-icon" data-act="nav" data-to="#/" aria-label="내 패드로">${I.back}</button>
  <div class="topbar-title">
    <span class="chip">${I.globe} ${scopeLabel[b.scope]}</span>
    <b>${esc(b.title)}</b>
    ${b.frozen ? '<span class="chip" style="background:var(--sun);color:var(--warning-ink)">동결됨</span>' : ''}
    <span class="topbar-sub">· ${esc(owner.name)}</span>
  </div>
  <div class="topbar-actions">
    <div class="topbar-members">
      <div class="topbar-stack">${b.members.slice(0, 4).map((m) => avatar(user(m.userId))).join('')}</div>
      <span class="topbar-sub"><b>${b.members.length}명</b> 참여</span>
    </div>
    <button class="btn btn-sm" data-act="share" data-id="${b.id}">${I.share} 공유</button>
    ${can('settings', b) ? `<button class="btn btn-icon" data-act="settings" data-id="${b.id}" aria-label="패드 설정">${I.gear}</button>` : ''}
    <button class="btn btn-icon" data-act="theme" aria-label="화면 밝기 바꾸기">${I.moon}</button>
  </div>
</header>

<div class="board-bar">
  <div class="board-search">
    ${I.search}
    <input class="field" type="search" placeholder="패드에서 검색" value="${esc(ui.boardQuery)}" data-act="board-search" aria-label="이 패드에서 검색" />
  </div>
  <span class="board-hint">${I.sparkle} 카드나 섹션을 길게 눌러 순서를 바꿀 수 있어요.</span>
  ${can('section', b) ? `<button class="btn btn-sm" style="margin-left:auto" data-act="new-section" data-id="${b.id}">${I.plus} 섹션 추가</button>` : ''}
</div>

<div class="board-tabs" role="tablist" aria-label="섹션 필터">
  <button class="pill" role="tab" aria-pressed="${ui.boardSection === 'all'}" data-act="sec-tab" data-id="all">전체</button>
  ${secs.map((s) => `<button class="pill" role="tab" aria-pressed="${ui.boardSection === s.id}" data-act="sec-tab" data-id="${s.id}">${esc(s.title)}</button>`).join('')}
</div>

<div class="board-canvas">
  ${b.frozen ? '<div class="callout" style="margin-bottom:14px">이 패드는 동결되어 새 글을 쓰거나 고칠 수 없습니다. 소유자가 설정에서 해제할 수 있어요.</div>' : ''}
  <div class="board-cols layout-${b.layout}" id="board-cols" data-board="${b.id}">
    ${visible.map((s, i) => sectionCol(b, s, i, q, canPost)).join('')}
  </div>
</div>`;
  }

  function sectionCol(b, s, i, q, canPost) {
    let list = postsOf(s.id);
    if (q) list = list.filter((p) => (p.title + p.body).toLowerCase().includes(q));
    return `
<section class="section" data-section="${s.id}">
  <header class="section-head">
    ${can('section', b) ? `<button class="section-grip" data-act="sec-grip" data-id="${s.id}" aria-label="${esc(s.title)} 섹션 옮기기">${I.grip}</button>` : ''}
    <span class="section-no">${String(i + 1).padStart(2, '0')}</span>
    <h2 class="section-title" ${can('section', b) ? `data-act="edit-section" data-id="${s.id}" title="더블클릭으로 수정"` : ''}>${esc(s.title)}</h2>
    <span class="section-count" data-count>${list.length}</span>
    ${can('section', b) ? `<button class="icon-btn" data-act="section-menu" data-id="${s.id}" aria-label="${esc(s.title)} 메뉴">${I.dots}</button>` : ''}
  </header>
  ${s.guide ? `<p class="section-guide">${esc(s.guide)}</p>` : ''}
  <button class="section-add" data-act="new-post" data-section="${s.id}" ${canPost ? '' : 'disabled'}>
    ${I.plus} ${canPost ? '' : '작성 권한 없음'}
  </button>
  <ul class="section-list" data-list="${s.id}">
    ${list.map((p) => postCard(b, p)).join('')}
  </ul>
</section>`;
  }

  function postCard(b, p) {
    const a = user(p.authorId);
    // 카드에서는 👍만 세고, 나머지 이모지는 상세 화면에서 각각 보여줍니다.
    const thumbs = (p.reactions['👍'] || []).length;
    const others = Object.entries(p.reactions).reduce((n, [e, arr]) => n + (e === '👍' ? 0 : arr.length), 0);
    const comments = commentsOf(p.id).length;
    const link = p.links[0];
    return `
<li class="post" data-tint="${p.tint}" data-post="${p.id}" data-act="open-post" role="button" tabindex="0">
  <div class="post-top">
    ${avatar(a, 'avatar-sm')}
    <span class="post-author">${esc(a.name)}</span>
    ${p.pinned ? `<span class="post-pin">${I.pin} 고정</span>` : ''}
    ${can('editPost', b, p) ? `<button class="post-grip" data-act="post-grip" data-id="${p.id}" aria-label="${esc(p.title)} 옮기기">${I.grip}</button>` : ''}
  </div>
  ${p.thumbTint ? `<div class="post-thumb" style="background:var(--${p.thumbTint})"></div>` : ''}
  <h3 class="post-title">${esc(p.title)}</h3>
  <p class="post-body">${esc(p.body.replace(/\*\*/g, ''))}</p>
  ${link ? `<div class="post-link"><span class="post-link-ico">${I.link}</span><div style="min-width:0"><b>${esc(link.title)}</b><small>${esc(link.site)}</small></div></div>` : ''}
  <div class="post-foot">
    <button class="post-act ${thumbs && p.reactions['👍'].includes(ui.me) ? 'on' : ''}" data-act="quick-react" data-id="${p.id}">👍 ${thumbs}</button>
    ${others ? `<span title="다른 이모지 반응">+${others}</span>` : ''}
    <span>${I.chat} ${comments}</span>
    <time datetime="${p.createdAt}">${when(p.createdAt)}</time>
  </div>
</li>`;
  }

  /* ── 화면 3: 카드 상세 ────────────────────────────────── */
  function viewPost(r) {
    const b = board(r.slug);
    const p = b && db.posts.find((x) => x.id === r.postId);
    if (!p) return notFound('게시물을 찾을 수 없습니다.');
    const sec = db.sections.find((s) => s.id === p.sectionId);
    const a = user(p.authorId);
    const roots = commentsOf(p.id).filter((c) => !c.parentId);
    const total = commentsOf(p.id).length;
    const emojis = ['👍', '❤️', '🎉', '👀'];

    return `
<div class="app-main" style="min-height:100dvh">
  <header class="topbar">
    <button class="btn btn-sm" data-act="nav" data-to="#/b/${b.slug}">${I.back} 패드로 돌아가기</button>
    <div class="topbar-actions">
      <button class="btn btn-icon" data-act="theme" aria-label="화면 밝기 바꾸기">${I.moon}</button>
    </div>
  </header>

  <div class="page">
    <div class="detail-wrap">
      <div>
        <nav class="crumb" aria-label="위치">
          <button data-act="nav" data-to="#/b/${b.slug}">${esc(b.title)}</button>
          <span aria-hidden="true">›</span>
          <span>${esc(sec ? sec.title : '')}</span>
        </nav>

        <article class="detail">
          <div class="detail-head">
            <span class="chip">${esc(sec ? sec.title : '')}</span>
            <h1 class="detail-title">${esc(p.title)}</h1>
            <div class="detail-by">
              ${avatar(a, 'avatar-lg')}
              <div><b>${esc(a.name)}</b><small>${fullDate(p.createdAt)}</small></div>
            </div>
          </div>
          <div class="detail-body">
            ${p.thumbTint ? `<div class="post-thumb" style="height:200px;margin-bottom:16px;background:var(--${p.thumbTint})" role="img" aria-label="첨부 이미지 (데모 자리표시)"></div>` : ''}
            ${renderBody(p.body)}
            ${p.links.map((l) => `
              <a class="post-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="margin-top:16px;text-decoration:none">
                <span class="post-link-ico">${I.link}</span>
                <div style="min-width:0"><b>${esc(l.title)}</b><small>${esc(l.site)}</small></div>
              </a>`).join('')}
          </div>
          <div class="detail-reactions">
            ${emojis.map((e) => {
              const arr = p.reactions[e] || [];
              return `<button class="react" aria-pressed="${arr.includes(ui.me)}" data-act="react" data-id="${p.id}" data-emoji="${e}">${e} ${arr.length || ''}</button>`;
            }).join('')}
          </div>
          ${can('editPost', b, p) ? `
          <div class="detail-foot">
            <button class="btn" data-act="edit-post" data-id="${p.id}">${I.pencil} 수정</button>
            <button class="btn btn-danger" data-act="delete-post" data-id="${p.id}">${I.trash} 삭제</button>
          </div>` : ''}
        </article>
      </div>

      <aside class="comments">
        <div class="comments-head">${I.chat}<h2>함께 나눈 이야기</h2><span class="count">${total}</span></div>
        ${roots.length ? `<div class="comments-list">${roots.map((c) => commentBlock(c, p)).join('')}</div>` : `
          <div class="empty" style="padding:34px 20px">
            <div class="empty-icon">${I.chat}</div>
            <b>아직 댓글이 없어요</b>
            <p>첫 번째 응원이나 질문을 남겨보세요.</p>
          </div>`}
        ${can('comment', b) ? `
        <form class="comment-form" data-act="comment-form" data-post="${p.id}">
          <label class="label" for="comment-input">댓글 남기기</label>
          <textarea class="field" id="comment-input" name="body" rows="3" maxlength="2000" placeholder="이 글에 대한 생각이나 응원을 남겨보세요." required></textarea>
          <div class="comment-form-foot">
            <small>@ 뒤에 이름을 입력하면 친구를 언급할 수 있어요.</small>
            <button class="btn btn-primary btn-sm" type="submit">댓글 등록</button>
          </div>
        </form>` : `<div class="comment-form"><small style="color:var(--muted);font-size:.8rem">${b.frozen ? '동결된 패드에는 댓글을 쓸 수 없습니다.' : '이 패드에 댓글을 쓸 권한이 없습니다.'}</small></div>`}
      </aside>
    </div>
  </div>
</div>`;
  }

  function commentBlock(c, p) {
    const a = user(c.authorId);
    const replies = db.comments.filter((x) => x.parentId === c.id);
    const b = boardById(p.boardId);
    const mineC = c.authorId === ui.me || me().role === 'SUPER_ADMIN';
    return `
<div class="comment">
  ${avatar(a, 'avatar-sm')}
  <div class="comment-in">
    <div class="comment-meta"><b>${esc(a.name)}</b><time datetime="${c.createdAt}">${when(c.createdAt)}</time></div>
    <p class="comment-body">${esc(c.body)}</p>
    <div class="comment-acts">
      ${can('comment', b) ? `<button data-act="reply" data-id="${c.id}" data-post="${p.id}">답글</button>` : ''}
      ${mineC ? `<button data-act="delete-comment" data-id="${c.id}">삭제</button>` : ''}
    </div>
    ${replies.length ? `<div class="comment-replies">${replies.map((rc) => commentBlock(rc, p)).join('')}</div>` : ''}
  </div>
</div>`;
  }

  /* 아주 작은 마크다운 — **굵게** 와 문단만 처리합니다(실서비스는 react-markdown + rehype-sanitize). */
  function renderBody(text) {
    return String(text).split(/\n{2,}/).map((para) =>
      '<p>' + esc(para).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />') + '</p>'
    ).join('');
  }

  /* ── 화면 4: 관리자 ───────────────────────────────────── */
  function viewAdmin() {
    const u = me();
    if (u.role !== 'SUPER_ADMIN') {
      return `
<header class="topbar"><div class="topbar-title"><b>관리자 센터</b></div>
  <div class="topbar-actions"><button class="btn btn-sm" data-act="nav" data-to="#/">내 패드로</button></div></header>
<div class="page"><div class="page-narrow"><div class="empty">
  <div class="empty-icon">${I.shield}</div>
  <b>전체관리자만 볼 수 있는 화면입니다</b>
  <p>왼쪽 사이드바의 '역할 바꿔보기'에서 <b>힘센캥거루(전체관리자)</b>로 바꾸면 들어올 수 있어요.</p>
  <p style="margin-top:14px"><button class="btn btn-primary" data-act="switch-user" data-id="u3">전체관리자로 바꾸기</button></p>
</div></div></div>`;
    }

    const tabs = [
      { id: 'users', ico: I.users, name: '사용자 관리', sub: '계정·권한·소속', n: db.users.length },
      { id: 'approvals', ico: I.check, name: '교사 가입 요청', sub: '학교·부서 승인', n: db.approvals.length },
      { id: 'schools', ico: I.building, name: '소속 관리', sub: '학교·반·부서', n: db.schools.length },
      { id: 'logs', ico: I.shield, name: '감사 로그', sub: '중요 작업 기록', n: db.auditLogs.length },
    ];

    return `
<header class="topbar">
  <div class="topbar-title"><span class="chip">${I.shield} 관리자 센터</span></div>
  <div class="topbar-actions">
    <button class="btn btn-sm" data-act="nav" data-to="#/">${I.back} 패드로 돌아가기</button>
    <button class="btn btn-icon" data-act="theme" aria-label="화면 밝기 바꾸기">${I.moon}</button>
  </div>
</header>

<div class="page">
  <div class="page-narrow admin-wrap">
    <nav class="admin-menu" aria-label="관리 메뉴">
      <span class="admin-menu-title">Admin menu</span>
      <h2>관리 메뉴</h2>
      ${tabs.map((t) => `
        <button class="admin-tab" aria-selected="${ui.adminTab === t.id}" data-act="admin-tab" data-id="${t.id}">
          <span class="admin-tab-ico">${t.ico}</span>
          <span class="admin-tab-txt"><b>${t.name}</b><small>${t.sub}</small></span>
          <span class="n">${t.n}</span>
        </button>`).join('')}
      <p class="admin-note">민감한 작업은 사유와 함께 감사 로그에 기록됩니다.</p>
    </nav>
    <div>${
      ui.adminTab === 'approvals' ? adminApprovals()
      : ui.adminTab === 'schools' ? adminSchools()
      : ui.adminTab === 'logs' ? adminLogs()
      : adminUsers()
    }</div>
  </div>
</div>`;
  }

  const PER_PAGE = 5;

  function adminUsers() {
    let rows = db.users.slice();
    if (ui.adminQuery) {
      const q = ui.adminQuery.toLowerCase();
      rows = rows.filter((u) => u.name.toLowerCase().includes(q) || u.loginId.toLowerCase().includes(q));
    }
    if (ui.adminRole !== 'all') rows = rows.filter((u) => u.role === ui.adminRole);
    if (ui.adminStatus !== 'all') rows = rows.filter((u) => u.status === ui.adminStatus);

    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    const page = Math.min(ui.adminPage, pages);
    const slice = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    return `
<div class="panel">
  <div class="panel-head">
    <span class="page-eyebrow">Directory</span>
    <h2>사용자</h2>
    <p>이름이나 로그인 아이디로 찾고, 권한과 소속으로 목록을 좁혀보세요.</p>
  </div>

  <div class="panel-toolbar">
    <div class="panel-search">
      ${I.search}
      <input class="field" type="search" placeholder="이름 또는 로그인 아이디" value="${esc(ui.adminQuery)}" data-act="admin-search" aria-label="사용자 검색" />
      ${ui.adminQuery ? `<button class="icon-btn clear" data-act="admin-clear" aria-label="검색어 지우기">${I.x}</button>` : ''}
    </div>
  </div>

  <div class="panel-filters">
    <select class="field" data-act="admin-role" aria-label="권한 필터">
      <option value="all" ${ui.adminRole === 'all' ? 'selected' : ''}>모든 권한</option>
      <option value="STUDENT" ${ui.adminRole === 'STUDENT' ? 'selected' : ''}>학생</option>
      <option value="TEACHER" ${ui.adminRole === 'TEACHER' ? 'selected' : ''}>교사</option>
      <option value="SUPER_ADMIN" ${ui.adminRole === 'SUPER_ADMIN' ? 'selected' : ''}>전체관리자</option>
    </select>
    <select class="field" data-act="admin-status" aria-label="상태 필터">
      <option value="all" ${ui.adminStatus === 'all' ? 'selected' : ''}>모든 상태</option>
      <option value="ACTIVE" ${ui.adminStatus === 'ACTIVE' ? 'selected' : ''}>활성</option>
      <option value="SUSPENDED" ${ui.adminStatus === 'SUSPENDED' ? 'selected' : ''}>정지</option>
    </select>
    <span class="res">결과 <b>${rows.length}명</b></span>
  </div>

  <div class="table-scroll">
    <table class="admin-table">
      <thead><tr>
        <th>사용자</th><th>권한</th><th>상태</th><th>학교·소속</th><th style="text-align:center">패드</th><th></th>
      </tr></thead>
      <tbody>
        ${slice.length ? slice.map(adminRow).join('') : `
          <tr><td colspan="6"><div class="empty" style="padding:34px 10px">
            <b>조건에 맞는 사용자가 없어요</b><p>검색어나 필터를 지워보세요.</p>
          </div></td></tr>`}
      </tbody>
    </table>
  </div>

  <div class="panel-foot">
    <span>총 ${rows.length}명</span>
    <div class="pager">
      <button class="pager-n" data-act="admin-page" data-p="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="이전">‹</button>
      ${Array.from({ length: pages }, (_, i) => `<button class="pager-n" aria-current="${page === i + 1}" data-act="admin-page" data-p="${i + 1}">${i + 1}</button>`).join('')}
      <button class="pager-n" data-act="admin-page" data-p="${page + 1}" ${page === pages ? 'disabled' : ''} aria-label="다음">›</button>
    </div>
    <span>${page} / ${pages} 페이지</span>
  </div>
</div>`;
  }

  function adminRow(u) {
    const sc = school(u.schoolId) || { name: '-', groups: [] };
    const owned = db.boards.filter((b) => b.ownerId === u.id).length;
    const joined = db.boards.filter((b) => memberRole(b, u.id)).length;
    return `
<tr>
  <td><div class="admin-user">${avatar(u)}<div><b>${esc(u.name)}</b><small>${esc(maskId(u.loginId))}</small></div></div></td>
  <td>
    <select class="field" data-act="set-role" data-id="${u.id}" aria-label="${esc(u.name)} 권한">
      <option value="STUDENT" ${u.role === 'STUDENT' ? 'selected' : ''}>학생</option>
      <option value="TEACHER" ${u.role === 'TEACHER' ? 'selected' : ''}>교사</option>
      <option value="SUPER_ADMIN" ${u.role === 'SUPER_ADMIN' ? 'selected' : ''}>전체관리자</option>
    </select>
  </td>
  <td>
    <select class="field" data-act="set-status" data-id="${u.id}" aria-label="${esc(u.name)} 상태">
      <option value="ACTIVE" ${u.status === 'ACTIVE' ? 'selected' : ''}>활성</option>
      <option value="SUSPENDED" ${u.status === 'SUSPENDED' ? 'selected' : ''}>정지</option>
    </select>
  </td>
  <td>
    <div class="admin-org">
      <select class="field" data-act="set-school" data-id="${u.id}" aria-label="${esc(u.name)} 학교">
        ${db.schools.map((s) => `<option value="${s.id}" ${u.schoolId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
      <select class="field" data-act="set-group" data-id="${u.id}" aria-label="${esc(u.name)} 소속">
        ${sc.groups.map((g) => `<option value="${esc(g)}" ${u.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
      </select>
    </div>
  </td>
  <td class="admin-pads"><b>${joined}</b><small>소유 ${owned}</small></td>
  <td><button class="icon-btn" data-act="user-menu" data-id="${u.id}" aria-label="${esc(u.name)} 작업">${I.dots}</button></td>
</tr>`;
  }

  function adminApprovals() {
    return `
<div class="panel">
  <div class="panel-head">
    <span class="page-eyebrow">Approvals</span>
    <h2>교사 가입 요청</h2>
    <p>승인하면 교사 권한으로 활성화되고, 처리 내역은 감사 로그에 남습니다.</p>
  </div>
  ${db.approvals.length ? db.approvals.map((a) => {
    const sc = school(a.schoolId) || { name: '-' };
    return `
    <div class="approval">
      ${avatar(a)}
      <div class="approval-main">
        <b>${esc(a.name)}</b>
        <small>${esc(maskId(a.loginId))} · ${esc(sc.name)} ${esc(a.group)} · ${when(a.requestedAt)} 요청</small>
      </div>
      <div class="approval-acts">
        <button class="btn btn-sm btn-primary" data-act="approve" data-id="${a.id}">승인</button>
        <button class="btn btn-sm btn-danger" data-act="reject" data-id="${a.id}">반려</button>
      </div>
    </div>`;
  }).join('') : `<div class="empty"><div class="empty-icon">${I.check}</div><b>대기 중인 요청이 없어요</b><p>새 교사 가입 요청이 오면 여기에 표시됩니다.</p></div>`}
</div>`;
  }

  function adminSchools() {
    return `
<div class="panel">
  <div class="panel-head">
    <span class="page-eyebrow">Organisation</span>
    <h2>소속 관리</h2>
    <p>학교와 그 아래 반·부서를 관리합니다. 사용자 소속은 이 목록에서 고를 수 있게 됩니다.</p>
  </div>
  ${db.schools.map((s) => `
    <div class="approval" style="align-items:flex-start">
      <span class="avatar" data-tint="sky" aria-hidden="true">${I.building}</span>
      <div class="approval-main">
        <b>${esc(s.name)}</b>
        <small>구성원 ${db.users.filter((u) => u.schoolId === s.id).length}명 · 반·부서 ${s.groups.length}개</small>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:9px">
          ${s.groups.map((g) => `<span class="chip">${esc(g)}<button class="icon-btn" style="width:18px;height:18px" data-act="del-group" data-school="${s.id}" data-group="${esc(g)}" aria-label="${esc(g)} 삭제">${I.x}</button></span>`).join('')}
        </div>
      </div>
      <div class="approval-acts">
        <button class="btn btn-sm" data-act="add-group" data-id="${s.id}">${I.plus} 반·부서</button>
      </div>
    </div>`).join('')}
  <div style="padding:16px 22px"><button class="btn btn-sm" data-act="add-school">${I.plus} 학교 추가</button></div>
</div>`;
  }

  function adminLogs() {
    return `
<div class="panel">
  <div class="panel-head">
    <span class="page-eyebrow">Audit</span>
    <h2>감사 로그</h2>
    <p>권한 변경·계정 정지·비밀번호 초기화 같은 민감한 작업이 사유와 함께 기록됩니다.</p>
  </div>
  ${db.auditLogs.slice().sort((a, b) => b.at.localeCompare(a.at)).map((l) => `
    <div class="log-row">
      <span class="log-ico">${I.shield}</span>
      <div class="log-main">
        <b>${esc(l.action)}</b> — ${esc(l.target)}
        <p>${esc(user(l.actorId).name)} · 사유: ${esc(l.reason)}</p>
      </div>
      <span class="log-time">${when(l.at)}</span>
    </div>`).join('')}
</div>`;
  }

  function notFound(msg) {
    return `<div class="page"><div class="page-narrow"><div class="empty">
      <div class="empty-icon">${I.search}</div><b>${esc(msg)}</b>
      <p><button class="btn" data-act="nav" data-to="#/" style="margin-top:12px">내 패드로 돌아가기</button></p>
    </div></div></div>`;
  }

  /* ── 모달 / 드로어 ────────────────────────────────────── */
  function openModal(html, opts = {}) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'backdrop';
    wrap.id = 'backdrop';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) closeModal(); });
    const first = wrap.querySelector('[autofocus], input, textarea, select, button');
    if (first) first.focus();
    if (opts.onSubmit) {
      const form = wrap.querySelector('form');
      if (form) form.addEventListener('submit', (e) => { e.preventDefault(); opts.onSubmit(new FormData(form), form); });
    }
  }
  function closeModal() {
    const el = $('#backdrop'); if (el) el.remove();
    const dr = $('#drawer'); if (dr) dr.remove();
    const db_ = $('#drawer-backdrop'); if (db_) db_.remove();
  }

  function openDrawer(html) {
    closeModal();
    const back = document.createElement('div');
    back.className = 'backdrop';
    back.id = 'drawer-backdrop';
    back.style.display = 'block';
    document.body.appendChild(back);
    const el = document.createElement('aside');
    el.className = 'drawer';
    el.id = 'drawer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = html;
    document.body.appendChild(el);
    back.addEventListener('pointerdown', closeModal);
  }

  /* ── 드롭다운 ─────────────────────────────────────────── */
  function openMenu(anchor, items) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'menu';
    m.id = 'menu';
    m.setAttribute('role', 'menu');
    m.innerHTML = items.map((it) => it.sep ? '<div class="menu-sep"></div>'
      : it.label ? `<div class="menu-label">${esc(it.label)}</div>`
      : `<button class="menu-item ${it.danger ? 'danger' : ''}" role="menuitem" data-menu-idx="${items.indexOf(it)}">${it.ico || ''} ${esc(it.text)}</button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    m.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    m.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-menu-idx]');
      if (!btn) return;
      const it = items[+btn.dataset.menuIdx];
      closeMenu();
      if (it && it.run) it.run();
    });
    const q = m.querySelector('.menu-item'); if (q) q.focus();
  }
  function closeMenu() { const m = $('#menu'); if (m) m.remove(); }

  /* ── 액션 ─────────────────────────────────────────────── */
  const touch = (bid) => { const b = boardById(bid); if (b) b.updatedAt = new Date().toISOString(); };

  function logAudit(action, target, reason) {
    db.auditLogs.push({ id: uid('l'), actorId: ui.me, action, target, reason, at: new Date().toISOString() });
  }

  const ACTIONS = {
    nav: (el) => go(el.dataset.to),
    'open-board': (el) => { ui.boardQuery = ''; ui.boardSection = 'all'; go('#/b/' + el.dataset.slug); },
    'open-post': (el) => {
      const p = db.posts.find((x) => x.id === el.dataset.post);
      const b = boardById(p.boardId);
      go(`#/b/${b.slug}/posts/${p.id}`);
    },
    theme: () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('pyxpad-demo-theme', next);
    },
    logout: () => toast('데모에서는 로그아웃이 동작하지 않습니다'),
    'open-sidebar': () => { ui.sidebarOpen = true; render(); },
    'close-sidebar': () => { ui.sidebarOpen = false; render(); },
    'switch-user': (el) => {
      ui.me = el.dataset.id;
      ui.adminPage = 1;
      render();
      toast(`${me().name}(${acctLabel[me().role]}) 시점으로 봅니다`);
    },
    notif: (el) => openMenu(el, [
      { label: '알림' },
      ...db.notifications.map((n) => ({ text: n.text, run: () => { n.read = true; render(); } })),
      { sep: true },
      { text: '모두 읽음으로 표시', run: () => { db.notifications.forEach((n) => { n.read = true; }); render(); } },
    ]),

    /* 대시보드 */
    'dash-tab': (el) => { ui.dashTab = el.dataset.tab; ui.dashFolder = null; render(); },
    'dash-sort': (el) => { ui.dashSort = el.value; render(); },
    'dash-search': (el) => { ui.boardQuery = el.value; render(); requeryFocus('#dash-search'); },
    'focus-search': () => { ui.sidebarOpen = false; render(); requeryFocus('#dash-search'); },
    folder: (el) => { ui.dashFolder = ui.dashFolder === el.dataset.id ? null : el.dataset.id; ui.dashTab = 'all'; render(); },
    'folder-add': () => {
      const input = document.querySelector('[data-act="folder-input"]');
      const name = input.value.trim();
      if (!name) return;
      db.folders.push({ id: uid('f'), name });
      render(); toast(`'${name}' 폴더를 만들었습니다`);
    },
    fav: (el) => {
      const b = boardById(el.dataset.id);
      b.favorite = !b.favorite;
      render(); toast(b.favorite ? '즐겨찾기에 담았습니다' : '즐겨찾기에서 뺐습니다');
    },
    'new-board': () => openModal(`
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="nb-t">
        <div class="modal-head"><div><h2 id="nb-t">새 패드 만들기</h2><p>이름만 정하면 바로 시작할 수 있어요.</p></div>
          <button class="modal-close" type="button" data-act="close" aria-label="닫기">${I.x}</button></div>
        <div class="modal-body">
          <div class="form-row"><label class="label" for="nb-title">패드 이름</label>
            <input class="field" id="nb-title" name="title" required maxlength="60" placeholder="예: 우리 반 진로 탐색 패드" autofocus /></div>
          <div class="form-row"><label class="label" for="nb-intro">소개 (선택)</label>
            <input class="field" id="nb-intro" name="intro" maxlength="120" placeholder="이 패드에서 무엇을 모을까요?" /></div>
          <div class="form-row"><label class="label" for="nb-scope">공개 범위</label>
            <select class="field" id="nb-scope" name="scope">
              <option value="SCHOOL">학교 공개 — 같은 학교 구성원이 볼 수 있어요</option>
              <option value="PUBLIC">전체 공개 — 링크가 있으면 누구나</option>
              <option value="PRIVATE">비공개 — 초대한 멤버만</option>
            </select></div>
          <div class="form-row"><span class="label">표지 색</span>
            <div class="tint-row" data-tints="coverTint">
              ${['sky', 'mint', 'sun', 'coral', 'violet', 'rose'].map((t, i) =>
                `<button class="tint-dot" type="button" data-tint="${t}" aria-pressed="${i === 0}" aria-label="${t}"></button>`).join('')}
            </div></div>
        </div>
        <div class="modal-foot">
          <button class="btn" type="button" data-act="close">취소</button>
          <button class="btn btn-primary" type="submit">패드 만들기</button>
        </div>
      </form>`, {
      onSubmit: (fd, form) => {
        const title = String(fd.get('title')).trim();
        if (!title) return;
        const tint = form.querySelector('[data-tints] [aria-pressed="true"]').dataset.tint;
        const now = new Date().toISOString();
        const b = {
          id: uid('b'), slug: uid('pad'), title, intro: String(fd.get('intro') || ''),
          ownerId: ui.me, scope: fd.get('scope'), coverTint: tint, layout: 'columns',
          cardSize: 'md', frozen: false, archived: false, favorite: false, folderId: ui.dashFolder,
          allowPost: true, allowUpload: true, allowComment: true, allowReaction: true,
          requireApproval: false, createdAt: now, updatedAt: now,
          members: [{ userId: ui.me, role: 'OWNER' }],
        };
        db.boards.unshift(b);
        db.sections.push({ id: uid('s'), boardId: b.id, title: '첫 번째 섹션', guide: '', order: 0 });
        closeModal(); go('#/b/' + b.slug); toast('패드를 만들었습니다');
      },
    }),
    'board-menu': (el) => {
      const b = boardById(el.dataset.id);
      const owner = b.ownerId === ui.me || me().role === 'SUPER_ADMIN';
      openMenu(el, [
        { text: b.favorite ? '즐겨찾기 해제' : '즐겨찾기', ico: I.star, run: () => ACTIONS.fav(el) },
        { label: '폴더로 이동' },
        ...db.folders.map((f) => ({
          text: (b.folderId === f.id ? '✓ ' : '') + f.name,
          ico: I.folder,
          run: () => { b.folderId = b.folderId === f.id ? null : f.id; render(); toast('폴더를 바꿨습니다'); },
        })),
        { sep: true },
        ...(owner ? [
          { text: b.archived ? '보관 해제' : '보관하기', ico: I.archive,
            run: () => { b.archived = !b.archived; render(); toast(b.archived ? '보관함으로 옮겼습니다' : '보관을 해제했습니다'); } },
          { text: '패드 삭제', ico: I.trash, danger: true, run: () => confirmDeleteBoard(b) },
        ] : []),
      ]);
    },

    /* 보드 */
    'board-search': (el) => { ui.boardQuery = el.value; const pos = el.selectionStart; render(); requeryFocus('[data-act="board-search"]', pos); },
    'sec-tab': (el) => { ui.boardSection = el.dataset.id; render(); },
    share: (el) => {
      const b = boardById(el.dataset.id);
      const url = location.origin + location.pathname + '#/b/' + b.slug;
      navigator.clipboard?.writeText(url).then(() => toast('패드 주소를 복사했습니다')).catch(() => toast(url));
    },
    'new-section': (el) => {
      const bid = el.dataset.id;
      openModal(`
        <form class="modal" role="dialog" aria-modal="true" aria-labelledby="ns-t">
          <div class="modal-head"><div><h2 id="ns-t">새 섹션 열기</h2><p>주제 하나를 새 열로 만듭니다.</p></div>
            <button class="modal-close" type="button" data-act="close" aria-label="닫기">${I.x}</button></div>
          <div class="modal-body">
            <div class="form-row"><label class="label" for="ns-title">섹션 제목</label>
              <input class="field" id="ns-title" name="title" required maxlength="40" placeholder="예: 관심 직업 탐구" autofocus /></div>
            <div class="form-row"><label class="label" for="ns-guide">안내 문구 (선택)</label>
              <input class="field" id="ns-guide" name="guide" maxlength="80" placeholder="이 섹션에 무엇을 적을지 알려주세요" /></div>
          </div>
          <div class="modal-foot"><button class="btn" type="button" data-act="close">취소</button>
            <button class="btn btn-primary" type="submit">섹션 만들기</button></div>
        </form>`, {
        onSubmit: (fd) => {
          const order = sectionsOf(bid).length;
          db.sections.push({ id: uid('s'), boardId: bid, title: String(fd.get('title')).trim(), guide: String(fd.get('guide') || ''), order });
          touch(bid); closeModal(); render(); toast('섹션을 추가했습니다');
        },
      });
    },
    'edit-section': (el) => { /* 더블클릭에서만 동작 — click 위임에서는 무시합니다. */ },
    'section-menu': (el) => {
      const s = db.sections.find((x) => x.id === el.dataset.id);
      openMenu(el, [
        { text: '섹션 수정', ico: I.pencil, run: () => editSection(s) },
        { text: '섹션 삭제', ico: I.trash, danger: true, run: () => {
          const n = postsOf(s.id).length;
          if (!confirm(`'${s.title}' 섹션을 삭제할까요?${n ? `\n안에 있는 카드 ${n}장도 함께 지워집니다.` : ''}`)) return;
          db.posts = db.posts.filter((p) => p.sectionId !== s.id);
          db.sections = db.sections.filter((x) => x.id !== s.id);
          touch(s.boardId); render(); toast('섹션을 삭제했습니다');
        } },
      ]);
    },
    'new-post': (el) => composer(el.dataset.section, null),
    'edit-post': (el) => {
      const p = db.posts.find((x) => x.id === el.dataset.id);
      composer(p.sectionId, p);
    },
    'delete-post': (el) => {
      const p = db.posts.find((x) => x.id === el.dataset.id);
      if (!confirm(`'${p.title}' 카드를 삭제할까요?\n실서비스에서는 30일간 보관함에서 되살릴 수 있습니다.`)) return;
      const b = boardById(p.boardId);
      db.posts = db.posts.filter((x) => x.id !== p.id);
      db.comments = db.comments.filter((c) => c.postId !== p.id);
      touch(p.boardId); go('#/b/' + b.slug); toast('카드를 삭제했습니다');
    },
    'quick-react': (el) => {
      const p = db.posts.find((x) => x.id === el.dataset.id);
      const b = boardById(p.boardId);
      if (!can('react', b)) return toast('이 패드에 반응할 권한이 없습니다');
      toggleReaction(p, '👍'); touch(p.boardId); render();
    },
    react: (el) => {
      const p = db.posts.find((x) => x.id === el.dataset.id);
      const b = boardById(p.boardId);
      if (!can('react', b)) return toast('이 패드에 반응할 권한이 없습니다');
      toggleReaction(p, el.dataset.emoji); touch(p.boardId); render();
    },
    reply: (el) => {
      const parent = db.comments.find((c) => c.id === el.dataset.id);
      const body = prompt(`${user(parent.authorId).name}님에게 답글`, `@${user(parent.authorId).name} `);
      if (!body || !body.trim()) return;
      db.comments.push({ id: uid('c'), postId: el.dataset.post, authorId: ui.me, parentId: parent.id, body: body.trim(), createdAt: new Date().toISOString() });
      render(); toast('답글을 남겼습니다');
    },
    'delete-comment': (el) => {
      const c = db.comments.find((x) => x.id === el.dataset.id);
      if (!confirm('댓글을 삭제할까요?')) return;
      db.comments = db.comments.filter((x) => x.id !== c.id && x.parentId !== c.id);
      render(); toast('댓글을 삭제했습니다');
    },
    settings: (el) => settingsDrawer(boardById(el.dataset.id), 'basic'),
    close: () => closeModal(),

    /* 관리자 */
    'admin-tab': (el) => { ui.adminTab = el.dataset.id; ui.adminPage = 1; render(); },
    'admin-search': (el) => { ui.adminQuery = el.value; ui.adminPage = 1; const pos = el.selectionStart; render(); requeryFocus('[data-act="admin-search"]', pos); },
    'admin-clear': () => { ui.adminQuery = ''; render(); },
    'admin-role': (el) => { ui.adminRole = el.value; ui.adminPage = 1; render(); },
    'admin-status': (el) => { ui.adminStatus = el.value; ui.adminPage = 1; render(); },
    'admin-page': (el) => { ui.adminPage = Math.max(1, +el.dataset.p); render(); },
    'set-role': (el) => {
      const u = user(el.dataset.id);
      const reason = prompt(`${u.name}님의 권한을 '${acctLabel[el.value]}'(으)로 바꿉니다.\n사유를 남겨주세요(감사 로그에 기록됩니다).`, '');
      if (reason === null) return render();
      u.role = el.value;
      logAudit('권한 변경', `${u.name} · ${acctLabel[el.value]}`, reason || '(사유 없음)');
      render(); toast(`${u.name}님의 권한을 바꿨습니다`);
    },
    'set-status': (el) => {
      const u = user(el.dataset.id);
      const reason = prompt(`${u.name}님의 상태를 '${statusLabel[el.value]}'(으)로 바꿉니다.\n사유를 남겨주세요.`, '');
      if (reason === null) return render();
      u.status = el.value;
      logAudit(el.value === 'SUSPENDED' ? '계정 정지' : '계정 활성', u.name, reason || '(사유 없음)');
      render(); toast(`${u.name}님을 ${statusLabel[el.value]} 처리했습니다`);
    },
    'set-school': (el) => {
      const u = user(el.dataset.id);
      u.schoolId = el.value;
      u.group = (school(el.value).groups[0]) || '';
      logAudit('소속 변경', `${u.name} · ${school(el.value).name}`, '관리자 직접 변경');
      render();
    },
    'set-group': (el) => {
      const u = user(el.dataset.id);
      const before = u.group;
      u.group = el.value;
      logAudit('소속 변경', `${u.name} · ${before} → ${el.value}`, '관리자 직접 변경');
      render();
    },
    'user-menu': (el) => {
      const u = user(el.dataset.id);
      openMenu(el, [
        { text: '비밀번호 초기화', ico: I.shield, run: () => {
          const reason = prompt(`${u.name}님의 비밀번호를 초기화합니다.\n사유를 남겨주세요.`, '본인 요청');
          if (reason === null) return;
          logAudit('비밀번호 초기화', u.name, reason || '(사유 없음)');
          render(); toast('임시 비밀번호를 발급했습니다 (데모)');
        } },
        { text: '모든 세션 로그아웃', ico: I.logout, run: () => {
          logAudit('세션 강제 종료', u.name, '관리자 조치');
          render(); toast(`${u.name}님의 세션을 모두 끊었습니다`);
        } },
        { sep: true },
        { text: '계정 삭제', ico: I.trash, danger: true, run: () => {
          if (u.id === ui.me) return toast('지금 보고 있는 계정은 지울 수 없습니다');
          if (!confirm(`${u.name}님의 계정을 삭제할까요?`)) return;
          db.users = db.users.filter((x) => x.id !== u.id);
          db.boards.forEach((b) => { b.members = b.members.filter((m) => m.userId !== u.id); });
          logAudit('계정 삭제', u.name, '관리자 조치');
          render(); toast('계정을 삭제했습니다');
        } },
      ]);
    },
    approve: (el) => {
      const a = db.approvals.find((x) => x.id === el.dataset.id);
      db.users.push({ id: uid('u'), name: a.name, initial: a.initial, tint: a.tint, loginId: a.loginId,
        role: 'TEACHER', schoolId: a.schoolId, group: a.group, status: 'ACTIVE', joinedAt: new Date().toISOString() });
      db.approvals = db.approvals.filter((x) => x.id !== a.id);
      logAudit('교사 승인', a.name, '가입 요청 승인');
      render(); toast(`${a.name}님을 승인했습니다`);
    },
    reject: (el) => {
      const a = db.approvals.find((x) => x.id === el.dataset.id);
      const reason = prompt(`${a.name}님의 가입 요청을 반려합니다.\n사유를 남겨주세요.`, '');
      if (reason === null) return;
      db.approvals = db.approvals.filter((x) => x.id !== a.id);
      logAudit('교사 반려', a.name, reason || '(사유 없음)');
      render(); toast('요청을 반려했습니다');
    },
    'add-group': (el) => {
      const s = school(el.dataset.id);
      const name = prompt(`${s.name}에 추가할 반·부서 이름`, '');
      if (!name || !name.trim()) return;
      s.groups.push(name.trim()); render(); toast('반·부서를 추가했습니다');
    },
    'del-group': (el) => {
      const s = school(el.dataset.school);
      const g = el.dataset.group;
      if (db.users.some((u) => u.schoolId === s.id && u.group === g)) return toast('이 소속에 속한 구성원이 있어 지울 수 없습니다');
      s.groups = s.groups.filter((x) => x !== g); render();
    },
    'add-school': () => {
      const name = prompt('학교 이름', '');
      if (!name || !name.trim()) return;
      db.schools.push({ id: uid('sc'), name: name.trim(), groups: ['1학년부'] });
      render(); toast('학교를 추가했습니다');
    },

    reset: () => { if (confirm('데모 데이터를 처음 상태로 되돌릴까요?\n지금까지 만든 카드와 설정이 모두 사라집니다.')) reset(); },
  };

  function toggleReaction(p, emoji) {
    const arr = p.reactions[emoji] || (p.reactions[emoji] = []);
    const i = arr.indexOf(ui.me);
    if (i >= 0) arr.splice(i, 1); else arr.push(ui.me);
    if (!arr.length) delete p.reactions[emoji];
  }

  function requeryFocus(sel, pos) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.focus();
    if (pos != null && el.setSelectionRange) { try { el.setSelectionRange(pos, pos); } catch { /* search 타입은 무시 */ } }
    else { const v = el.value; el.value = ''; el.value = v; }
  }

  function confirmDeleteBoard(b) {
    if (!confirm(`'${b.title}' 패드를 삭제할까요?\n안에 있는 섹션 ${sectionsOf(b.id).length}개와 카드 ${db.posts.filter((p) => p.boardId === b.id).length}장이 함께 지워집니다.`)) return;
    db.posts.filter((p) => p.boardId === b.id).forEach((p) => { db.comments = db.comments.filter((c) => c.postId !== p.id); });
    db.posts = db.posts.filter((p) => p.boardId !== b.id);
    db.sections = db.sections.filter((s) => s.boardId !== b.id);
    db.boards = db.boards.filter((x) => x.id !== b.id);
    logAudit('패드 삭제', b.title, '소유자 삭제');
    go('#/'); render(); toast('패드를 삭제했습니다');
  }

  function editSection(s) {
    openModal(`
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="es-t">
        <div class="modal-head"><div><h2 id="es-t">섹션 수정</h2><p>제목과 안내 문구를 바꿉니다.</p></div>
          <button class="modal-close" type="button" data-act="close" aria-label="닫기">${I.x}</button></div>
        <div class="modal-body">
          <div class="form-row"><label class="label" for="es-title">섹션 제목</label>
            <input class="field" id="es-title" name="title" required maxlength="40" value="${esc(s.title)}" autofocus /></div>
          <div class="form-row"><label class="label" for="es-guide">안내 문구</label>
            <input class="field" id="es-guide" name="guide" maxlength="80" value="${esc(s.guide)}" /></div>
        </div>
        <div class="modal-foot"><button class="btn" type="button" data-act="close">취소</button>
          <button class="btn btn-primary" type="submit">저장</button></div>
      </form>`, {
      onSubmit: (fd) => {
        s.title = String(fd.get('title')).trim();
        s.guide = String(fd.get('guide') || '');
        touch(s.boardId); closeModal(); render(); toast('섹션을 수정했습니다');
      },
    });
  }

  /* 카드 작성·수정 모달 */
  function composer(sectionId, post) {
    const sec = db.sections.find((s) => s.id === sectionId);
    const b = boardById(sec.boardId);
    const tints = ['none', 'mint', 'sun', 'sky', 'coral', 'violet', 'rose'];
    const cur = post ? post.tint : 'none';
    openModal(`
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="cp-t">
        <div class="modal-head">
          <div><h2 id="cp-t">${post ? '카드 수정' : '새로운 생각 나누기'}</h2>
            <p>${esc(sec.title)}에 ${post ? '쓴 글을 고칩니다.' : '글을 추가해요.'}</p></div>
          <button class="modal-close" type="button" data-act="close" aria-label="닫기">${I.x}</button>
        </div>
        <div class="modal-body">
          <div class="callout">${I.sparkle} 작성 내용은 이 브라우저에 자동 저장됩니다.</div>
          <div class="form-row"><label class="label" for="cp-title">제목</label>
            <input class="field" id="cp-title" name="title" required maxlength="80" value="${post ? esc(post.title) : ''}" placeholder="한눈에 들어오는 제목" autofocus /></div>
          <div class="form-row"><label class="label" for="cp-body">내용</label>
            <textarea class="field" id="cp-body" name="body" rows="6" maxlength="2000" placeholder="무엇을 발견했나요?">${post ? esc(post.body) : ''}</textarea>
            <p class="hint">**굵게** 를 쓸 수 있어요.</p></div>
          <div class="form-row"><span class="label">카드 색</span>
            <div class="tint-row" data-tints="tint">
              ${tints.map((t) => `<button class="tint-dot" type="button" data-tint="${t}" aria-pressed="${cur === t}" aria-label="${t === 'none' ? '색 없음' : t}"></button>`).join('')}
            </div></div>
          <div class="form-row"><span class="label">첨부</span>
            <div class="dropzone">
              <span class="dropzone-ico">${I.clip}</span>
              <div><b>클릭하거나 파일을 끌어놓으세요</b>
                <small>이미지는 WebP 최적화 · 영상·음성 재생 지원 · 최대 30MB</small></div>
            </div>
            <p class="hint">정적 데모라 실제 업로드는 되지 않습니다. 대신 아래에서 썸네일 색을 골라 결과를 볼 수 있어요.</p>
            <div class="tint-row" data-tints="thumbTint" style="margin-top:8px">
              ${['none', 'sky', 'mint', 'sun', 'coral', 'violet'].map((t) =>
                `<button class="tint-dot" type="button" data-tint="${t}" aria-pressed="${(post && post.thumbTint ? post.thumbTint : 'none') === t}" aria-label="${t === 'none' ? '썸네일 없음' : t}"></button>`).join('')}
            </div>
          </div>
          <div class="form-row"><label class="label" for="cp-link">링크 첨부</label>
            <input class="field" id="cp-link" name="link" type="url" placeholder="https://example.com/article" value="${post && post.links[0] ? esc(post.links[0].url) : ''}" />
            <p class="hint">실서비스는 제목·대표 이미지를 자동으로 가져옵니다. 여기서는 도메인만 표시해요.</p></div>
          ${can('section', b) ? `
          <div class="form-row"><label class="setting" style="border:0;padding:0;cursor:pointer">
            <span class="setting-text"><b>맨 위에 고정</b><small>고정한 글은 섹션 맨 앞에 남습니다.</small></span>
            <input type="checkbox" name="pinned" ${post && post.pinned ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--green)" />
          </label></div>` : ''}
        </div>
        <div class="modal-foot">
          ${post ? `<button class="btn btn-danger spacer" type="button" data-act="delete-post" data-id="${post.id}">${I.trash} 삭제</button>` : ''}
          <button class="btn" type="button" data-act="close">취소</button>
          <button class="btn btn-primary" type="submit">${post ? '저장' : '올리기'}</button>
        </div>
      </form>`, {
      onSubmit: (fd, form) => {
        const title = String(fd.get('title')).trim();
        if (!title) return;
        const tint = form.querySelector('[data-tints="tint"] [aria-pressed="true"]').dataset.tint;
        const thumbRaw = form.querySelector('[data-tints="thumbTint"] [aria-pressed="true"]').dataset.tint;
        const thumbTint = thumbRaw === 'none' ? null : thumbRaw;
        const linkUrl = String(fd.get('link') || '').trim();
        let links = [];
        if (linkUrl) {
          let host = linkUrl;
          try { host = new URL(linkUrl).hostname.replace(/^www\./, ''); } catch { /* 형식이 아니면 원문 표시 */ }
          links = [{ url: linkUrl, title: title, site: host }];
        }
        const pinned = !!fd.get('pinned');

        if (post) {
          Object.assign(post, { title, body: String(fd.get('body') || ''), tint, thumbTint, links, pinned });
          toast('카드를 저장했습니다');
        } else {
          db.posts.push({
            id: uid('p'), boardId: sec.boardId, sectionId, authorId: ui.me,
            order: postsOf(sectionId).length, pinned, tint, title,
            body: String(fd.get('body') || ''), thumbTint, links,
            createdAt: new Date().toISOString(), reactions: {},
          });
          toast('카드를 올렸습니다');
        }
        touch(sec.boardId); closeModal(); render();
      },
    });
  }

  /* 패드 설정 드로어 — 실서비스의 7개 탭 구성을 그대로 따릅니다. */
  const SETTING_TABS = [
    { id: 'basic', name: '기본 정보', sub: '패드 이름, 소개, 배경' },
    { id: 'share', name: '공개·공유', sub: '범위, 비밀번호, 초대' },
    { id: 'look', name: '외형', sub: '레이아웃, 색상, 글꼴' },
    { id: 'fields', name: '게시물 필드', sub: '질문과 작성 항목' },
    { id: 'join', name: '참여·첨부', sub: '권한, 반응, 다운로드' },
    { id: 'approve', name: '승인·동결', sub: '게시 승인, 패드 동결' },
    { id: 'members', name: '멤버', sub: '역할 관리와 멤버 추가' },
  ];

  function settingsDrawer(b, tab) {
    openDrawer(`
      <div class="drawer-head">
        <div><h2>패드 설정</h2><p>기능별로 묶은 탭에서 원하는 설정을 찾아 바꿔보세요.</p></div>
        <button class="modal-close" type="button" data-act="close" aria-label="닫기">${I.x}</button>
      </div>
      <div class="drawer-cols">
        <div class="drawer-tabs" role="tablist" aria-label="설정 탭">
          ${SETTING_TABS.map((t) => `
            <button class="drawer-tab" role="tab" aria-selected="${tab === t.id}" data-act="settings-tab" data-id="${b.id}" data-tab="${t.id}">
              <span><b>${t.name}</b><small>${t.sub}</small></span>
            </button>`).join('')}
        </div>
        <div class="drawer-panel" role="tabpanel">${settingsPanel(b, tab)}</div>
      </div>
      <div class="drawer-foot">저장 버튼이 없는 항목은 자동으로 저장됩니다.</div>`);
  }

  function settingsPanel(b, tab) {
    const S = (title, sub, ctl) => `
      <div class="setting"><div class="setting-text"><b>${title}</b><small>${sub}</small></div>
        <div class="setting-ctl">${ctl}</div></div>`;
    const sw = (key, on) => `<button class="switch" role="switch" aria-checked="${on}" data-act="set-flag" data-id="${b.id}" data-key="${key}" aria-label="${key}"></button>`;

    if (tab === 'basic') return `
      <div class="form-row"><label class="label" for="st-title">패드 이름</label>
        <input class="field" id="st-title" value="${esc(b.title)}" data-act="set-text" data-id="${b.id}" data-key="title" /></div>
      <div class="form-row"><label class="label" for="st-intro">소개</label>
        <textarea class="field" id="st-intro" rows="3" data-act="set-text" data-id="${b.id}" data-key="intro">${esc(b.intro)}</textarea></div>
      <div class="form-row"><span class="label">배경(표지) 색</span>
        <div class="tint-row">
          ${['sky', 'mint', 'sun', 'coral', 'violet', 'rose'].map((t) =>
            `<button class="tint-dot" type="button" data-tint="${t}" aria-pressed="${b.coverTint === t}" data-act="set-cover" data-id="${b.id}" data-value="${t}" aria-label="${t}"></button>`).join('')}
        </div>
        <p class="hint">이 색은 패드 안 배경이자 내 패드 목록의 카드 표지로 함께 쓰입니다.</p></div>`;

    if (tab === 'share') return `
      <div class="form-row"><label class="label" for="st-scope">공개 범위</label>
        <select class="field" id="st-scope" data-act="set-text" data-id="${b.id}" data-key="scope">
          ${Object.entries(scopeLabel).map(([k, v]) => `<option value="${k}" ${b.scope === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
      ${S('링크 공유', '주소를 아는 사람이 들어올 수 있게 합니다.', `<button class="btn btn-sm" data-act="share" data-id="${b.id}">${I.share} 주소 복사</button>`)}
      ${S('초대 링크', '실서비스는 해시로 저장된 1회용 초대 링크를 만듭니다.', `<button class="btn btn-sm" data-act="invite" data-id="${b.id}">초대 링크 만들기</button>`)}`;

    if (tab === 'look') return `
      ${S('레이아웃', '같은 자료를 수업 방식에 맞춰 다시 배치합니다.', `
        <div class="seg">
          ${['columns', 'grid', 'feed'].map((l) => `<button data-act="set-layout" data-id="${b.id}" data-value="${l}" aria-pressed="${b.layout === l}">${layoutLabel[l]}</button>`).join('')}
        </div>`)}
      ${S('카드 크기', '한 화면에 보이는 정보량이 달라집니다.', `
        <div class="seg">
          ${[['sm', '작게'], ['md', '보통'], ['lg', '크게']].map(([v, n]) => `<button data-act="set-size" data-id="${b.id}" data-value="${v}" aria-pressed="${b.cardSize === v}">${n}</button>`).join('')}
        </div>`)}
      <p class="hint" style="margin-top:14px">실서비스는 담벼락·격자·피드·타임라인·표·열 6종을 제공합니다. 데모에는 열·격자·피드만 담았습니다.</p>`;

    if (tab === 'fields') return `
      <div class="empty" style="padding:34px 10px">
        <div class="empty-icon">${I.file}</div>
        <b>게시물 필드</b>
        <p>작성 창에 나타날 질문을 직접 만드는 탭입니다.<br />데모에는 제목·내용·첨부·링크 기본 필드만 들어 있습니다.</p>
      </div>`;

    if (tab === 'join') return `
      ${S('멤버 글쓰기', '끄면 소유자·관리자만 카드를 올릴 수 있습니다.', sw('allowPost', b.allowPost))}
      ${S('파일 업로드', '이미지·문서 첨부를 허용합니다.', sw('allowUpload', b.allowUpload))}
      ${S('댓글', '카드에 댓글과 답글을 남길 수 있습니다.', sw('allowComment', b.allowComment))}
      ${S('이모지 반응', '카드에 반응을 남길 수 있습니다.', sw('allowReaction', b.allowReaction))}`;

    if (tab === 'approve') return `
      ${S('게시 승인', '켜면 학생이 올린 카드가 승인 대기 상태로 들어갑니다.', sw('requireApproval', b.requireApproval))}
      ${S('패드 동결', '켜면 아무도 새 글을 쓰거나 고칠 수 없습니다.', sw('frozen', b.frozen))}
      ${S('패드 삭제', '섹션과 카드가 함께 지워집니다.', `<button class="btn btn-sm btn-danger" data-act="delete-board" data-id="${b.id}">${I.trash} 패드 삭제</button>`)}`;

    /* members */
    const candidates = db.users.filter((u) => !b.members.some((m) => m.userId === u.id));
    return `
      <h3 style="margin:0 0 10px;font-size:.9rem;font-weight:800">${I.users} 참여 멤버 <span style="color:var(--muted);font-weight:600">${b.members.length}명</span></h3>
      ${b.members.map((m) => {
        const u = user(m.userId);
        return `<div class="member-row">
          ${avatar(u)}
          <div class="member-name"><b>${esc(u.name)}</b><small>${esc(maskId(u.loginId))}</small></div>
          <select class="field" style="width:auto;min-height:34px;height:34px;font-size:.82rem" data-act="set-member-role" data-id="${b.id}" data-user="${u.id}" ${m.role === 'OWNER' ? 'disabled' : ''} aria-label="${esc(u.name)} 역할">
            ${Object.entries(roleLabel).map(([k, v]) => `<option value="${k}" ${m.role === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          ${m.role === 'OWNER' ? '' : `<button class="icon-btn" data-act="remove-member" data-id="${b.id}" data-user="${u.id}" aria-label="${esc(u.name)} 내보내기">${I.x}</button>`}
        </div>`;
      }).join('')}
      <h3 style="margin:18px 0 10px;font-size:.9rem;font-weight:800">멤버 추가</h3>
      ${candidates.length ? candidates.map((u) => `
        <div class="member-row">
          ${avatar(u)}
          <div class="member-name"><b>${esc(u.name)}</b><small>${esc((school(u.schoolId) || {}).name || '')} ${esc(u.group)}</small></div>
          <button class="btn btn-sm" data-act="add-member" data-id="${b.id}" data-user="${u.id}">${I.plus} 추가</button>
        </div>`).join('') : '<p class="hint">추가할 수 있는 구성원이 없습니다.</p>'}`;
  }

  /* 설정 드로어 전용 액션 */
  Object.assign(ACTIONS, {
    'settings-tab': (el) => settingsDrawer(boardById(el.dataset.id), el.dataset.tab),
    'set-flag': (el) => {
      const b = boardById(el.dataset.id);
      const key = el.dataset.key;
      b[key] = !b[key];
      touch(b.id);
      const tab = document.querySelector('.drawer-tab[aria-selected="true"]');
      settingsDrawer(b, tab ? tab.dataset.tab : 'join');
      render2();
      toast(b[key] ? '켰습니다' : '껐습니다');
    },
    'set-text': (el) => {
      const b = boardById(el.dataset.id);
      b[el.dataset.key] = el.value;
      touch(b.id); render2();
    },
    'set-cover': (el) => {
      const b = boardById(el.dataset.id);
      b.coverTint = el.dataset.value;
      touch(b.id); settingsDrawer(b, 'basic'); render2();
    },
    'set-layout': (el) => {
      const b = boardById(el.dataset.id);
      b.layout = el.dataset.value;
      touch(b.id); settingsDrawer(b, 'look'); render2(); toast(`레이아웃을 '${layoutLabel[b.layout]}'으로 바꿨습니다`);
    },
    'set-size': (el) => {
      const b = boardById(el.dataset.id);
      b.cardSize = el.dataset.value;
      touch(b.id); settingsDrawer(b, 'look'); render2();
    },
    'set-member-role': (el) => {
      const b = boardById(el.dataset.id);
      const m = b.members.find((x) => x.userId === el.dataset.user);
      m.role = el.value;
      touch(b.id); settingsDrawer(b, 'members'); render2(); toast('역할을 바꿨습니다');
    },
    'remove-member': (el) => {
      const b = boardById(el.dataset.id);
      b.members = b.members.filter((m) => m.userId !== el.dataset.user);
      touch(b.id); settingsDrawer(b, 'members'); render2(); toast('멤버를 내보냈습니다');
    },
    'add-member': (el) => {
      const b = boardById(el.dataset.id);
      b.members.push({ userId: el.dataset.user, role: 'MEMBER' });
      touch(b.id); settingsDrawer(b, 'members'); render2(); toast('멤버를 추가했습니다');
    },
    'delete-board': (el) => { const b = boardById(el.dataset.id); closeModal(); confirmDeleteBoard(b); },
    invite: () => toast('초대 링크를 만들었습니다 (데모라 실제 링크는 없습니다)'),
  });

  /* 드로어를 유지한 채 뒤쪽 화면만 다시 그립니다. */
  function render2() {
    const drawer = $('#drawer');
    const back = $('#drawer-backdrop');
    if (drawer) drawer.remove();
    if (back) back.remove();
    const r = parseRoute();
    const app = $('#app');
    if (r.name === 'board') app.innerHTML = shell(viewBoard(r), 'board');
    else if (r.name === 'dash') app.innerHTML = shell(viewDash(), 'dash');
    save();
    if (back) document.body.appendChild(back);
    if (drawer) document.body.appendChild(drawer);
  }

  /* ── 이벤트 위임 ──────────────────────────────────────── */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) { closeMenu(); return; }
    const act = el.dataset.act;
    if (['dash-search', 'board-search', 'admin-search', 'folder-input', 'set-text'].includes(act)) return;
    if (el.tagName === 'SELECT') return;

    // tint-dot 은 그룹 안에서 하나만 눌린 상태로 만듭니다.
    if (el.classList.contains('tint-dot') && el.closest('[data-tints]') && !el.dataset.act) {
      el.closest('[data-tints]').querySelectorAll('.tint-dot').forEach((d) => d.setAttribute('aria-pressed', String(d === el)));
      return;
    }
    const fn = ACTIONS[act];
    if (!fn) return;
    e.preventDefault();
    if (act !== 'notif' && act !== 'board-menu' && act !== 'section-menu' && act !== 'user-menu') closeMenu();
    fn(el, e);
  });

  // tint-dot 중 data-act가 있는 것(설정 드로어)은 위 위임에서 처리되므로 여기서는 순수 폼용만 처리합니다.
  document.addEventListener('click', (e) => {
    const dot = e.target.closest('.tint-dot');
    if (!dot || dot.dataset.act) return;
    const group = dot.closest('[data-tints]');
    if (!group) return;
    group.querySelectorAll('.tint-dot').forEach((d) => d.setAttribute('aria-pressed', String(d === dot)));
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn && (el.tagName === 'SELECT')) fn(el, e);
  });

  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'set-text') { clearTimeout(el._t); el._t = setTimeout(() => ACTIONS['set-text'](el), 400); }
  });

  // 검색은 Enter 또는 blur에서만 다시 그려서 타이핑이 끊기지 않게 합니다.
  document.addEventListener('keydown', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && e.key === 'Enter') {
      const act = el.dataset.act;
      if (act === 'dash-search' || act === 'board-search' || act === 'admin-search') { e.preventDefault(); ACTIONS[act](el); return; }
      if (act === 'folder-input') { e.preventDefault(); ACTIONS['folder-add'](el); return; }
    }
    if (e.key === 'Escape') { closeMenu(); closeModal(); }
  });

  document.addEventListener('dblclick', (e) => {
    const el = e.target.closest('[data-act="edit-section"]');
    if (!el) return;
    editSection(db.sections.find((s) => s.id === el.dataset.id));
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-act="comment-form"]');
    if (!form) return;
    e.preventDefault();
    const ta = form.querySelector('textarea');
    const body = ta.value.trim();
    if (!body) return;
    db.comments.push({ id: uid('c'), postId: form.dataset.post, authorId: ui.me, parentId: null, body, createdAt: new Date().toISOString() });
    render(); toast('댓글을 남겼습니다');
  });

  // 카드/보드 카드에 role="button" 을 준 곳의 키보드 지원
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[role="button"][data-act]');
    if (!el) return;
    if (e.target.closest('button') !== null && e.target.closest('button') !== el) return;
    e.preventDefault();
    ACTIONS[el.dataset.act](el, e);
  });

  /* ── 드래그 정렬 (카드 · 섹션) ────────────────────────────
     활성화 규칙은 앱과 같습니다: 마우스는 4px 이동, 터치는 150ms 유지.
     터치는 손잡이에서만 시작해 보드 스크롤과 섞이지 않게 합니다. */
  let drag = null, armed = null;

  function beginDrag(kind, el, x, y) {
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    document.body.appendChild(ghost);

    const ph = document.createElement(kind === 'post' ? 'li' : 'div');
    ph.className = kind === 'post' ? 'post-ph' : 'section-ph';
    ph.style.height = rect.height + 'px';
    if (kind === 'section') ph.style.flex = '0 0 ' + rect.width + 'px';
    el.after(ph);
    el.classList.add('dragging-src');
    el.style.display = 'none';

    drag = { kind, el, ghost, ph, dx: x - rect.left, dy: y - rect.top };
    document.body.classList.add('dragging');
  }

  function moveDrag(x, y) {
    drag.ghost.style.left = (x - drag.dx) + 'px';
    drag.ghost.style.top = (y - drag.dy) + 'px';

    if (drag.kind === 'post') {
      const lists = [...document.querySelectorAll('[data-list]')];
      if (!lists.length) return;
      let best = null, bd = Infinity;
      for (const l of lists) {
        const r = l.getBoundingClientRect();
        const ddx = Math.max(r.left - x, 0, x - r.right);
        const ddy = Math.max(r.top - y, 0, y - r.bottom);
        const d = ddx * ddx + ddy * ddy;
        if (d < bd) { bd = d; best = l; }
      }
      let before = null;
      for (const c of best.querySelectorAll('.post:not(.dragging-src)')) {
        const r = c.getBoundingClientRect();
        if (y < r.top + r.height / 2) { before = c; break; }
      }
      best.insertBefore(drag.ph, before);
      document.querySelectorAll('.section').forEach((s) => s.classList.toggle('drop-target', s.contains(best)));
    } else {
      const cols = $('#board-cols');
      if (!cols) return;
      let before = null;
      for (const c of cols.querySelectorAll('.section:not(.dragging-src)')) {
        const r = c.getBoundingClientRect();
        if (x < r.left + r.width / 2) { before = c; break; }
      }
      cols.insertBefore(drag.ph, before);
    }
  }

  function endDrag() {
    if (!drag) return;
    const { kind, el, ghost, ph } = drag;
    ph.replaceWith(el);
    el.style.display = '';
    el.classList.remove('dragging-src');
    ghost.remove();
    document.body.classList.remove('dragging');
    document.querySelectorAll('.section').forEach((s) => s.classList.remove('drop-target'));
    drag = null;

    if (kind === 'post') {
      const list = el.closest('[data-list]');
      const p = db.posts.find((x) => x.id === el.dataset.post);
      p.sectionId = list.dataset.list;
      [...list.querySelectorAll('.post')].forEach((node, i) => {
        const q = db.posts.find((x) => x.id === node.dataset.post);
        if (q) q.order = i;
      });
      touch(p.boardId);
      toast(`'${db.sections.find((s) => s.id === p.sectionId).title}'으로 옮겼습니다`);
    } else {
      [...document.querySelectorAll('#board-cols .section')].forEach((node, i) => {
        const s = db.sections.find((x) => x.id === node.dataset.section);
        if (s) s.order = i;
      });
      const bid = $('#board-cols').dataset.board;
      touch(bid);
      toast('섹션 순서를 바꿨습니다');
    }
    render();
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag) return;
    const grip = e.target.closest('[data-act="post-grip"], [data-act="sec-grip"]');
    const card = e.target.closest('.post');
    const kind = grip ? (grip.dataset.act === 'sec-grip' ? 'section' : 'post') : 'post';
    const el = grip ? (kind === 'section' ? grip.closest('.section') : grip.closest('.post')) : card;
    if (!el) return;
    // 터치는 손잡이에서만. 카드 본문 터치는 스크롤·열기여야 합니다.
    if (e.pointerType !== 'mouse' && !grip) return;
    if (e.pointerType === 'mouse' && !grip && e.target.closest('button')) return;

    armed = { kind, el, x: e.clientX, y: e.clientY, id: e.pointerId, timer: 0 };
    if (e.pointerType !== 'mouse') {
      armed.timer = setTimeout(() => { if (armed) { beginDrag(armed.kind, armed.el, armed.x, armed.y); armed = null; } }, 150);
      e.preventDefault();
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (drag) { e.preventDefault(); moveDrag(e.clientX, e.clientY); return; }
    if (!armed || e.pointerId !== armed.id) return;
    const moved = Math.hypot(e.clientX - armed.x, e.clientY - armed.y);
    if (e.pointerType === 'mouse') {
      if (moved > 4) { beginDrag(armed.kind, armed.el, e.clientX, e.clientY); armed = null; }
    } else if (moved > 12) { clearTimeout(armed.timer); armed = null; }
  }, { passive: false });

  const dropAll = () => { if (armed) { clearTimeout(armed.timer); armed = null; } endDrag(); };
  window.addEventListener('pointerup', dropAll);
  window.addEventListener('pointercancel', dropAll);

  // 드래그 직후의 click 이 카드 열기로 이어지지 않게 막습니다.
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('dragging')) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ── 시작 ─────────────────────────────────────────────── */
  window.addEventListener('hashchange', () => { ui.sidebarOpen = false; render(); window.scrollTo(0, 0); });

  document.getElementById('demo-reset').addEventListener('click', () => ACTIONS.reset());

  load();
  applyRoleParam();
  render();
})();
