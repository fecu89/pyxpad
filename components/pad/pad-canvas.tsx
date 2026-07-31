"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Activity, Archive, ArchiveRestore, Check, ChevronLeft, Download, Globe2, LayoutGrid, LoaderCircle, LockKeyhole, Plus, Search, Settings2, Share2, Snowflake, Sparkles, Star, Wifi, WifiOff } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Modal } from "@/components/ui/modal";
import { PadMoreMenu, type PadMoreMenuItem } from "@/components/pad/pad-more-menu";
import { PostCard } from "@/components/pad/post-card";
import { PostComposer } from "@/components/pad/post-composer";
import { PadLayoutRenderer } from "@/components/pad/layouts/pad-layout-renderer";
import { createPostFieldTableColumns } from "@/components/pad/settings/post-field-table-columns";
import type { PadPresentationSettings, PostFieldValues } from "@/components/pad/settings/types";
import type { ParticipationSettings } from "@/components/pad/settings/pad-settings-tabs";
import { usePadEvents } from "@/components/pad/use-pad-events";
import type { PadInitialData, PostData, SectionData } from "@/components/pad/types";
import type { BoardEvent } from "@/lib/realtime/board-events";
import { requestJson } from "@/lib/api-client";

// 잘 안 열리는 보관함·활동·공유·내보내기·설정 패널과, SECTIONS 레이아웃(드래그 정렬)
// 전용인 @dnd-kit 기반 보드를 지연 로드로 바꿔 최초 로드 JS를 줄입니다. Turbopack 프로덕션
// 빌드에서는 이 분리가 무시되고 부모 청크로 다시 합쳐지는 걸 확인했지만(debug.md), webpack
// 빌드에서는 실제로 분리됩니다 — 두 빌드 모두에서 손해가 없고 webpack에서는 이득이 있어 유지합니다.
const PadTrash = dynamic(() => import("@/components/pad/pad-trash").then((mod) => mod.PadTrash), { ssr: false });
const PadActivityPanel = dynamic(() => import("@/components/pad/pad-activity-panel").then((mod) => mod.PadActivityPanel), { ssr: false });
const PadSharePanel = dynamic(() => import("@/components/pad/pad-share-panel").then((mod) => mod.PadSharePanel), { ssr: false });
const PadExportPanel = dynamic(() => import("@/components/pad/pad-export-panel").then((mod) => mod.PadExportPanel), { ssr: false });
const PadSettingsTabs = dynamic(() => import("@/components/pad/settings/pad-settings-tabs").then((mod) => mod.PadSettingsTabs), { ssr: false });
const SectionsBoardView = dynamic(() => import("@/components/pad/pad-sections-board").then((mod) => mod.SectionsBoardView), { ssr: false });
const FlatDragBoardView = dynamic(() => import("@/components/pad/pad-flat-board").then((mod) => mod.FlatDragBoardView), { ssr: false });

const discoveryScopeLabel = { PUBLIC: "전체 공개", LINK: "링크 공개", PRIVATE: "비공개" };

// freezeAt 예약 시각이 지나면 board.state는 그대로 ACTIVE지만 서버는 이미 쓰기를 막으므로,
// 화면 표시도 같은 기준(상태 또는 예약 시각 경과)으로 판단해야 안내가 실제 동작과 어긋나지 않습니다.
function isFrozenNow(board: { state: string; freezeAt: string | null }): boolean {
  return board.state === "FROZEN" || Boolean(board.freezeAt && new Date(board.freezeAt).getTime() <= Date.now());
}

function toLocalDateTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function participationSettings(board: PadInitialData["board"]): ParticipationSettings {
  return {
    allowMemberPosting: board.allowMemberPosting,
    allowMemberFileUpload: board.allowMemberFileUpload,
    allowComments: board.allowComments,
    allowReactions: board.allowReactions,
  };
}

function presentationSettings(board: PadInitialData["board"]): PadPresentationSettings {
  return {
    layout: board.layout,
    sortMode: board.sortMode,
    newPostPlacement: board.newPostPlacement,
    cardSize: board.cardSize,
    font: board.font,
    backgroundColor: board.backgroundColor,
    backgroundImageUrl: board.backgroundImageUrl,
    accentColor: board.accentColor,
    showAuthor: board.showAuthor,
    showTimestamp: board.showTimestamp,
  };
}

const safeBackgroundPathPattern = /^\/api\/boards\/[a-z0-9-]+\/background-image\?v=\d+$/i;

function boardPageStyle(appearance: PadPresentationSettings): CSSProperties {
  return {
    "--board-page-background": appearance.backgroundColor ?? undefined,
    "--board-page-background-image": appearance.backgroundImageUrl && safeBackgroundPathPattern.test(appearance.backgroundImageUrl)
      ? `url("${appearance.backgroundImageUrl}")`
      : undefined,
  } as CSSProperties;
}

function readPostFieldValues(post: PostData): PostFieldValues {
  if (!post.customFieldValues) return {};
  return Object.fromEntries(Object.entries(post.customFieldValues.fields).map(([id, stored]) => [id, stored.value]));
}

export function PadCanvas({ initialData, currentUserId }: { initialData: PadInitialData; currentUserId: string | null }) {
  const { board, capabilities } = initialData;
  const router = useRouter();
  const [localSections, setLocalSections] = useState<SectionData[] | null>(null);
  const applyRealtimeEvent = useCallback((event: BoardEvent) => {
    // 구조가 바뀌는 이벤트마다 서버 컴포넌트를 통째로 새로고침(전체 보드 재조회)하지 않도록,
    // 로컬에서 안전하게 반영할 수 있는 경우는 여기서 직접 패치합니다(padupgrade.md 4.4).
    if (event.type === "reaction.changed" && event.postId && event.payload?.reactionCounts) {
      const reactionCount = event.payload.reactionCount
        ?? Object.values(event.payload.reactionCounts).reduce<number>((sum, count) => sum + (count ?? 0), 0);
      setLocalSections((current) => (current ?? board.sections).map((section) => ({
        ...section,
        posts: section.posts.map((post) => post.id === event.postId ? { ...post, reactionCount, reactionCounts: event.payload!.reactionCounts! } : post),
      })));
      return true;
    }
    if (event.type === "post.deleted" && event.postId) {
      setLocalSections((current) => (current ?? board.sections).map((section) => (
        section.posts.some((post) => post.id === event.postId)
          ? { ...section, totalPostCount: Math.max(0, section.totalPostCount - 1), posts: section.posts.filter((post) => post.id !== event.postId) }
          : section
      )));
      return true;
    }
    const field = event.type === "reaction.changed"
      ? "reactionCount"
      : event.type === "comment.created" || event.type === "comment.deleted"
        ? "commentCount"
        : null;
    const count = field ? event.payload?.[field] : undefined;
    if (!field || !event.postId || typeof count !== "number") {
      setLocalSections(null);
      return false;
    }
    setLocalSections((current) => (current ?? board.sections).map((section) => ({
      ...section,
      posts: section.posts.map((post) => post.id === event.postId ? { ...post, [field]: count } : post),
    })));
    return true;
  }, [board.sections]);
  const connected = usePadEvents(board.id, currentUserId, applyRealtimeEvent);
  const [query, setQuery] = useState("");
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(board.title);
  const [descriptionDraft, setDescriptionDraft] = useState(board.description ?? "");
  const [appearanceDraft, setAppearanceDraft] = useState<PadPresentationSettings>(() => presentationSettings(board));
  const [fieldConfigDraft, setFieldConfigDraft] = useState(board.postFieldConfig);
  const [participationDraft, setParticipationDraft] = useState<ParticipationSettings>(() => participationSettings(board));
  const [reactionPolicyDraft, setReactionPolicyDraft] = useState(board.reactionPolicy);
  const [downloadPolicyDraft, setDownloadPolicyDraft] = useState(board.attachmentDownloadPolicy);
  const [moderationModeDraft, setModerationModeDraft] = useState(board.moderationMode);
  const [freezeAtDraft, setFreezeAtDraft] = useState(() => toLocalDateTimeInputValue(board.freezeAt));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosave = useRef(true);
  const [quickSectionId, setQuickSectionId] = useState(board.sections[0]?.id ?? "");
  const [quickComposerOpen, setQuickComposerOpen] = useState(false);
  // 담벼락 디자인의 "전체/섹션명" 필 내비게이션이 지금 어떤 섹션을 가리키는지. 실제로 카드를
  // 걸러내지는 않고(섹션은 이미 전부 나란히 보임) 가로 스크롤 위치를 옮기는 용도라 서버로
  // 보내지 않는 순수 UI 상태입니다. null이면 "전체".
  const [activeSectionPill, setActiveSectionPill] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // SECTIONS 레이아웃은 SectionColumn이 자기만의 편집 모달을 갖고 있지만, 다른 레이아웃
  // (Wall/Grid/Stream/Timeline/Table)은 섹션 단위 컴포넌트가 없어 여기서 하나만 두고 공유합니다
  // (더블클릭 섹션 편집, 사용자 요청).
  const [editingLayoutSectionId, setEditingLayoutSectionId] = useState<string | null>(null);
  const [layoutSectionError, setLayoutSectionError] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [error, setError] = useState("");
  const canManage = capabilities.manageBoard;
  const frozen = isFrozenNow(board);
  const sections = localSections ?? board.sections;
  const tableColumns = useMemo(() => createPostFieldTableColumns<PostData>(board.postFieldConfig, readPostFieldValues), [board.postFieldConfig]);
  const quickSection = sections.find((section) => section.id === quickSectionId) ?? sections[0];

  // 자주 안 쓰는 보드 상단 아이콘(활동·즐겨찾기·보관함·내보내기)을 "더보기" 메뉴 하나로
  // 모아, 상단바가 아이콘으로 가득 차는 문제(특히 모바일)를 줄입니다. 알림 벨(개인 알림)과
  // 별도 모델인 활동 팔로우를 별표로 표시하면 홈의 즐겨찾기와 같은 기능처럼 보이므로, 이 별표는
  // 실제 즐겨찾기 API에 연결합니다. 활동 내역은 바로 위 메뉴에서 계속 확인할 수 있습니다.
  const moreMenuItems = useMemo<PadMoreMenuItem[]>(() => {
    const items: PadMoreMenuItem[] = [];
    if (currentUserId) items.push({ key: "activity", label: "패드 활동 기록", icon: <Activity size={16} />, onClick: () => setActivityOpen(true) });
    if (currentUserId) items.push({ key: "favorite", label: favorite ? "즐겨찾기 해제" : "즐겨찾기 추가", icon: <Star size={16} fill={favorite ? "currentColor" : "none"} />, onClick: toggleFavorite });
    if (capabilities.viewTrash) items.push({ key: "trash", label: "삭제한 항목", icon: <ArchiveRestore size={16} />, onClick: () => setTrashOpen(true) });
    items.push({ key: "export", label: "내보내기·발표", icon: <Download size={16} />, onClick: () => setExportOpen(true) });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, favorite, capabilities.viewTrash]);

  useEffect(() => {
    if (!currentUserId) return;
    fetch(`/api/boards/${board.id}/favorite`).then((response) => response.ok ? response.json() : null).then((result) => { if (result) setFavorite(result.favorite); });
  }, [board.id, currentUserId]);

  async function toggleFavorite() {
    const previous = favorite;
    const next = !previous;
    setFavorite(next);
    const response = await fetch(`/api/boards/${board.id}/favorite`, { method: next ? "PUT" : "DELETE" });
    if (!response.ok) {
      setFavorite(previous);
      setError("즐겨찾기를 변경하지 못했습니다.");
    }
  }

  // 클라이언트에 로드된 첫 페이지(섹션별 최대 30개)만 걸러내던 검색을 서버 검색으로 확장합니다.
  // 검색어가 있는 동안은 실제 순서(드래그 순서)가 아니라 검색 결과만 보여주므로 드래그를 막습니다(filtering).
  const [searchResults, setSearchResults] = useState<{ sections: SectionData[] } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      async function run() {
        if (!term) {
          setSearchResults(null);
          return;
        }
        setSearching(true);
        try {
          const response = await fetch(`/api/boards/${board.id}/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
          const result = response.ok ? await response.json() : { posts: [] };
          const bySection = new Map<string, PostData[]>();
          for (const post of result.posts as (PostData & { sectionId: string })[]) {
            const list = bySection.get(post.sectionId) ?? [];
            list.push(post);
            bySection.set(post.sectionId, list);
          }
          setSearchResults({
            sections: board.sections
              .map((section) => ({ ...section, posts: bySection.get(section.id) ?? [], totalPostCount: (bySection.get(section.id) ?? []).length }))
              .filter((section) => section.posts.length > 0),
          });
        } catch {
          // 요청 중단(abort) 또는 네트워크 오류 — 이전 검색 결과를 그대로 둡니다.
        } finally {
          setSearching(false);
        }
      }
      void run();
    }, term ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, board.id, board.sections]);

  async function loadMorePosts(sectionId: string) {
    const section = sections.find((item) => item.id === sectionId);
    const lastPost = section?.posts[section.posts.length - 1];
    const url = `/api/sections/${sectionId}/posts${lastPost ? `?cursor=${lastPost.id}` : ""}`;
    const response = await fetch(url);
    if (!response.ok) return;
    const result = await response.json();
    setLocalSections((current) => (current ?? board.sections).map((item) => item.id === sectionId ? { ...item, posts: [...item.posts, ...result.posts] } : item));
  }

  const filteredSections = searchResults ? searchResults.sections : sections;

  async function addSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/boards/${board.id}/sections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: data.get("title"), description: data.get("description") }) });
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "섹션을 추가하지 못했습니다.");
    }
    setAddSectionOpen(false);
    router.refresh();
  }

  const editingLayoutSection = sections.find((section) => section.id === editingLayoutSectionId) ?? null;

  async function saveLayoutSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLayoutSectionId) return;
    setLayoutSectionError("");
    const data = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/sections/${editingLayoutSectionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: data.get("title"), description: data.get("description") }) });
    } catch (reason) {
      return setLayoutSectionError(reason instanceof Error ? reason.message : "섹션을 수정하지 못했습니다.");
    }
    setEditingLayoutSectionId(null);
    router.refresh();
  }

  function openSettings() {
    setTitleDraft(board.title);
    setDescriptionDraft(board.description ?? "");
    setAppearanceDraft(presentationSettings(board));
    setFieldConfigDraft(board.postFieldConfig);
    setParticipationDraft(participationSettings(board));
    setReactionPolicyDraft(board.reactionPolicy);
    setDownloadPolicyDraft(board.attachmentDownloadPolicy);
    setModerationModeDraft(board.moderationMode);
    setFreezeAtDraft(toLocalDateTimeInputValue(board.freezeAt));
    setSaveStatus("idle");
    // 모달을 여는 이 초기화 자체가 draft state를 바꾸므로, 바로 아래 자동저장 effect가 "값이
    // 바뀌었다"고 착각해 열자마자 저장을 쏘지 않도록 다음 한 번의 변경 감지는 건너뜁니다.
    skipNextAutosave.current = true;
    setSettingsOpen(true);
  }

  // 발견 범위·방문자 권한·로그인 필수·비밀번호는 여전히 공유 패널이 전담하므로 여기서는 절대
  // 보내지 않습니다 — updateBoardSchema는 생략된 필드를 그대로 두는 부분 PATCH라 안 보내는 한
  // 값이 안전합니다.
  const saveBoardSettingsNow = useCallback(async () => {
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    setSaveStatus("saving");
    try {
      await requestJson(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleDraft,
          description: descriptionDraft,
          layout: appearanceDraft.layout,
          sortMode: appearanceDraft.sortMode,
          newPostPlacement: appearanceDraft.newPostPlacement,
          cardSize: appearanceDraft.cardSize,
          font: appearanceDraft.font,
          backgroundColor: appearanceDraft.backgroundColor,
          accentColor: appearanceDraft.accentColor,
          showAuthor: appearanceDraft.showAuthor,
          showTimestamp: appearanceDraft.showTimestamp,
          postFieldConfig: fieldConfigDraft,
          reactionPolicy: reactionPolicyDraft,
          attachmentDownloadPolicy: downloadPolicyDraft,
          ...participationDraft,
          moderationMode: moderationModeDraft,
          freezeAt: freezeAtDraft ? new Date(freezeAtDraft).toISOString() : null,
        }),
      });
      setSaveStatus("saved");
      router.refresh();
    } catch (reason) {
      setSaveStatus("error");
      setError(reason instanceof Error ? reason.message : "설정을 저장하지 못했습니다.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id, titleDraft, descriptionDraft, appearanceDraft, fieldConfigDraft, participationDraft, reactionPolicyDraft, downloadPolicyDraft, moderationModeDraft, freezeAtDraft]);

  const changeBackgroundImage = useCallback((backgroundImageUrl: string | null) => {
    setAppearanceDraft((current) => ({ ...current, backgroundImageUrl }));
    setSaveStatus("saved");
    router.refresh();
  }, [router]);

  // 예전에는 탭을 다 고치고 "설정 저장" 버튼을 눌러야 반영됐는데, 그게 불편하다는 피드백을 받아
  // 대부분의 설정은 바뀔 때마다(디바운스) 자동으로 저장합니다. 다만 "게시물 필드"(질문 라벨·
  // 선택지 같은 텍스트를 계속 다듬는 탭)는 한 글자 바꿀 때마다 저장되면 작성 중인 내용이 자꾸
  // 반영되어 불편하다는 피드백을 받아 fieldConfigDraft는 이 자동저장 대상에서 뺐습니다 — 그
  // 탭에는 명시적 "필드 설정 저장" 버튼(onApplyFieldConfig)을 따로 둡니다.
  useEffect(() => {
    if (!settingsOpen) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    setSaveStatus("saving");
    settingsSaveTimer.current = setTimeout(() => { void saveBoardSettingsNow(); }, 500);
    return () => {
      if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    titleDraft,
    descriptionDraft,
    appearanceDraft.layout,
    appearanceDraft.sortMode,
    appearanceDraft.newPostPlacement,
    appearanceDraft.cardSize,
    appearanceDraft.font,
    appearanceDraft.backgroundColor,
    appearanceDraft.accentColor,
    appearanceDraft.showAuthor,
    appearanceDraft.showTimestamp,
    participationDraft,
    reactionPolicyDraft,
    downloadPolicyDraft,
    moderationModeDraft,
    freezeAtDraft,
  ]);

  async function inviteMember() {
    const email = window.prompt("초대할 멤버의 PyxPad 이메일을 입력해 주세요.", "student@pyxpad.demo");
    if (!email) return;
    try {
      await requestJson(`/api/boards/${board.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: "MEMBER" }) });
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "멤버를 초대하지 못했습니다.");
    }
    router.refresh();
  }

  async function changeMemberRole(userId: string, role: string) {
    try {
      await requestJson(`/api/boards/${board.id}/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "역할을 바꾸지 못했습니다.");
    }
    router.refresh();
  }

  async function removeMember(userId: string) {
    if (!window.confirm("이 멤버를 패드에서 내보낼까요?")) return;
    try {
      await requestJson(`/api/boards/${board.id}/members/${userId}`, { method: "DELETE" });
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "멤버를 내보내지 못했습니다.");
    }
    router.refresh();
  }

  async function toggleFreeze() {
    const next = frozen ? "ACTIVE" : "FROZEN";
    if (next === "FROZEN" && !window.confirm("패드를 동결할까요? 동결 중에는 새 게시물·댓글·이동이 모두 막혀요.")) return;
    // 해제할 때는 지나간 예약 시각도 함께 지워야, 예약이 남아 있어 즉시 다시 동결 상태로 판정되는 걸 막을 수 있습니다.
    const body = next === "ACTIVE" ? { state: next, freezeAt: null } : { state: next };
    try {
      await requestJson(`/api/boards/${board.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "동결 상태를 바꾸지 못했습니다.");
    }
    router.refresh();
  }

  async function archiveBoard() {
    if (!window.confirm(`‘${board.title}’ 패드를 보관할까요? 30일 동안 홈에서 복구할 수 있습니다.`)) return;
    try {
      await requestJson(`/api/boards/${board.id}`, { method: "DELETE" });
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "패드를 보관하지 못했습니다.");
    }
    setSettingsOpen(false);
    router.push("/");
    router.refresh();
  }


  return (
    <main className="board-page" style={boardPageStyle(appearanceDraft)}>
      <header className="board-nav">
        <Link href="/" className="back-link"><ChevronLeft size={18} /><Logo size={22} /><b>pyxpad</b></Link>
        <div className="board-nav-center"><LayoutGrid size={15} /><span>{board.title}</span></div>
        <div className="board-nav-actions">
          <span className={`sync-state ${connected ? "online" : ""}`} title={connected ? "실시간 연결됨" : "연결 중"} aria-label={connected ? "실시간 연결됨" : "연결 중"}>{connected ? <Wifi size={15} /> : <WifiOff size={15} />}</span>
          <ThemeToggle />
          {currentUserId && <NotificationBell />}
          <div className="board-toolbar-group">
            <button className="board-toolbar-item" onClick={() => setShareOpen(true)}><Share2 size={16} />공유</button>
            <PadMoreMenu items={moreMenuItems} className="board-toolbar-item board-toolbar-more" rootClassName="board-toolbar-more-wrap" />
            {canManage && <button className="board-toolbar-item" onClick={openSettings} aria-label="패드 설정"><Settings2 size={18} /></button>}
          </div>
        </div>
      </header>

      {frozen && <div className="board-frozen-banner"><Snowflake size={16} />이 패드는 동결되어 있어요. 새 게시물·댓글·이동이 모두 막혀 있습니다.{canManage && <button type="button" onClick={toggleFreeze}>동결 해제</button>}</div>}

      <section className="board-hero">
        <div className="board-hero-line" title={board.description ?? undefined}>{board.discoveryScope === "PUBLIC" ? <Globe2 size={13} /> : <LockKeyhole size={13} />}<span>{discoveryScopeLabel[board.discoveryScope]}</span><span className="board-hero-dot">·</span><h1>{board.title}</h1>{canManage && <span className={`board-state-badge ${frozen ? "frozen" : "active"}`}>{frozen ? "동결됨" : "운영중"}</span>}<span className="board-hero-dot">·</span><span className="board-hero-owner">{board.owner.name || "PyxPad"}</span></div>
        <div className="board-hero-side"><div className="member-stack">{board.members.slice(0, 4).map((member, index) => <span key={member.user.id} style={{ zIndex: 5 - index }} title={member.user.name || "패드 멤버"}>{member.user.image ? <img src={member.user.image} alt="" /> : (member.user.name || "친")[0]}</span>)}{board.memberCount > 4 && <span>+{board.memberCount - 4}</span>}</div><span className="member-copy"><b>{board.memberCount}명</b>이 함께해요</span></div>
      </section>

      <div className="board-tools">
        <label className="board-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="패드에서 검색" /><kbd>{searching ? "검색 중" : "⌘ K"}</kbd></label>
        <div className="board-guide"><Sparkles size={15} /><span>{board.sortMode === "MANUAL" ? (board.layout === "SECTIONS" ? "카드나 섹션을 길게 눌러 순서를 바꿀 수 있어요." : "카드를 길게 눌러 순서를 바꿀 수 있어요.") : "자동 정렬 중에는 카드 이동이 잠깁니다."}</span></div>
        {board.layout !== "SECTIONS" && capabilities.createPost && quickSection && <div className="board-quick-post"><select value={quickSection.id} onChange={(event) => setQuickSectionId(event.target.value)} aria-label="글을 추가할 섹션">{sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select><button className="button primary" onClick={() => setQuickComposerOpen(true)}><Plus size={16} />글 추가</button></div>}
        {canManage && <button className="button soft" onClick={() => setAddSectionOpen(true)}><Plus size={16} />섹션 추가</button>}
      </div>
      {board.layout === "SECTIONS" && sections.length > 0 && (
        <nav className="board-section-pills" aria-label="섹션 바로가기">
          <button type="button" aria-pressed={activeSectionPill === null} onClick={() => { setActiveSectionPill(null); document.querySelector(".pad-canvas")?.scrollTo({ left: 0, behavior: "smooth" }); }}>전체</button>
          {sections.map((section) => (
            <button
              type="button"
              key={section.id}
              aria-pressed={activeSectionPill === section.id}
              onClick={() => {
                setActiveSectionPill(section.id);
                setQuickSectionId(section.id);
                document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
              }}
            >
              {section.title}
            </button>
          ))}
        </nav>
      )}
      {error && <p className="board-error">{error}</p>}

      {board.layout === "SECTIONS" ? (
        <SectionsBoardView
          boardId={board.id}
          sortMode={board.sortMode}
          baseSections={board.sections}
          sections={sections}
          filteredSections={filteredSections}
          query={query}
          canManage={canManage}
          capabilities={capabilities}
          currentUserId={currentUserId}
          fieldConfig={board.postFieldConfig}
          reactionPolicy={board.reactionPolicy}
          showAuthor={board.showAuthor}
          showTimestamp={board.showTimestamp}
          accentColor={board.accentColor}
          onLoadMore={loadMorePosts}
          setLocalSections={setLocalSections}
          setError={setError}
          onAddSection={() => setAddSectionOpen(true)}
        />
      ) : board.layout === "WALL" || board.layout === "GRID" ? (
        <FlatDragBoardView
          boardId={board.id}
          layout={board.layout}
          sortMode={board.sortMode}
          newPostPlacement={board.newPostPlacement}
          sections={sections}
          filteredSections={filteredSections}
          query={query}
          capabilities={capabilities}
          currentUserId={currentUserId}
          reactionPolicy={board.reactionPolicy}
          appearance={{
            backgroundColor: null,
            backgroundImageUrl: null,
            accentColor: board.accentColor,
            cardSize: board.cardSize,
            font: board.font,
            showAuthor: board.showAuthor,
            showTimestamp: board.showTimestamp,
          }}
          onEditSection={canManage ? (section) => setEditingLayoutSectionId(section.id) : undefined}
          setLocalSections={setLocalSections}
          setError={setError}
        />
      ) : (
        <PadLayoutRenderer
          layout={board.layout}
          sections={filteredSections}
          sortMode={board.sortMode}
          newPostPlacement={board.newPostPlacement}
          appearance={{
            backgroundColor: null,
            backgroundImageUrl: null,
            accentColor: board.accentColor,
            cardSize: board.cardSize,
            font: board.font,
            showAuthor: board.showAuthor,
            showTimestamp: board.showTimestamp,
          }}
          tableColumns={tableColumns}
          onEditSection={canManage ? (section) => setEditingLayoutSectionId(section.id) : undefined}
          renderPost={(post, context) => (
            <PostCard
              key={post.id}
              post={post}
              sectionId={context.section.id}
              reactionPolicy={board.reactionPolicy}
              capabilities={capabilities}
              currentUserId={currentUserId}
              dragDisabled
              showAuthor={board.showAuthor}
              showTimestamp={board.showTimestamp}
            />
          )}
        />
      )}

      {quickSection && quickComposerOpen && <PostComposer open={quickComposerOpen} onClose={() => setQuickComposerOpen(false)} sectionId={quickSection.id} sectionTitle={quickSection.title} fieldConfig={board.postFieldConfig} />}

      {board.layout === "SECTIONS" && quickSection && capabilities.createPost && (
        <button type="button" className="board-fab" aria-label={`${quickSection.title}에 새 글 추가`} onClick={() => setQuickComposerOpen(true)}><Plus size={22} /></button>
      )}

      <Modal open={addSectionOpen} onClose={() => setAddSectionOpen(false)} title="새 섹션 열기" description="생각을 모을 새로운 주제를 정해요."><form className="stack-form" onSubmit={addSection}><label>섹션 제목<input name="title" placeholder="예: 우리가 찾은 자료" required maxLength={80} autoFocus /></label><label>안내 문구<textarea name="description" placeholder="어떤 내용을 나누는 곳인지 알려주세요." rows={3} maxLength={240} /></label>{error && <p className="form-error">{error}</p>}<button className="button primary full">섹션 추가</button></form></Modal>

      <Modal open={editingLayoutSection !== null} onClose={() => setEditingLayoutSectionId(null)} title="섹션 다듬기" description="제목과 안내 문구를 바꿀 수 있어요.">
        {editingLayoutSection && <form key={editingLayoutSection.id} className="stack-form" onSubmit={saveLayoutSection}><label>섹션 제목<input name="title" defaultValue={editingLayoutSection.title} required maxLength={80} autoFocus /></label><label>안내 문구<textarea name="description" defaultValue={editingLayoutSection.description ?? ""} rows={3} maxLength={240} /></label>{layoutSectionError && <p className="form-error">{layoutSectionError}</p>}<button className="button primary full">변경 내용 저장</button></form>}
      </Modal>

      <Modal open={trashOpen} onClose={() => setTrashOpen(false)} title="삭제한 항목" description="이 패드에서 숨긴 섹션·글·댓글·첨부파일을 30일 동안 여기서 복구할 수 있어요." className="trash-modal">{trashOpen && <PadTrash boardId={board.id} open={trashOpen} />}</Modal>

      <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="패드 활동" description="이 패드에서 있었던 일들을 시간순으로 볼 수 있어요.">{activityOpen && <PadActivityPanel boardId={board.id} open={activityOpen} />}</Modal>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="패드 공유" description="링크나 QR 코드로 빠르게 전달하세요.">{shareOpen && <PadSharePanel board={board} />}</Modal>

      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="내보내기·발표" description="인쇄·발표 화면을 열거나, 게시물·댓글·반응·첨부파일을 파일로 받아요." className="export-modal">{exportOpen && <PadExportPanel board={board} canManage={canManage} />}</Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="패드 설정" description="기능별로 묶은 탭에서 원하는 설정을 찾아 바꿔보세요." className="settings-modal" variant="side">
        <div className="settings-shell">
          {settingsOpen && (
            <PadSettingsTabs
              board={board}
              frozen={frozen}
              titleDraft={titleDraft}
              onTitleChange={setTitleDraft}
              descriptionDraft={descriptionDraft}
              onDescriptionChange={setDescriptionDraft}
              appearanceDraft={appearanceDraft}
              onAppearanceChange={setAppearanceDraft}
              onBackgroundImageChange={changeBackgroundImage}
              fieldConfigDraft={fieldConfigDraft}
              onFieldConfigChange={setFieldConfigDraft}
              onApplyFieldConfig={() => { void saveBoardSettingsNow(); }}
              participationDraft={participationDraft}
              onParticipationChange={setParticipationDraft}
              reactionPolicyDraft={reactionPolicyDraft}
              onReactionPolicyChange={setReactionPolicyDraft}
              downloadPolicyDraft={downloadPolicyDraft}
              onDownloadPolicyChange={setDownloadPolicyDraft}
              moderationModeDraft={moderationModeDraft}
              onModerationModeChange={setModerationModeDraft}
              freezeAtDraft={freezeAtDraft}
              onFreezeAtChange={setFreezeAtDraft}
              onToggleFreeze={toggleFreeze}
              onInviteMember={inviteMember}
              onChangeMemberRole={changeMemberRole}
              onRemoveMember={removeMember}
            />
          )}
          <footer className="settings-footer">
            <div>
              {error && <p className="form-error compact">{error}</p>}
              <div className="settings-save-status" data-status={saveStatus}>
                {saveStatus === "saving" && <><LoaderCircle size={14} className="spin" />저장하는 중…</>}
                {saveStatus === "saved" && <><Check size={14} />모든 변경 사항이 저장됐어요</>}
                {saveStatus === "error" && <>저장하지 못했어요. 다시 시도해 주세요.</>}
                {saveStatus === "idle" && <>저장 버튼이 없는 항목은 자동으로 저장됩니다.</>}
              </div>
            </div>
            {capabilities.archiveBoard && <button type="button" className="button danger settings-archive-button" onClick={archiveBoard}><Archive size={15} />패드 보관</button>}
          </footer>
        </div>
      </Modal>
    </main>
  );
}
