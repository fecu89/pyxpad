import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireActiveUser, requireRecentAuthentication } from "@/lib/auth/authorization";
import { createAuditLogData } from "@/lib/auth/audit";
import { hashUserPassword } from "@/lib/auth/password";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { assertCanRevokeTargetSessions } from "@/lib/users/admin-policy";

const resetSchema = z.object({ reason: z.string().trim().min(3).max(500) });

function temporaryPassword() {
  return `Px!${randomBytes(9).toString("base64url")}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireActiveUser();
    const { userId } = await params;
    if (userId === actor.id) return Response.json({ error: "내 비밀번호는 프로필에서 변경해 주세요." }, { status: 409 });
    const parsed = resetSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "비밀번호 초기화 사유를 3자 이상 입력해 주세요." }, { status: 400 });

    const prisma = getPrisma();
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, passwordHash: true, authVersion: true, mustChangePassword: true },
    });
    if (!target || target.status === "DELETED") return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    if (!target.passwordHash) return Response.json({ error: "카카오 전용 계정은 초기화할 비밀번호가 없습니다." }, { status: 409 });
    assertCanRevokeTargetSessions(actor, target.role);
    if (target.role === "SUPER_ADMIN" || target.role === "ADMIN") requireRecentAuthentication(actor);

    const password = temporaryPassword();
    const passwordHash = await hashUserPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: true, authVersion: { increment: 1 } },
        select: { id: true },
      });
      await tx.adminAuditLog.create({
        data: createAuditLogData({
          actorId: actor.id,
          targetUserId: userId,
          action: "USER_PASSWORD_RESET",
          entityType: "User",
          entityId: userId,
          before: { authVersion: target.authVersion, mustChangePassword: target.mustChangePassword },
          after: { authVersion: target.authVersion + 1, mustChangePassword: true, sessionsRevoked: true },
          reason: parsed.data.reason,
        }),
      });
    });
    return Response.json(
      { ok: true, temporaryPassword: password, authVersion: target.authVersion + 1 },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return apiError(error, "비밀번호를 초기화하지 못했습니다.");
  }
}
