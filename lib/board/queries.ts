import "server-only";

import type { CurrentUser } from "@/lib/auth/current-user";
import { canArchiveBoard, canComment, canCreatePost, canDownloadAttachment, canManageBoardSettings, canModeratePosts, canReact, canReadEffectiveBoard, hasSystemPermission } from "@/lib/auth/authorization";
import { hasVerifiedBoardPassword } from "@/lib/board/board-password";
import { getPrisma } from "@/lib/prisma";
import { getBoardAccessBySlug } from "@/lib/board/permissions";
import { decryptUserEmail, toPublicAuthorDTO } from "@/lib/users/repository";
import { maskEmail } from "@/lib/security/pii-crypto";
import { defaultPostFieldConfig } from "@/lib/post-fields/defaults";
import { parsePostFieldConfig } from "@/lib/post-fields/validation";
import { parseReactionKey } from "@/lib/reactions/validation";
import type { ReactionCounts, ReactionKey } from "@/lib/reactions/types";
import type { StoredPostFieldValues } from "@/lib/post-fields/types";

const publicUserSelect = { id: true, nameEncrypted: true, imageEncrypted: true } as const;
export const POST_PAGE_SIZE = 30;
export const MEMBER_PREVIEW_LIMIT = 200;

function resolvedFieldConfig(value: unknown) {
  try {
    return parsePostFieldConfig(value ?? defaultPostFieldConfig);
  } catch {
    return defaultPostFieldConfig;
  }
}

function reactionSummary(reactions: { key: string; userId: string }[], currentUserId: string | null) {
  const reactionCounts: ReactionCounts = {};
  const viewerReactions: ReactionKey[] = [];
  for (const reaction of reactions) {
    try {
      const key = parseReactionKey(reaction.key);
      reactionCounts[key] = (reactionCounts[key] ?? 0) + 1;
      if (reaction.userId === currentUserId) viewerReactions.push(key);
    } catch {
      continue;
    }
  }
  return {
    viewerReacted: viewerReactions.includes("LIKE"),
    reactionCount: Object.values(reactionCounts).reduce<number>((sum, count) => sum + (count ?? 0), 0),
    viewerReactions,
    reactionCounts,
  };
}

export async function getHomeData(user: CurrentUser | null) {
  const prisma = getPrisma();
  const boardSelect = {
    id: true,
    slug: true,
    title: true,
    description: true,
    backgroundImageUrl: true,
    discoveryScope: true,
    attachmentDownloadPolicy: true,
    isTemplate: true,
    updatedAt: true,
    owner: { select: publicUserSelect },
    _count: { select: { sections: { where: { deletedAt: null } }, posts: { where: { deletedAt: null } } } },
  } as const;
  // 개인 소유·멤버 보드 목록은 실질적으로 무한정 커지지 않지만, VIEW_ALL_BOARDS 관리자나
  // SUPER_ADMIN의 "전체 보드/전체 보관함" 조회는 플랫폼 보드 수에 비례해 무한정 커집니다.
  // 홈 화면은 이 브라우징 용도로 설계된 페이지가 아니므로, 우선 안전판으로 상한을 둡니다
  // (관리자가 이 한도를 넘겨야 하면 별도 페이지네이션 화면으로 분리해야 합니다).
  const ADMIN_BROWSE_LIMIT = 300;
  const canViewAllBoards = Boolean(user && hasSystemPermission(user, "VIEW_ALL_BOARDS"));
  const myBoards = user
    ? await prisma.board.findMany({
        where: canViewAllBoards
          ? { deletedAt: null }
          : { deletedAt: null, OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
        orderBy: { updatedAt: "desc" },
        ...(canViewAllBoards ? { take: ADMIN_BROWSE_LIMIT } : {}),
        select: boardSelect,
      })
    : [];
  const archivedBoards = user
    ? await prisma.board.findMany({
        where: user.role === "SUPER_ADMIN"
          ? { deletedAt: { not: null } }
          : { ownerId: user.id, deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        ...(user.role === "SUPER_ADMIN" ? { take: ADMIN_BROWSE_LIMIT } : {}),
        select: { ...boardSelect, deletedAt: true },
      })
    : [];

  const serialize = (board: (typeof myBoards)[number]) => ({
    ...board,
    owner: toPublicAuthorDTO(board.owner),
    updatedAt: board.updatedAt.toISOString(),
  });
  return {
    myBoards: myBoards.map(serialize),
    archivedBoards: archivedBoards.map((board) => {
      const restoreUntil = board.deletedAt!.getTime() + 30 * 24 * 60 * 60 * 1_000;
      return {
        ...board,
        owner: toPublicAuthorDTO(board.owner),
        updatedAt: board.updatedAt.toISOString(),
        deletedAt: board.deletedAt!.toISOString(),
        restorable: restoreUntil > Date.now(),
        remainingDays: Math.max(0, Math.ceil((restoreUntil - Date.now()) / 86_400_000)),
      };
    }),
  };
}

export async function getBoardPageData(
  slug: string,
  currentUser: CurrentUser | null,
  options: { focusPostId?: string } = {},
) {
  const prisma = getPrisma();
  const access = await getBoardAccessBySlug(slug, currentUser?.id ?? null);
  if (!access) return { status: "not-found" } as const;
  if (!canReadEffectiveBoard(currentUser, access)) {
    if (!currentUser) return { status: "login-required" } as const;
    const accessRequest = await prisma.boardAccessRequest.findUnique({
      where: { boardId_userId: { boardId: access.board.id, userId: currentUser.id } },
      select: { status: true },
    });
    return {
      status: "access-required" as const,
      data: {
        boardId: access.board.id,
        boardTitle: access.board.title,
        ownerName: toPublicAuthorDTO(access.board.owner).name,
        initialRequestStatus: accessRequest?.status ?? null,
      },
    };
  }
  // 비밀번호 보호는 실제 멤버·전역 관리자에게는 적용하지 않고, 방문자 권한으로 들어온 사람에게만 요구합니다.
  if (access.role === null) {
    const isAdminOverride = Boolean(currentUser && hasSystemPermission(currentUser, "VIEW_ALL_BOARDS"));
    if (!isAdminOverride && access.board.passwordHash && !(await hasVerifiedBoardPassword(access.board.id))) {
      return {
        status: "password-required" as const,
        data: { boardId: access.board.id, boardTitle: access.board.title },
      };
    }
  }

  const canManageBoard = Boolean(currentUser && canManageBoardSettings(currentUser, access));

  const board = await prisma.board.findUnique({
    where: { id: access.board.id },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      discoveryScope: true,
      visitorPermission: true,
      loginRequired: true,
      passwordHash: true,
      state: true,
      moderationMode: true,
      freezeAt: true,
      layout: true,
      sortMode: true,
      newPostPlacement: true,
      cardSize: true,
      font: true,
      backgroundColor: true,
      backgroundImageUrl: true,
      accentColor: true,
      showAuthor: true,
      showTimestamp: true,
      reactionPolicy: true,
      attachmentDownloadPolicy: true,
      postFieldConfig: true,
      allowComments: true,
      allowReactions: true,
      allowMemberPosting: true,
      allowMemberFileUpload: true,
      owner: { select: publicUserSelect },
      // 페이지 로드에는 아바타 미리보기(4명)와 멘션 자동완성 정도만 필요한데, take 없이 매
      // 방문마다 전원의 이름·이미지를 복호화(AES-GCM)하고 있었습니다. 실제 멤버 관리(역할
      // 변경·제거)는 이 배열이 아니라 설정 패널이 열릴 때 GET /api/boards/[boardId]/members로
      // 전체를 따로 불러옵니다(pad-settings-tabs.tsx).
      members: {
        where: { user: { status: { not: "DELETED" } } },
        orderBy: { joinedAt: "asc" },
        take: MEMBER_PREVIEW_LIMIT,
        select: {
          role: true,
          user: { select: { ...publicUserSelect, emailEncrypted: true } },
        },
      },
      _count: {
        select: {
          members: { where: { user: { status: { not: "DELETED" } } } },
        },
      },
      sections: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          position: true,
          version: true,
          posts: {
            where: {
              deletedAt: null,
              ...(options.focusPostId ? { id: options.focusPostId } : {}),
              ...(canManageBoard ? {} : { OR: [{ status: "PUBLISHED" }, ...(currentUser ? [{ authorId: currentUser.id }] : [])] }),
            },
            orderBy: [{ isPinned: "desc" }, { position: "asc" }, { id: "asc" }],
            take: POST_PAGE_SIZE,
            select: {
              id: true,
              title: true,
              body: true,
              bodyFormat: true,
              status: true,
              moderationReason: true,
              customFieldValues: true,
              position: true,
              isPinned: true,
              version: true,
              createdAt: true,
              updatedAt: true,
              author: { select: publicUserSelect },
              attachments: {
                where: { deletedAt: null, commentId: null },
                orderBy: { sortOrder: "asc" },
                select: { id: true, type: true, originalName: true, mimeType: true, fileSize: true, width: true, height: true, altText: true, caption: true, externalUrl: true, previewImageUrl: true },
              },
              reactions: { select: { key: true, userId: true } },
              _count: { select: { comments: { where: { deletedAt: null } }, reactions: true } },
            },
          },
          _count: {
            select: {
              posts: canManageBoard
                ? { where: { deletedAt: null } }
                : { where: { deletedAt: null, OR: [{ status: "PUBLISHED" }, ...(currentUser ? [{ authorId: currentUser.id }] : [])] } },
            },
          },
        },
      },
    },
  });
  if (!board) return { status: "not-found" } as const;
  const { passwordHash, _count, ...boardWithoutHash } = board;

  return {
    status: "ready" as const,
    data: {
      board: {
        ...boardWithoutHash,
        hasPassword: Boolean(passwordHash),
        postFieldConfig: resolvedFieldConfig(board.postFieldConfig),
        freezeAt: board.freezeAt ? board.freezeAt.toISOString() : null,
        owner: toPublicAuthorDTO(board.owner),
        memberCount: _count.members,
        members: board.members.map((member) => ({
          role: member.role,
          user: {
            ...toPublicAuthorDTO(member.user),
            email: canManageBoard ? maskEmail(decryptUserEmail(member.user)) : null,
          },
        })),
        sections: board.sections.map((section) => ({
          id: section.id,
          title: section.title,
          description: section.description,
          position: section.position,
          version: section.version,
          totalPostCount: section._count.posts,
          posts: section.posts.map((post) => {
            const { reactions, _count, customFieldValues, ...postData } = post;
            return {
              ...postData,
              customFieldValues: customFieldValues as StoredPostFieldValues | null,
              author: toPublicAuthorDTO(post.author),
              createdAt: post.createdAt.toISOString(),
              updatedAt: post.updatedAt.toISOString(),
              ...reactionSummary(reactions, currentUser?.id ?? null),
              commentCount: _count.comments,
            };
          }),
        })),
      },
      currentRole: access.role,
      capabilities: {
        manageBoard: canManageBoard,
        archiveBoard: Boolean(currentUser && canArchiveBoard(currentUser, access)),
        viewTrash: Boolean(currentUser && (access.role || hasSystemPermission(currentUser, "VIEW_ALL_BOARDS"))),
        createPost: Boolean(currentUser && canCreatePost(currentUser, access)),
        editAnyPost: Boolean(currentUser && (
          currentUser.role === "SUPER_ADMIN"
          || hasSystemPermission(currentUser, "EDIT_ANY_CONTENT")
          || ["OWNER", "ADMIN", "EDITOR"].includes(access.role ?? "")
        )),
        editOwnContent: Boolean(currentUser && access.role && access.role !== "VIEWER"),
        moderateComments: Boolean(currentUser && (
          currentUser.role === "SUPER_ADMIN"
          || hasSystemPermission(currentUser, "MODERATE_CONTENT")
          || ["OWNER", "ADMIN", "EDITOR"].includes(access.role ?? "")
        )),
        comment: Boolean(currentUser && canComment(currentUser, access)),
        react: Boolean(currentUser && canReact(currentUser, access)),
        moderatePosts: Boolean(currentUser && canModeratePosts(currentUser, access)),
        downloadAttachments: canDownloadAttachment(currentUser, access),
      },
    },
  };
}
