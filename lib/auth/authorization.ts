import "server-only";

import type { SystemPermission, UserRole } from "@/generated/prisma/client";
import { requireCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { getBoardAccess } from "@/lib/board/permissions";

export type AuthorizationUser = Pick<CurrentUser, "id" | "role" | "systemPermissions" | "school" | "isSchoolRepresentative">;
export type EffectiveBoardAccess = NonNullable<Awaited<ReturnType<typeof getBoardAccess>>>;

export class AuthorizationError extends Error {
  constructor(message = "이 작업을 수행할 권한이 없습니다.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requireActiveUser() {
  return requireCurrentUser();
}

export function hasSystemPermission(user: AuthorizationUser, permission: SystemPermission) {
  return user.role === "SUPER_ADMIN"
    || (user.role === "ADMIN" && user.systemPermissions.includes(permission));
}

export async function requireRole(allowedRoles: UserRole[]) {
  const user = await requireActiveUser();
  if (!allowedRoles.includes(user.role)) throw new AuthorizationError();
  return user;
}

export async function requireSystemPermission(permission: SystemPermission) {
  const user = await requireActiveUser();
  if (!hasSystemPermission(user, permission)) throw new AuthorizationError();
  return user;
}

export async function requireAnySystemPermission(permissions: SystemPermission[]) {
  const user = await requireActiveUser();
  if (!permissions.some((permission) => hasSystemPermission(user, permission))) {
    throw new AuthorizationError();
  }
  return user;
}

export function canAccessAdminShell(user: AuthorizationUser) {
  return user.role === "SUPER_ADMIN"
    || (user.role === "ADMIN" && user.systemPermissions.length > 0)
    || (user.role === "TEACHER" && user.school !== null);
}

// 학교 대표교사(TEACHER + isSchoolRepresentative)가 특정 학교에 대한 배치·반/부서 관리 권한이
// 있는지. 자기 학교(school.id)에 한해서만 true입니다 — 다른 학교는 SUPER_ADMIN만.
export function isSchoolRepresentativeFor(user: AuthorizationUser, schoolId: string) {
  return user.role === "TEACHER" && user.isSchoolRepresentative && user.school?.id === schoolId;
}

export function canCreateBoard(user: AuthorizationUser) {
  return user.role === "SUPER_ADMIN"
    || user.role === "ADMIN"
    || user.role === "TEACHER"
    || user.role === "STUDENT";
}

export async function getEffectiveBoardAccess(boardId: string, user: AuthorizationUser | null) {
  return getBoardAccess(boardId, user?.id ?? null);
}

const VISITOR_PERMISSION_RANK = { NO_ACCESS: 0, READER: 1, COMMENTER: 2, WRITER: 3 } as const;

function visitorGrantsAtLeast(access: EffectiveBoardAccess, level: keyof typeof VISITOR_PERMISSION_RANK) {
  // LINK는 URL을 가진 사람이 로그인 없이 읽고 다시 공유할 수 있는 전용 읽기 모드입니다.
  // 과거 데이터에 COMMENTER/WRITER가 남아 있어도 비멤버에게 쓰기 권한을 되살리지 않습니다.
  if (access.board.discoveryScope === "LINK" && level !== "READER") return false;
  return VISITOR_PERMISSION_RANK[access.board.visitorPermission] >= VISITOR_PERMISSION_RANK[level];
}

export function canReadEffectiveBoard(user: AuthorizationUser | null, access: EffectiveBoardAccess) {
  if (access.role !== null) return true;
  if (user && hasSystemPermission(user, "VIEW_ALL_BOARDS")) return true;
  // PRIVATE는 발견 범위와 무관하게 초대된 멤버만 접근합니다 — 링크·검색 노출과 방문자 권한은 LINK/PUBLIC에서만 의미가 있습니다.
  if (access.board.discoveryScope === "PRIVATE") return false;
  // LINK 자체가 "링크 보유자의 익명 읽기"를 뜻합니다. loginRequired/visitorPermission이
  // 예전 값으로 남은 보드도 여기서 읽을 수 있게 하되, 쓰기는 visitorGrantsAtLeast가 막습니다.
  if (access.board.discoveryScope === "LINK") return true;
  if (access.board.loginRequired && !user) return false;
  return access.board.visitorPermission !== "NO_ACCESS";
}

export function canArchiveBoard(user: AuthorizationUser, access: EffectiveBoardAccess) {
  return user.role === "SUPER_ADMIN" || access.isOwner;
}

export function canRestoreBoard(user: AuthorizationUser, access: EffectiveBoardAccess) {
  return user.role === "SUPER_ADMIN" || access.isOwner;
}

export function canPurgeBoard(user: AuthorizationUser, access: EffectiveBoardAccess) {
  return user.role === "SUPER_ADMIN" || access.isOwner;
}

// 승인 모드에 따라 새 글이 바로 게시될지 승인 대기로 들어갈지 결정합니다(padupgrade.md 5.3).
// STUDENTS_ONLY는 학생이 아닌 작성자는 바로 게시하고, MANUAL은 보드 소유자·관리자가 써도 승인이 필요합니다.
export function determineInitialPostStatus(user: AuthorizationUser, access: EffectiveBoardAccess) {
  const mode = access.board.moderationMode;
  if (mode === "NONE") return "PUBLISHED" as const;
  if (mode === "STUDENTS_ONLY" && user.role !== "STUDENT") return "PUBLISHED" as const;
  return "PENDING" as const;
}

export function canModeratePosts(user: AuthorizationUser, access: EffectiveBoardAccess) {
  return canManageBoardSettings(user, access);
}

// 수동 동결(state)이거나, 예약한 마감 시각(freezeAt)이 이미 지났으면 동결로 취급합니다.
// 별도 스케줄러 없이 요청마다 즉시 판정하므로 "마감 시각 예약"에 백그라운드 잡이 필요 없습니다.
export function isBoardFrozen(access: EffectiveBoardAccess) {
  if (access.board.state === "FROZEN") return true;
  return Boolean(access.board.freezeAt && access.board.freezeAt.getTime() <= Date.now());
}

export function canManageBoardSettings(user: AuthorizationUser, access: EffectiveBoardAccess) {
  return user.role === "SUPER_ADMIN"
    || hasSystemPermission(user, "MANAGE_BOARD_SETTINGS")
    || access.role === "OWNER"
    || access.role === "ADMIN";
}

export function canTransferBoardOwnership(user: AuthorizationUser) {
  return user.role === "SUPER_ADMIN" || hasSystemPermission(user, "TRANSFER_BOARD_OWNERSHIP");
}

export function canCreatePost(user: AuthorizationUser, access: EffectiveBoardAccess) {
  if (user.role === "SUPER_ADMIN" || hasSystemPermission(user, "CREATE_CONTENT_ANYWHERE")) return true;
  if (access.role && access.role !== "VIEWER") return access.role !== "MEMBER" || access.board.allowMemberPosting;
  // PUBLIC에서 로그인한 비멤버 방문자에게 WRITER 권한이 열려 있으면 글을 쓸 수 있습니다.
  return visitorGrantsAtLeast(access, "WRITER");
}

export function canUploadFile(user: AuthorizationUser, access: EffectiveBoardAccess) {
  if (user.role === "SUPER_ADMIN" || hasSystemPermission(user, "EDIT_ANY_CONTENT")) return true;
  if (access.role && access.role !== "VIEWER") return access.role !== "MEMBER" || access.board.allowMemberFileUpload;
  return visitorGrantsAtLeast(access, "WRITER");
}

export function canComment(user: AuthorizationUser, access: EffectiveBoardAccess) {
  if (user.role === "SUPER_ADMIN" || hasSystemPermission(user, "CREATE_CONTENT_ANYWHERE")) return true;
  if (!canReadEffectiveBoard(user, access) || !access.board.allowComments) return false;
  if (access.role !== null) return access.role !== "VIEWER";
  return visitorGrantsAtLeast(access, "COMMENTER");
}

export function canReact(user: AuthorizationUser, access: EffectiveBoardAccess) {
  if (user.role === "SUPER_ADMIN") return true;
  if (!canReadEffectiveBoard(user, access) || !access.board.allowReactions) return false;
  if (access.role !== null) return access.role !== "VIEWER";
  return visitorGrantsAtLeast(access, "COMMENTER");
}

export function canDownloadAttachment(user: AuthorizationUser | null, access: EffectiveBoardAccess) {
  if (!canReadEffectiveBoard(user, access)) return false;
  if (user?.role === "SUPER_ADMIN" || (user && hasSystemPermission(user, "EDIT_ANY_CONTENT"))) return true;
  switch (access.board.attachmentDownloadPolicy) {
    case "READERS":
      return true;
    case "MEMBERS":
      return access.role !== null;
    case "EDITORS":
      return ["OWNER", "ADMIN", "EDITOR"].includes(access.role ?? "");
    default:
      return false;
  }
}

export function canDeleteComment(args: {
  user: AuthorizationUser;
  access: EffectiveBoardAccess;
  commentAuthorId: string;
}) {
  if (args.user.role === "SUPER_ADMIN" || hasSystemPermission(args.user, "MODERATE_CONTENT")) return true;
  if (["OWNER", "ADMIN", "EDITOR"].includes(args.access.role ?? "")) return true;
  if (args.access.role === null && args.access.board.discoveryScope === "LINK") return false;
  if (args.access.role === "VIEWER") return false;
  return args.user.id === args.commentAuthorId;
}

export function canEditComment(args: {
  user: AuthorizationUser;
  access: EffectiveBoardAccess;
  commentAuthorId: string;
}) {
  if (args.user.role === "SUPER_ADMIN" || hasSystemPermission(args.user, "EDIT_ANY_CONTENT")) return true;
  if (args.access.role === null && args.access.board.discoveryScope === "LINK") return false;
  if (args.access.role === "VIEWER") return false;
  return args.user.id === args.commentAuthorId;
}

export function canEditPost(args: {
  user: AuthorizationUser;
  access: EffectiveBoardAccess;
  postAuthorId: string;
}) {
  if (args.user.role === "SUPER_ADMIN" || hasSystemPermission(args.user, "EDIT_ANY_CONTENT")) return true;
  if (args.access.role === null && args.access.board.discoveryScope === "LINK") return false;
  if (args.access.role === "VIEWER") return false;
  if (args.access.role && ["OWNER", "ADMIN", "EDITOR"].includes(args.access.role)) return true;
  // PUBLIC 방문자 WRITER 권한으로 쓴 글도 작성자 본인은 수정할 수 있습니다.
  return args.user.id === args.postAuthorId;
}

export function canModeratePost(args: {
  user: AuthorizationUser;
  access: EffectiveBoardAccess;
  postAuthorId: string;
}) {
  if (args.user.role === "SUPER_ADMIN" || hasSystemPermission(args.user, "MODERATE_CONTENT")) return true;
  return canEditPost(args);
}

export function canPurgePost(args: {
  user: AuthorizationUser;
  access: EffectiveBoardAccess;
  postAuthorId: string;
}) {
  return canModeratePost(args);
}

export function canPurgeComment(args: {
  user: AuthorizationUser;
  access: EffectiveBoardAccess;
  commentAuthorId: string;
}) {
  return canDeleteComment(args);
}

// commentAuthorId가 있으면 댓글에 달린 첨부(이미지 포함)이므로 댓글 삭제 권한 기준으로,
// 없으면 게시물에 바로 달린 첨부이므로 게시물 수정 권한 기준으로 판단합니다.
export function canPurgeAttachment(args: {
  user: AuthorizationUser;
  access: EffectiveBoardAccess;
  postAuthorId: string;
  commentAuthorId: string | null;
}) {
  if (args.commentAuthorId !== null) {
    return canDeleteComment({ user: args.user, access: args.access, commentAuthorId: args.commentAuthorId });
  }
  return canEditPost({ user: args.user, access: args.access, postAuthorId: args.postAuthorId });
}

export function canPurgeSection(user: AuthorizationUser, access: EffectiveBoardAccess) {
  return canManageBoardSettings(user, access);
}

export function isBoardScopedManagement(access: EffectiveBoardAccess) {
  return access.role === "OWNER" || access.role === "ADMIN";
}

export function isBoardScopedPostEdit(access: EffectiveBoardAccess, userId: string, postAuthorId: string) {
  return Boolean(access.role && access.role !== "VIEWER" && (["OWNER", "ADMIN", "EDITOR"].includes(access.role) || userId === postAuthorId));
}

export function isBoardScopedCommentCreate(access: EffectiveBoardAccess) {
  return Boolean(access.board.allowComments && access.role && access.role !== "VIEWER");
}

export function isBoardScopedCommentModeration(access: EffectiveBoardAccess, userId: string, commentAuthorId: string) {
  return Boolean(access.role && access.role !== "VIEWER" && (["OWNER", "ADMIN", "EDITOR"].includes(access.role) || userId === commentAuthorId));
}

export function canAssignBoardRole(targetRole: UserRole, boardRole: "ADMIN" | "EDITOR" | "MEMBER" | "VIEWER") {
  if (targetRole === "STUDENT") return boardRole === "MEMBER" || boardRole === "VIEWER";
  return true;
}

export function requireRecentAuthentication(user: Pick<CurrentUser, "lastLoginAt">, minutes = 15) {
  const threshold = Date.now() - minutes * 60_000;
  if (!user.lastLoginAt || user.lastLoginAt.getTime() < threshold) {
    throw new AuthorizationError("보안을 위해 다시 로그인한 뒤 시도해 주세요.");
  }
}
