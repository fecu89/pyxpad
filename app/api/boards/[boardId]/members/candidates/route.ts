import { canManageBoardSettings, getEffectiveBoardAccess, requireActiveUser } from "@/lib/auth/authorization";
import { apiError } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { decryptOptionalUserPii, decryptUserLoginIdentifier, maskLoginIdentifier } from "@/lib/security/pii-crypto";

const CANDIDATE_LIMIT = 20;
// 이름은 이메일과 달리 조회용 HMAC 해시가 없어(lib/security/pii-crypto-core.ts) 텍스트로 직접
// 검색할 수 없습니다. 그래서 같은 학교 소속의 활성 사용자만 우선 좁힌 뒤(보통 한 학교 규모라
// 감당 가능한 수), 그 범위 안에서만 복호화해 이름을 대조합니다 — 학교 전체가 아니라 전체
// 사용자 기준으로 이름을 복호화하며 검색하면 비용도 크고 조직 경계를 넘어선 조회가 됩니다.
const SCHOOL_SCAN_LIMIT = 500;

// 교사 소유자는 같은 학교, 학생 소유자는 같은 학급 안에서만 초대 후보를 찾습니다. 학생에게
// 학교 전체 디렉터리를 열지 않으면서도 자신이 만든 패드에 반 친구를 초대할 수 있게 합니다.
export async function GET(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    const current = await requireActiveUser();
    const { boardId } = await params;
    const access = await getEffectiveBoardAccess(boardId, current);
    if (!access || !canManageBoardSettings(current, access)) {
      return Response.json({ error: "멤버 후보를 볼 권한이 없습니다." }, { status: 403 });
    }
    if (!current.school) {
      return Response.json({ candidates: [], note: "소속 학교 정보가 없어 후보를 찾을 수 없습니다." });
    }
    if (current.role === "STUDENT" && !current.schoolGroup) {
      return Response.json({ candidates: [], note: "소속 학급 정보가 없어 후보를 찾을 수 없습니다." });
    }

    const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
    const prisma = getPrisma();
    const [existingMembers, pool] = await Promise.all([
      prisma.boardMember.findMany({ where: { boardId }, select: { userId: true } }),
      prisma.user.findMany({
        where: current.role === "STUDENT"
          ? { schoolGroupId: current.schoolGroup!.id, status: "ACTIVE" }
          : { schoolId: current.school.id, status: "ACTIVE" },
        select: { id: true, nameEncrypted: true, loginIdentifierEncrypted: true, imageEncrypted: true, role: true },
        take: SCHOOL_SCAN_LIMIT,
      }),
    ]);
    const excluded = new Set([...existingMembers.map((member) => member.userId), current.id, access.board.ownerId]);

    const candidates = pool
      .filter((user) => !excluded.has(user.id))
      .map((user) => {
        const loginIdentifier = decryptUserLoginIdentifier(user.id, user.loginIdentifierEncrypted);
        return {
          id: user.id,
          role: user.role,
          name: decryptOptionalUserPii(user.id, "name", user.nameEncrypted),
          loginIdentifier,
        };
      })
      .filter((user) => !query || user.name?.toLowerCase().includes(query) || user.loginIdentifier.toLowerCase().includes(query))
      .slice(0, CANDIDATE_LIMIT)
      // 검색은 평문 로그인 식별자로 대조하지만 그 결과를 그대로 내려주면 패드 관리자에게
      // 학교 구성원 아이디·카카오 이메일을 통째로
      // 긁어갈 수 있습니다(다른 멤버 관련 API는 전부 마스킹함) — 응답 직전에만 마스킹합니다.
      .map((user) => ({ ...user, loginIdentifier: maskLoginIdentifier(user.loginIdentifier) }));

    return Response.json({ candidates });
  } catch (error) {
    return apiError(error, "멤버 후보를 불러오지 못했습니다.");
  }
}
