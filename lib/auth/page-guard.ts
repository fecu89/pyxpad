import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

const CALLBACK_BASE_URL = "https://pyxpad.local";

export function safeInternalCallbackUrl(
  value: string | string[] | undefined,
  fallback = "/",
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }

  try {
    const callbackUrl = new URL(candidate, CALLBACK_BASE_URL);
    if (callbackUrl.origin !== CALLBACK_BASE_URL) return fallback;
    return callbackUrl.pathname + callbackUrl.search + callbackUrl.hash;
  } catch {
    return fallback;
  }
}

export function loginRedirectPath(callbackUrl: string): string {
  const searchParams = new URLSearchParams({
    login: "1",
    callbackUrl: safeInternalCallbackUrl(callbackUrl),
  });
  return "/?" + searchParams.toString();
}

export function redirectToLogin(callbackUrl: string): never {
  redirect(loginRedirectPath(callbackUrl));
}

export async function requireAuthenticatedPage(callbackUrl: string) {
  const user = await getCurrentUser();
  if (!user) redirectToLogin(callbackUrl);
  return user;
}
