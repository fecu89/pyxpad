import "server-only";

import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { getPrivateUserDTO, type PrivateUserDTO } from "@/lib/users/repository";

export type CurrentUser = PrivateUserDTO;

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

// layout.tsx와 page.tsx가 같은 요청 안에서 각자 호출해도 실제 세션·DB 조회는 한 번만 일어나도록
// React cache()로 감쌉니다(app/(dashboard)/layout.tsx + 그 아래 page.tsx가 대표적인 소비처).
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const user = await getPrivateUserDTO(userId);
  return user?.status === "ACTIVE" ? user : null;
});

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError();
  return user;
}

export class AuthenticationError extends Error {
  constructor() {
    super("로그인이 필요합니다.");
    this.name = "AuthenticationError";
  }
}
