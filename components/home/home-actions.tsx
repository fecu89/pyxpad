"use client";

import {
  createContext,
  useContext,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { Check, ChevronLeft, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { DASHBOARD_PATH } from "@/lib/routes";

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
  loginCallbackUrl = DASHBOARD_PATH,
}: {
  children: ReactNode;
  authError?: string | null;
  initialLoginOpen?: boolean;
  loginCallbackUrl?: string;
}) {
  const [loginOpen, setLoginOpen] = useState(Boolean(authError) || initialLoginOpen);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState(authError ?? "");
  const [busy, setBusy] = useState<"credentials" | "login-id-check" | "register" | "kakao" | "logout" | null>(null);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerLoginId, setRegisterLoginId] = useState("");
  const [registerStep, setRegisterStep] = useState<"login-id" | "password">("login-id");
  const [registerPassword, setRegisterPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const authPending = busy !== null;

  async function credentialsLogin(nextLoginId: string, password: string) {
    const result = await signIn("credentials", {
      loginId: nextLoginId,
      password,
      callbackUrl: loginCallbackUrl,
      redirect: false,
    });
    if (!result?.ok || result.error) {
      throw new Error("아이디 또는 비밀번호를 확인해 주세요.");
    }
    window.location.assign(loginCallbackUrl);
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy("credentials");
    try {
      await credentialsLogin(loginId, loginPassword);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "로그인하지 못했습니다.");
      setBusy(null);
    }
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (registerStep !== "password") {
      setError("아이디 중복 확인을 먼저 완료해 주세요.");
      return;
    }
    if (registerPassword !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setBusy("register");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId: registerLoginId,
          password: registerPassword,
          passwordConfirm,
        }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        if (response.status === 409) setRegisterStep("login-id");
        throw new Error(result?.error || "회원가입을 완료하지 못했습니다.");
      }
      await credentialsLogin(registerLoginId, registerPassword);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "회원가입을 완료하지 못했습니다.");
      setBusy(null);
    }
  }

  async function checkRegisterLoginId(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy("login-id-check");
    try {
      const response = await fetch("/api/auth/register/check-login-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: registerLoginId }),
      });
      const result = await response.json().catch(() => null) as { available?: boolean; error?: string } | null;
      if (!response.ok || !result?.available) {
        throw new Error(result?.error || "사용할 수 없는 아이디입니다.");
      }
      setRegisterStep("password");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "아이디 사용 여부를 확인하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  function editRegisterLoginId() {
    setRegisterStep("login-id");
    setRegisterPassword("");
    setPasswordConfirm("");
    setError("");
  }

  async function kakaoLogin() {
    setError("");
    setBusy("kakao");
    try {
      const result = await signIn("kakao", { callbackUrl: loginCallbackUrl });
      if (result?.error) throw new Error("카카오 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카카오 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setBusy(null);
    }
  }

  async function logout() {
    setBusy("logout");
    await signOut({ callbackUrl: "/" });
  }

  const value: HomeAuthActionsValue = {
    authPending,
    openLogin: () => {
      setError("");
      setMode("login");
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
        title="PyxPad 시작하기"
        description="아이디 계정을 만들거나 카카오로 계속할 수 있어요."
        className="auth-modal"
      >
        <div className="auth-tabs" role="tablist" aria-label="로그인 방식">
          <button
            type="button"
            id="auth-login-tab"
            role="tab"
            aria-selected={mode === "login"}
            aria-controls="auth-login-panel"
            onClick={() => { setMode("login"); setError(""); }}
            disabled={authPending}
          >
            로그인
          </button>
          <button
            type="button"
            id="auth-register-tab"
            role="tab"
            aria-selected={mode === "register"}
            aria-controls="auth-register-panel"
            onClick={() => { setMode("register"); setRegisterStep("login-id"); setError(""); }}
            disabled={authPending}
          >
            회원가입
          </button>
        </div>
        {mode === "login" ? (
          <form id="auth-login-panel" className="stack-form auth-form" role="tabpanel" aria-labelledby="auth-login-tab" aria-busy={authPending} onSubmit={submitLogin}>
            <label>아이디<input type="text" value={loginId} onChange={(event) => setLoginId(event.target.value)} autoComplete="username" pattern="[A-Za-z0-9]{3,20}" minLength={3} maxLength={20} spellCheck={false} autoCapitalize="none" required autoFocus disabled={authPending} /></label>
            <label>비밀번호<input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" maxLength={128} required disabled={authPending} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="button primary full" disabled={authPending}>{busy === "credentials" ? "로그인 중…" : "로그인"}</button>
          </form>
        ) : registerStep === "login-id" ? (
          <form id="auth-register-panel" className="stack-form auth-form" role="tabpanel" aria-labelledby="auth-register-tab" aria-busy={authPending} onSubmit={checkRegisterLoginId}>
            <div className="auth-step-heading"><b>사용할 아이디를 정해 주세요</b><span>3~20자 영문자와 숫자만 사용할 수 있습니다.</span></div>
            <label>아이디<input type="text" value={registerLoginId} onChange={(event) => { setRegisterLoginId(event.target.value); setError(""); }} autoComplete="username" pattern="[A-Za-z0-9]{3,20}" minLength={3} maxLength={20} spellCheck={false} autoCapitalize="none" required autoFocus disabled={authPending} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="button primary full" disabled={authPending}>{busy === "login-id-check" ? "확인하는 중…" : "아이디 중복 확인"}</button>
          </form>
        ) : (
          <form id="auth-register-panel" className="stack-form auth-form" role="tabpanel" aria-labelledby="auth-register-tab" aria-busy={authPending} onSubmit={submitRegister}>
            <div className="auth-verified-login-id"><span><Check size={15} aria-hidden />사용 가능한 아이디<b>{registerLoginId}</b></span><button type="button" onClick={editRegisterLoginId} disabled={authPending}><ChevronLeft size={14} aria-hidden />변경</button></div>
            <label>비밀번호<input type="password" value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required autoFocus disabled={authPending} /></label>
            <ul className="auth-password-rules" aria-label="비밀번호 조건">
              <li data-met={registerPassword.length >= 10}><Check size={12} aria-hidden />10자 이상</li>
              <li data-met={/[A-Za-z]/u.test(registerPassword)}><Check size={12} aria-hidden />영문자</li>
              <li data-met={/[0-9]/u.test(registerPassword)}><Check size={12} aria-hidden />숫자</li>
              <li data-met={/[^A-Za-z0-9\s]/u.test(registerPassword)}><Check size={12} aria-hidden />특수문자</li>
            </ul>
            <label>비밀번호 확인<input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required disabled={authPending} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="button primary full" disabled={authPending}>{busy === "register" ? "계정 만드는 중…" : "계정 만들기"}</button>
            <p className="form-hint">계정을 만든 뒤 닉네임과 학교·반 또는 부서를 설정합니다. 교사 가입은 학교 관리자 승인 후 완료됩니다.</p>
          </form>
        )}
        <div className="auth-provider-divider"><span>또는</span></div>
        <div className="auth-provider-actions">
          <button type="button" className="button kakao full" onClick={kakaoLogin} disabled={authPending} aria-label="카카오로 계속하기">
            <svg viewBox="0 0 86.78 91.78" aria-hidden>
              <path fill="currentColor" d="M43.39 0C19.43 0 0 17.97 0 40.13c0 16.37 6.86 24.19 16.25 31.31l.04.02v19.21c0 .91 1.04 1.43 1.76.88L34.5 79.33l.36.15c2.76.51 5.61.78 8.53.78 23.96 0 43.39-17.97 43.39-40.14S67.36 0 43.39 0" />
            </svg>
            {busy === "kakao" ? "카카오로 이동 중…" : "카카오로 계속하기"}
          </button>
          <p className="form-hint">카카오는 검증된 이메일과 프로필 정보를 연결합니다.</p>
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
export function ProfileButton({ name, image, loginIdentifier }: { name: string | null; image: string | null; loginIdentifier: string }) {
  return (
    <Link href="/profile" className="user-pill">
      <Avatar name={name} identifier={loginIdentifier} image={image} size="small" />
      {name || loginIdentifier}
    </Link>
  );
}
