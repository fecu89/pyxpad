export type UserRole = "SUPER_ADMIN" | "ADMIN" | "TEACHER" | "STUDENT";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type SystemPermission =
  | "VIEW_USERS"
  | "CHANGE_NON_ADMIN_ROLES"
  | "SUSPEND_USERS"
  | "REVOKE_USER_SESSIONS"
  | "VIEW_ALL_BOARDS"
  | "EDIT_ANY_CONTENT"
  | "MODERATE_CONTENT"
  | "CREATE_CONTENT_ANYWHERE"
  | "MANAGE_BOARD_SETTINGS"
  | "TRANSFER_BOARD_OWNERSHIP"
  | "VIEW_USER_PII"
  | "VIEW_AUDIT_LOG";

export type AdminUserRecord = {
  id: string;
  name: string | null;
  maskedEmail: string;
  role: UserRole;
  status: UserStatus;
  authVersion: number;
  lastLoginAt: string | null;
  createdAt: string;
  ownedBoardCount: number;
  memberBoardCount: number;
  systemPermissions: SystemPermission[];
  school: { id: string; name: string } | null;
  schoolGroup: { id: string; name: string; type: "CLASS" | "DEPARTMENT" } | null;
  isSchoolRepresentative: boolean;
};

export type SchoolDirectoryItem = {
  id: string;
  name: string;
  userCount: number;
  isDefault: boolean;
  groups: { id: string; name: string; type: "CLASS" | "DEPARTMENT"; userCount: number; isDefault: boolean }[];
};

export type AuditLogRecord = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
  actor: { id: string; name: string | null; image: string | null };
  targetUser: { id: string; name: string | null; image: string | null } | null;
};

export type AdminActor = {
  id: string;
  name: string | null;
  role: UserRole;
  systemPermissions: SystemPermission[];
  school: { id: string; name: string } | null;
  isSchoolRepresentative: boolean;
};

export type TeacherApprovalRecord = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewReason: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  user: { id: string; name: string | null; maskedEmail: string; image: string | null };
  school: { id: string; name: string };
  schoolGroup: { id: string; name: string };
};
