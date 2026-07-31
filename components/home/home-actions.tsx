"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";

type HomeAuthActionsValue = {
  authPending: boolean;
  openLogin: () => void;
  logout: () => Promise<void>;
};

const HomeAuthActionsContext = createContext<HomeAuthActionsValue | null>(null);

function useHomeAuthActions() {
  const value = useContext(HomeAuthActionsContext);
  if (!value) throw new Error("홈 인증 액션은 HomeAuthActionsProvider 안에서 사용해야 합니다.");
  return value;
}

// 로그인 모달용 props(authError·initialLoginOpen·loginCallbackUrl)는 비로그인 화면에서만
// 의미가 있어 optional입니다. 로그인 사용자에게도 이 Provider가 필요합니다 — 헤더의
// LogoutButton이 여기서 logout을 받아 쓰기 때문입니다.
export function HomeAuthActionsProvider({
  children,
  authError = null,
  initialLoginOpen = false,
  loginCallbackUrl = "/",
}: {
  children: ReactNode;
  authError?: string | null;
  initialLoginOpen?: boolean;
  loginCallbackUrl?: string;
}) {
  const [loginOpen, setLoginOpen] = useState(Boolean(authError) || initialLoginOpen);
  const [error, setError] = useState(authError ?? "");
  const [authPending, setAuthPending] = useState(false);

  async function login() {
    setError("");
    setAuthPending(true);
    try {
      const result = await signIn("kakao", { callbackUrl: loginCallbackUrl });
      if (result?.error) {
        setError("카카오 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        setAuthPending(false);
      }
    } catch {
      setError("카카오 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setAuthPending(false);
    }
  }

  async function logout() {
    setAuthPending(true);
    await signOut({ callbackUrl: "/" });
  }

  const value: HomeAuthActionsValue = {
    authPending,
    openLogin: () => {
      setError("");
      setLoginOpen(true);
    },
    logout,
  };

  return (
    <HomeAuthActionsContext.Provider value={value}>
      {children}
      <Modal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title="PyxPad 로그인"
        description="카카오 계정으로 안전하게 시작하세요."
      >
        <div className="stack-form oauth-login">
          <p>로그인하면 역할과 초대 권한에 따라 패드를 만들거나 글과 댓글을 남길 수 있어요.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button
            type="button"
            className="button kakao full"
            onClick={login}
            disabled={authPending}
            aria-label="카카오로 계속하기"
          >
            <svg viewBox="0 0 86.78 91.78" aria-hidden>
              <path fill="currentColor" d="M43.39 0C19.43 0 0 17.97 0 40.13c0 16.37 6.86 24.19 16.25 31.31l.04.02v19.21c0 .91 1.04 1.43 1.76.88L34.5 79.33l.36.15c2.76.51 5.61.78 8.53.78 23.96 0 43.39-17.97 43.39-40.14S67.36 0 43.39 0" />
            </svg>
            {authPending ? "카카오로 이동 중..." : "카카오로 계속하기"}
          </button>
          <p className="form-hint">카카오에서 이메일과 프로필 정보 제공에 동의해야 합니다.</p>
        </div>
      </Modal>
    </HomeAuthActionsContext.Provider>
  );
}

export function LoginButton({ className, children }: { className: string; children: ReactNode }) {
  const { openLogin } = useHomeAuthActions();
  return <button type="button" className={className} onClick={openLogin}>{children}</button>;
}

export function LogoutButton() {
  const { authPending, logout } = useHomeAuthActions();
  return (
    <button
      type="button"
      className="icon-button"
      onClick={logout}
      disabled={authPending}
      aria-label="로그아웃"
    >
      <LogOut size={17} />
    </button>
  );
}

// 프로필은 모달이 아니라 /profile 라우트의 페이지입니다(components/home/profile-form.tsx).
// 헤더의 이 버튼은 그 페이지로 가는 링크일 뿐이라, 이름·아바타는 layout이 이미 가진 user에서
// 그대로 받습니다 — 프로필을 저장하면 router.refresh()가 layout까지 갱신해 여기도 최신이 됩니다.
export function ProfileButton({ name, image, email }: { name: string | null; image: string | null; email: string | null }) {
  return (
    <Link href="/profile" className="user-pill">
      <Avatar name={name} email={email} image={image} size="small" />
      {name || email}
    </Link>
  );
}
