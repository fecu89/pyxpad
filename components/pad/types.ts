import type { PostFieldConfig, StoredPostFieldValues } from "@/lib/post-fields/types";

export type PadRole = "OWNER" | "ADMIN" | "EDITOR" | "MEMBER" | "VIEWER" | null;
export type PadDiscoveryScope = "PRIVATE" | "LINK" | "PUBLIC";
export type PadVisitorPermission = "NO_ACCESS" | "READER" | "COMMENTER" | "WRITER";
export type PadLayoutKind = "SECTIONS" | "WALL" | "GRID" | "STREAM" | "TIMELINE" | "TABLE";
export type PadSortMode = "MANUAL" | "CREATED_ASC" | "CREATED_DESC" | "TITLE" | "RANDOM";
export type ReactionKey = "LIKE" | "HEART" | "CELEBRATE" | "LAUGH" | "WOW" | `EMOJI:${string}`;

export type AttachmentData = {
  id: string;
  type: "IMAGE" | "PDF" | "DOCUMENT" | "VIDEO" | "AUDIO" | "FILE" | "LINK";
  originalName: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  caption: string | null;
  externalUrl: string | null;
  previewImageUrl: string | null;
};

export type PostData = {
  id: string;
  title: string | null;
  body: string;
  bodyFormat: "MARKDOWN" | "PLAIN_TEXT";
  status: "PENDING" | "PUBLISHED" | "REJECTED";
  moderationReason: string | null;
  customFieldValues: StoredPostFieldValues | null;
  position: number;
  isPinned: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null; image: string | null };
  attachments: AttachmentData[];
  viewerReacted: boolean;
  reactionCount: number;
  viewerReactions: ReactionKey[];
  reactionCounts: Partial<Record<ReactionKey, number>>;
  commentCount: number;
};

export type SectionData = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  version: number;
  totalPostCount: number;
  posts: PostData[];
};

export type PadData = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  discoveryScope: PadDiscoveryScope;
  visitorPermission: PadVisitorPermission;
  loginRequired: boolean;
  hasPassword: boolean;
  state: "ACTIVE" | "FROZEN";
  moderationMode: "NONE" | "MANUAL" | "STUDENTS_ONLY";
  freezeAt: string | null;
  layout: PadLayoutKind;
  sortMode: PadSortMode;
  newPostPlacement: "START" | "END";
  cardSize: "SMALL" | "MEDIUM" | "LARGE";
  font: "SANS" | "SERIF" | "MONO";
  backgroundColor: string | null;
  backgroundImageUrl: string | null;
  accentColor: string | null;
  showAuthor: boolean;
  showTimestamp: boolean;
  reactionPolicy: "SINGLE" | "MULTIPLE";
  attachmentDownloadPolicy: "READERS" | "MEMBERS" | "EDITORS" | "DISABLED";
  postFieldConfig: PostFieldConfig;
  allowComments: boolean;
  allowReactions: boolean;
  allowMemberPosting: boolean;
  allowMemberFileUpload: boolean;
  owner: { id: string; name: string | null };
  // members는 미리보기(최대 MEMBER_PREVIEW_LIMIT명)만 담고 있습니다. 정확한 전체 인원수는
  // memberCount를 쓰고, 멤버 관리(역할 변경·제거)에는 GET /api/boards/[boardId]/members로
  // 따로 전체 목록을 불러옵니다(lib/board/queries.ts, pad-settings-tabs.tsx 참고).
  memberCount: number;
  members: { role: Exclude<PadRole, null>; user: { id: string; name: string | null; email: string | null; image: string | null } }[];
  sections: SectionData[];
};

export type PadCapabilities = {
  manageBoard: boolean;
  archiveBoard: boolean;
  viewTrash: boolean;
  createPost: boolean;
  editAnyPost: boolean;
  editOwnContent: boolean;
  moderateComments: boolean;
  comment: boolean;
  react: boolean;
  moderatePosts: boolean;
  downloadAttachments: boolean;
};

export type PadInitialData = { board: PadData; currentRole: PadRole; capabilities: PadCapabilities };
