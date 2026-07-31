import { canModeratePosts, canReadEffectiveBoard, getEffectiveBoardAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/current-user";
import { apiError } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { parseReactionKey } from "@/lib/reactions/validation";
import type { ReactionCounts, ReactionKey } from "@/lib/reactions/types";
import { toPublicAuthorDTO } from "@/lib/users/repository";

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

// Search runs on the server so posts outside the first SSR page remain discoverable.
export async function GET(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    const { boardId } = await params;
    const term = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (!term) return Response.json({ posts: [] });
    const currentUser = await getCurrentUser();
    const access = await getEffectiveBoardAccess(boardId, currentUser);
    if (!access || !canReadEffectiveBoard(currentUser, access)) return Response.json({ error: "검색할 권한이 없습니다." }, { status: 403 });
    const canManage = Boolean(currentUser && canModeratePosts(currentUser, access));
    const posts = await getPrisma().post.findMany({
      where: {
        boardId,
        deletedAt: null,
        AND: [
          { OR: [{ title: { contains: term, mode: "insensitive" } }, { body: { contains: term, mode: "insensitive" } }] },
          canManage ? {} : { OR: [{ status: "PUBLISHED" }, ...(currentUser ? [{ authorId: currentUser.id }] : [])] },
        ],
      },
      orderBy: [{ isPinned: "desc" }, { position: "asc" }],
      take: 50,
      select: {
        id: true,
        sectionId: true,
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
        reactions: { select: { key: true, userId: true } },
        _count: { select: { comments: { where: { deletedAt: null } }, reactions: true } },
      },
    });
    return Response.json({
      posts: posts.map((post) => {
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
    });
  } catch (error) {
    return apiError(error, "검색하지 못했습니다.");
  }
}
