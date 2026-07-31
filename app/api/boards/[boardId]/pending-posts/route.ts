import { canModeratePosts, getEffectiveBoardAccess, requireActiveUser } from "@/lib/auth/authorization";
import { apiError } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { toPublicAuthorDTO } from "@/lib/users/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    const user = await requireActiveUser();
    const { boardId } = await params;
    const access = await getEffectiveBoardAccess(boardId, user);
    if (!access || !canModeratePosts(user, access)) {
      return Response.json({ error: "승인 대기함을 볼 권한이 없습니다." }, { status: 403 });
    }
    const posts = await getPrisma().post.findMany({
      where: { boardId, status: "PENDING", deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        sectionId: true,
        title: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, nameEncrypted: true, imageEncrypted: true } },
        section: { select: { title: true } },
      },
    });
    return Response.json({
      posts: posts.map((post) => ({
        id: post.id,
        sectionId: post.sectionId,
        sectionTitle: post.section?.title ?? null,
        title: post.title,
        body: post.body,
        createdAt: post.createdAt.toISOString(),
        author: toPublicAuthorDTO(post.author),
      })),
    });
  } catch (error) {
    return apiError(error, "승인 대기함을 불러오지 못했습니다.");
  }
}
