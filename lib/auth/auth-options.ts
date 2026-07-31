import "server-only";

import { randomUUID } from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import KakaoProvider, { type KakaoProfile } from "next-auth/providers/kakao";
import { getPrisma } from "@/lib/prisma";
import {
  createEmailLookup,
  encryptOptionalUserPii,
  encryptUserPii,
  normalizeEmail,
} from "@/lib/security/pii-crypto";

function secureKakaoImage(image: string | null | undefined) {
  if (!image) return null;
  return image.startsWith("http://k.kakaocdn.net") ? image.replace("http://", "https://") : image;
}

function isVerifiedKakaoProfile(profile: KakaoProfile | undefined) {
  return profile?.kakao_account?.is_email_valid === true
    && profile.kakao_account.is_email_verified === true;
}

function onboardingState(user: {
  onboardingCompletedAt: Date | null;
  teacherApprovalRequest: { status: "PENDING" | "APPROVED" | "REJECTED" } | null;
}) {
  if (user.onboardingCompletedAt) return "COMPLETE" as const;
  if (user.teacherApprovalRequest?.status === "PENDING") return "TEACHER_PENDING" as const;
  return "PROFILE" as const;
}

async function findUserByKakaoEmail(email: string) {
  return getPrisma().user.findUnique({
    where: { emailLookup: createEmailLookup(email) },
    select: { id: true, status: true, authVersion: true },
  });
}

async function syncKakaoUser(user: { email?: string | null; name?: string | null; image?: string | null }) {
  if (!user.email) throw new Error("카카오 이메일이 필요합니다.");
  const email = normalizeEmail(user.email);
  const emailLookup = createEmailLookup(email);
  const name = user.name?.trim().slice(0, 60) || null;
  const image = secureKakaoImage(user.image);
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { emailLookup }, select: { id: true } });
  const now = new Date();

  if (existing) {
    // 최초 로그인 이후의 닉네임·프로필 사진은 사용자가 /api/me에서 직접 관리하므로,
    // 재로그인 때 카카오 프로필로 덮어쓰지 않습니다(이메일만 신원 확인용으로 갱신).
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        emailEncrypted: encryptUserPii(existing.id, "email", email),
        lastLoginAt: now,
      },
      select: {
        id: true,
        status: true,
        authVersion: true,
        onboardingCompletedAt: true,
        teacherApprovalRequest: { select: { status: true } },
      },
    });
  }

  const id = randomUUID();
  const bootstrapEmail = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL
    ? normalizeEmail(process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL)
    : null;
  const role = bootstrapEmail === email ? "SUPER_ADMIN" : "STUDENT";
  return prisma.user.create({
    data: {
      id,
      emailLookup,
      emailEncrypted: encryptUserPii(id, "email", email),
      nameEncrypted: encryptOptionalUserPii(id, "name", name),
      imageEncrypted: encryptOptionalUserPii(id, "image", image),
      role,
      lastLoginAt: now,
    },
    select: {
      id: true,
      status: true,
      authVersion: true,
      onboardingCompletedAt: true,
      teacherApprovalRequest: { select: { status: true } },
    },
  });
}

function clearTokenProfile(token: Record<string, unknown>) {
  delete token.email;
  delete token.name;
  delete token.picture;
  delete token.sub;
}

export const authOptions = {
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/",
    error: "/",
  },
  providers: [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID ?? "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "profile_nickname profile_image account_email",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "kakao" || !user.email) return false;
      if (!isVerifiedKakaoProfile(profile as KakaoProfile | undefined)) return false;
      const existing = await findUserByKakaoEmail(user.email);
      return !existing || existing.status === "ACTIVE";
    },
    async jwt({ token, user, account }) {
      let userId = typeof token.userId === "string" ? token.userId : null;
      let authVersion = typeof token.authVersion === "number" ? token.authVersion : null;
      let onboardingCompleted = typeof token.onboardingCompleted === "boolean" ? token.onboardingCompleted : undefined;
      let currentOnboardingState = token.onboardingState;

      if (user && account?.provider === "kakao" && user.email) {
        const dbUser = await syncKakaoUser(user);
        if (dbUser.status === "ACTIVE") {
          userId = dbUser.id;
          authVersion = dbUser.authVersion;
          onboardingCompleted = dbUser.onboardingCompletedAt !== null;
          currentOnboardingState = onboardingState(dbUser);
        } else {
          userId = null;
          authVersion = null;
          onboardingCompleted = undefined;
          currentOnboardingState = undefined;
        }
      } else if (userId && authVersion !== null) {
        const current = await getPrisma().user.findUnique({
          where: { id: userId },
          select: {
            status: true,
            authVersion: true,
            onboardingCompletedAt: true,
            teacherApprovalRequest: { select: { status: true } },
          },
        });
        if (!current || current.status !== "ACTIVE" || current.authVersion !== authVersion) {
          userId = null;
          authVersion = null;
          onboardingCompleted = undefined;
          currentOnboardingState = undefined;
        } else {
          onboardingCompleted = current.onboardingCompletedAt !== null;
          currentOnboardingState = onboardingState(current);
        }
      } else {
        userId = null;
        authVersion = null;
        onboardingCompleted = undefined;
        currentOnboardingState = undefined;
      }

      token.userId = userId ?? undefined;
      token.authVersion = authVersion ?? undefined;
      token.onboardingCompleted = onboardingCompleted;
      token.onboardingState = currentOnboardingState;
      token.sessionInvalid = !userId;
      clearTokenProfile(token);
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: typeof token.userId === "string" && token.sessionInvalid !== true ? token.userId : undefined,
        onboardingCompleted: token.onboardingCompleted,
        onboardingState: token.onboardingState,
        name: null,
        email: null,
        image: null,
      };
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 7,
  },
} satisfies NextAuthOptions;
