import { canComment, canModeratePosts, canReadEffectiveBoard, getEffectiveBoardAccess, isBoardFrozen, isBoardScopedCommentCreate, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recordBoardActivity } from "@/lib/board/activity";
import { createCommentSchema } from "@/lib/board/validators";
import { validateCommentMentionUserIds, CommentMentionValidationError } from "@/lib/comments/mentions";
import { apiError, assertSameOrigin } from "@/lib/http";
import { createNotification } from "@/lib/notifications/create";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";
import { toPublicAuthorDTO } from "@/lib/users/repository";

const commentSelect = {
  id: true,
  body: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, nameEncrypted: true, imageEncrypted: true, status: true } },
  mentions: { select: { userId: true } },
  attachments: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, type: true, originalName: true, mimeType: true, fileSize: true, width: true, height: true, altText: true, caption: true, externalUrl: true, previewImageUrl: true },
  },
} as const;

const COMMENT_PAGE_SIZE = 20;

async function findPost(postId: string) {
  return getPrisma().post.findFirst({
    where: { id: postId, deletedAt: null, board: { deletedAt: null } },
    select: { id: true, boardId: true, authorId: true, status: true },
  });
}

function serializeComment(comment: {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; nameEncrypted: string | null; imageEncrypted: string | null; status: "ACTIVE" | "SUSPENDED" | "DELETED" };
  mentions: { userId: string }[];
  attachments: unknown[];
}) {
  return {
    ...comment,
    author: {
      ...toPublicAuthorDTO(comment.author),
      mentionable: comment.author.status === "ACTIVE",
    },
    mentionedUserIds: comment.mentions.map((mention) => mention.userId),
    mentions: undefined,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const post = await findPost(postId);
    if (!post) return Response.json({ error: "게시물을 찾을 수 없습니다." }, { status: 404 });
    const currentUser = await getCurrentUser();
    const access = await getEffectiveBoardAccess(post.boardId, currentUser);
    if (!access || !canReadEffectiveBoard(currentUser, access)) return Response.json({ error: "댓글을 볼 권한이 없습니다." }, { status: 403 });
    if (post.status !== "PUBLISHED") {
      const canSeePending = Boolean(currentUser && (currentUser.id === post.authorId || canModeratePosts(currentUser, access)));
      if (!canSeePending) return Response.json({ error: "댓글을 볼 권한이 없습니다." }, { status: 403 });
    }
    const cursor = new URL(request.url).searchParams.get("cursor");
    const prisma = getPrisma();
    // 새 UI는 대댓글을 들여쓰기하지 않고 @멘션 중심의 한 흐름으로 보여줍니다. 기존 parentId는
    // 데이터 호환을 위해 그대로 반환하지만, 모든 댓글을 같은 페이지네이션 단위로 조회해야 삭제된
    // 부모 아래의 옛 답글도 사라지지 않고 최신 멘션 댓글도 첫 화면에 포함됩니다.
    const pageWithExtra = await prisma.comment.findMany({
      where: { postId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: COMMENT_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: commentSelect,
    });
    const hasMore = pageWithExtra.length > COMMENT_PAGE_SIZE;
    const page = hasMore ? pageWithExtra.slice(0, COMMENT_PAGE_SIZE) : pageWithExtra;
    const comments = [...page].sort((left, right) => (
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
    ));
    return Response.json({
      comments: comments.map(serializeComment),
      hasMore,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    return apiError(error, "댓글을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const { postId } = await params;
    const post = await findPost(postId);
    if (!post) return Response.json({ error: "게시물을 찾을 수 없습니다." }, { status: 404 });
    const access = await getEffectiveBoardAccess(post.boardId, user);
    if (!access || !canComment(user, access)) return Response.json({ error: "댓글 작성 권한이 없습니다." }, { status: 403 });
    if (post.status !== "PUBLISHED") return Response.json({ error: "승인되지 않은 게시물에는 댓글을 달 수 없습니다." }, { status: 409 });
    if (isBoardFrozen(access)) return Response.json({ error: "동결된 패드에는 댓글을 달 수 없습니다." }, { status: 409 });
    const parsed = createCommentSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "댓글을 입력해 주세요." }, { status: 400 });
    const prisma = getPrisma();
    if (parsed.data.parentId) {
      const parent = await prisma.comment.findFirst({ where: { id: parsed.data.parentId, postId, deletedAt: null }, select: { id: true } });
      if (!parent) return Response.json({ error: "같은 게시물의 댓글에만 답글을 달 수 있습니다." }, { status: 400 });
    }
    const mentionedUserIds = await validateCommentMentionUserIds({ boardId: post.boardId, postId, mentionedUserIds: parsed.data.mentionedUserIds });
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          postId,
          authorId: user.id,
          body: parsed.data.body,
          parentId: parsed.data.parentId ?? null,
          mentions: mentionedUserIds.length ? { createMany: { data: mentionedUserIds.map((userId) => ({ userId })) } } : undefined,
        },
        select: commentSelect,
      });
      if (!isBoardScopedCommentCreate(access)) {
        await tx.adminAuditLog.create({ data: createAuditLogData({
          actorId: user.id,
          action: "GLOBAL_POST_CREATED",
          entityType: "Comment",
          entityId: created.id,
          after: { postId },
        }) });
      }
      return created;
    });
    const commentCount = await prisma.comment.count({ where: { postId, deletedAt: null } });
    const activityId = await recordBoardActivity({ boardId: post.boardId, actorId: user.id, type: "COMMENT_CREATED", postId, commentId: comment.id });
    publishBoardEvent(post.boardId, {
      type: "comment.created",
      entityId: comment.id,
      postId,
      actorId: user.id,
      activityId,
      payload: { commentCount },
    });
    if (!mentionedUserIds.includes(post.authorId)) {
      await createNotification({ userId: post.authorId, actorId: user.id, type: "POST_COMMENTED", boardId: post.boardId, postId, commentId: comment.id });
    }
    await Promise.all(mentionedUserIds.map((userId) => createNotification({
      userId,
      actorId: user.id,
      type: "COMMENT_MENTIONED",
      boardId: post.boardId,
      postId,
      commentId: comment.id,
    })));
    return Response.json({ comment: serializeComment(comment), commentCount }, { status: 201 });
  } catch (error) {
    if (error instanceof CommentMentionValidationError) return Response.json({ error: error.message }, { status: 400 });
    return apiError(error, "댓글을 등록하지 못했습니다.");
  }
}
