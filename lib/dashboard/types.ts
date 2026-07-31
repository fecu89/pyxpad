export type DashboardBoardRelation = "OWNED" | "SHARED" | "MANAGED" | "SAVED";
export type DashboardBoardRole = "OWNER" | "ADMIN" | "EDITOR" | "MEMBER" | "VIEWER" | null;

export type BoardSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  backgroundImageUrl: string | null;
  discoveryScope: "PRIVATE" | "LINK" | "PUBLIC";
  attachmentDownloadPolicy: "READERS" | "MEMBERS" | "EDITORS" | "DISABLED";
  isTemplate: boolean;
  updatedAt: string;
  owner: { id: string; name: string | null };
  _count: { sections: number; posts: number };
};

export type DashboardBoard = BoardSummary & {
  relation: DashboardBoardRelation;
  memberRole: DashboardBoardRole;
  lastViewedAt: string | null;
  isFavorite: boolean;
  folderIds: string[];
  canWritePosts: boolean;
  canCopyAttachments: boolean;
  canCopyMembers: boolean;
  canManageTemplate: boolean;
};

export type DashboardFolder = {
  id: string;
  name: string;
  position: number;
  boardIds: string[];
};

export type TemplateBoard = BoardSummary & {
  isFavorite: boolean;
  canCopyAttachments: boolean;
  canCopyMembers: boolean;
  canManageTemplate: boolean;
};

export type ArchivedBoardSummary = BoardSummary & {
  deletedAt: string;
  restorable: boolean;
  remainingDays: number;
};

export type AccessRequestBoard = BoardSummary & {
  requestStatus: "PENDING" | "REJECTED";
  requestedAt: string;
};
