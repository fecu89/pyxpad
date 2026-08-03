import { canCreatePost, canModeratePosts, canReadEffectiveBoard, determineInitialPostStatus, getEffectiveBoardAccess, isBoardFrozen, requireActiveUser } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { recordBoardActivity } from "@/lib/board/activity";
import { POST_PAGE_SIZE } from "@/lib/board/queries";
import { createPostSchema } from "@/lib/board/validators";
import { getCurrentUser } from "@/lib/auth/current-user";
import { apiError, assertSameOrigin } from "@/lib/http";
import { createNotification } from "@/lib/notifications/create";
import { getPrisma } from "@/lib/prisma";
import { publishBoardEvent } from "@/lib/realtime/board-events";
import { assertRateLimit } from "@/lib/security/rate-limit";
import { toPublicAuthorDTO } from "@/lib/users/repository";
import { defaultPostFieldConfig } from "@/lib/post-fields/defaults";
import { parsePostFieldConfig, validatePostFieldSubmission, validateSystemPostFields, PostFieldValidationError } from "@/lib/post-fields/validation";
import { parseReactionKey } from "@/lib/reactions/validation";
import type { ReactionCounts, ReactionKey } from "@/lib/reactions/types";

export const runtime = "nodejs";

const postListSelect = {
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
  author: { select: { id: true, nameEncrypted: true, imageEncrypted: true } },
  attachments: {
    where: { deletedAt: null, commentId: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, type: true, originalName: true, mimeType: true, fileSize: true, width: true, height: true, altText: true, caption: true, externalUrl: true, previewImageUrl: true },
  },
  _count: { select: { comments: { where: { deletedAt: null } }, reactions: true } },
} as const;

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

// 게시물이 페이지당 개수를 넘어도 "더 보기"로 다음 페이지를 이어서 불러옵니다(padupgrade.md 4.1).
export async function GET(request: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  try {
    const { sectionId } = await params;
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? String(POST_PAGE_SIZE)) || POST_PAGE_SIZE));

    const prisma = getPrisma();
    const section = await prisma.section.findFirst({ where: { id: sectionId, deletedAt: null, board: { deletedAt: null } }, select: { id: true, boardId: true, board: { select: { postFieldConfig: true, newPostPlacement: true } } } });
    if (!section) return Response.json({ error: "섹션을 찾을 수 없습니다." }, { status: 404 });
    const currentUser = await getCurrentUser();
    const access = await getEffectiveBoardAccess(section.boardId, currentUser);
    if (!access || !canReadEffectiveBoard(currentUser, access)) return Response.json({ error: "게시물을 볼 권한이 없습니다." }, { status: 403 });

    const canManage = Boolean(currentUser && canModeratePosts(currentUser, access));
    const reactionsSelect = { select: { key: true, userId: true } } as const;
    const posts = await prisma.post.findMany({
      where: {
        sectionId,
        deletedAt: null,
        ...(canManage ? {} : { OR: [{ status: "PUBLISHED" }, ...(currentUser ? [{ authorId: currentUser.id }] : [])] }),
      },
      orderBy: [{ isPinned: "desc" }, { position: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { ...postListSelect, reactions: reactionsSelect },
    });
    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;

    return Response.json({
      posts: page.map((post) => {
        const { reactions, _count, ...postData } = post;
        return {
          ...postData,
          author: toPublicAuthorDTO(post.author),
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
          ...reactionSummary(reactions, currentUser?.id ?? null),
          commentCount: _count.comments,
        };
      }),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    return apiError(error, "게시물을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    // 글 한 건마다 활동 로그·알림·SSE 발행이 따라붙습니다. 수업 중 연속 작성은 통과하고
    // 스크립트 도배만 걸리는 선입니다.
    assertRateLimit(request, {
      scope: "post-create",
      userId: user.id,
      windowMs: 60_000,
      maxAttempts: 30,
      message: "글을 너무 빠르게 작성했습니다. 잠시 후 다시 시도해 주세요.",
    });
    const { sectionId } = await params;
    const parsed = createPostSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
    const prisma = getPrisma();
    const section = await prisma.section.findFirst({ where: { id: sectionId, deletedAt: null, board: { deletedAt: null } }, select: { id: true, boardId: true, board: { select: { postFieldConfig: true, newPostPlacement: true } } } });
    if (!section) return Response.json({ error: "섹션을 찾을 수 없습니다." }, { status: 404 });
    const access = await getEffectiveBoardAccess(section.boardId, user);
    if (!access || !canCreatePost(user, access)) return Response.json({ error: "게시물 작성 권한이 없습니다." }, { status: 403 });
    if (isBoardFrozen(access)) return Response.json({ error: "동결된 패드에는 글을 쓸 수 없습니다." }, { status: 409 });
    const fieldConfig = parsePostFieldConfig(section.board.postFieldConfig ?? defaultPostFieldConfig);
    const systemFields = validateSystemPostFields(fieldConfig, { title: parsed.data.title, body: parsed.data.body, attachmentCount: parsed.data.attachmentCount });
    const customFieldValues = validatePostFieldSubmission(fieldConfig, parsed.data.fieldConfigVersion ?? fieldConfig.version, parsed.data.customFieldValues);
    const placement = section.board.newPostPlacement;
    const edge = await prisma.post.findFirst({ where: { sectionId, deletedAt: null }, orderBy: { position: placement === "START" ? "asc" : "desc" }, select: { position: true } });
    const position = placement === "START" ? (edge?.position ?? 1024) - 1024 : (edge?.position ?? 0) + 1024;
    const boardScopedCreate = !!access.role && access.role !== "VIEWER" && (access.role !== "MEMBER" || access.board.allowMemberPosting);
    const status = determineInitialPostStatus(user, access);
    const post = await prisma.$transaction(async (transaction) => {
      const created = await transaction.post.create({
        data: { boardId: section.boardId, sectionId, authorId: user.id, title: systemFields.title || null, body: systemFields.body, customFieldValues, position, status },
        select: { id: true, boardId: true, sectionId: true, title: true, body: true, position: true, version: true, createdAt: true, status: true },
      });
      if (!boardScopedCreate) {
        await transaction.adminAuditLog.create({ data: createAuditLogData({ actorId: user.id, action: "GLOBAL_POST_CREATED", entityType: "Post", entityId: created.id, after: { boardId: section.boardId, sectionId }, reason: "전역 권한으로 게시물 생성" }) });
      }
      return created;
    });
    const activityId = await recordBoardActivity({ boardId: section.boardId, actorId: user.id, type: "POST_CREATED", postId: post.id });
    publishBoardEvent(section.boardId, { type: "post.created", entityId: post.id, sectionId, actorId: user.id, activityId });
    if (status === "PENDING") {
      const managers = await prisma.boardMember.findMany({ where: { boardId: section.boardId, role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } });
      const managerIds = new Set(managers.map((member) => member.userId));
      managerIds.add(access.board.ownerId);
      await Promise.all([...managerIds].map((managerId) => createNotification({
        userId: managerId,
        actorId: user.id,
        type: "POST_PENDING_REVIEW",
        boardId: section.boardId,
        postId: post.id,
      })));
    }
    return Response.json({ post: { ...post, createdAt: post.createdAt.toISOString() } }, { status: 201 });
  } catch (error) {
    if (error instanceof PostFieldValidationError) return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
    return apiError(error, "게시물을 만들지 못했습니다.");
  }
}
