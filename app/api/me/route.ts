import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { z } from "zod";
import { requireActiveUser } from "@/lib/auth/authorization";
import { getAvatarPath } from "@/lib/files/paths";
import { apiError, assertSameOrigin } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { encryptUserPii } from "@/lib/security/pii-crypto";

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "닉네임을 입력해 주세요.").max(60, "닉네임은 60자 이하로 입력해 주세요."),
});

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const parsed = updateProfileSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "닉네임을 확인해 주세요." }, { status: 400 });
    await getPrisma().user.update({
      where: { id: user.id },
      data: { nameEncrypted: encryptUserPii(user.id, "name", parsed.data.name) },
    });
    return Response.json({ ok: true, name: parsed.data.name });
  } catch (error) {
    return apiError(error, "프로필을 저장하지 못했습니다.");
  }
}

// 소유한 보드가 있으면 탈퇴를 막습니다. 다른 멤버가 있는 보드의 소유자 자리가 갑자기 비면
// 곤란해지므로, 먼저 소유권을 넘기거나 보드를 정리한 뒤 탈퇴하도록 안내합니다.
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveUser();
    const prisma = getPrisma();
    const ownedBoardCount = await prisma.board.count({ where: { ownerId: user.id } });
    if (ownedBoardCount > 0) {
      return Response.json({ error: "소유한 패드가 있으면 탈퇴할 수 없습니다. 먼저 패드 소유권을 넘기거나 패드를 정리해 주세요." }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: "DELETED",
        authVersion: { increment: 1 },
        nameEncrypted: encryptUserPii(user.id, "name", "탈퇴한 사용자"),
        imageEncrypted: null,
        // 탈퇴 후 같은 카카오 계정으로 다시 가입할 수 있도록 조회 키를 무효화합니다.
        emailLookup: `deleted:${randomUUID()}`,
      },
    });
    await unlink(getAvatarPath(user.id)).catch(() => undefined);

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "회원 탈퇴를 처리하지 못했습니다.");
  }
}
