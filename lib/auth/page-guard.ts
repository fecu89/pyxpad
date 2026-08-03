import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeInternalCallbackUrl } from "@/lib/auth/callback-url";

export { safeInternalCallbackUrl } from "@/lib/auth/callback-url";

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
