"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Check, Mail, School, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import styles from "@/components/home/pad-dashboard.module.css";

// 예전에는 이 폼이 모달 안에 있었지만("마이페이지가 왜 굳이 창을 띄우냐"는 피드백), 지금은
// /profile 라우트의 페이지 본문입니다. 폼 자체의 마크업·핸들러는 그대로 옮겨왔고, 탈퇴 후
// 로그아웃만 컨텍스트(HomeAuthActionsProvider.logout) 대신 signOut을 직접 호출합니다.
const roleLabel = { SUPER_ADMIN: "전체관리자", ADMIN: "보조관리자", TEACHER: "교사", STUDENT: "학생" } as const;

export function ProfileForm({ initialName, initialImage, email, role, school, schoolGroup }: {
  initialName: string | null;
  initialImage: string | null;
  email: string | null;
  role: keyof typeof roleLabel;
  school: { id: string; name: string } | null;
  schoolGroup: { id: string; name: string; type: "CLASS" | "DEPARTMENT" } | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [image, setImage] = useState(initialImage);
  // 한 번에 하나의 동작만 진행 중임을 구분해서, 어느 버튼이 "지금 처리 중"인지 문구로 보여줍니다
  // (이전에는 pending 하나만 있어서 사진을 올리는 동안에도 아무 안내 없이 버튼만 비활성화됐습니다).
  const [busy, setBusy] = useState<"name" | "photo" | "remove" | "delete" | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = busy !== null;

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  function flashSaved() {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2200);
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy("name");
    try {
      const data = new FormData(event.currentTarget);
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name") }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setName(result.name);
      flashSaved();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setBusy("photo");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/me/avatar", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setImage(result.image);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function removePhoto() {
    setError("");
    setBusy("remove");
    try {
      const response = await fetch("/api/me/avatar", { method: "DELETE" });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      setImage(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    if (!window.confirm("정말 탈퇴하시겠어요? 로그인한 카카오 계정으로는 다시 로그인할 수 없고, 되돌릴 수 없습니다.")) return;
    setDeleteError("");
    setBusy("delete");
    try {
      const response = await fetch("/api/me", { method: "DELETE" });
      if (!response.ok) {
        setDeleteError((await response.json()).error);
        return;
      }
      await signOut({ callbackUrl: "/" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.root}>
      <header className={styles.heading}>
        <div><span className={styles.eyebrow}>MY PAGE</span><h1>내 프로필</h1></div>
      </header>

      <div className="profile-page-grid">
        <aside className="profile-summary-card">
          <Avatar name={name} email={email} image={image} size="medium" />
          <div className="profile-summary-copy">
            <span className="profile-role">{roleLabel[role]}</span>
            <h2>{name || "이름 없음"}</h2>
            <p><Mail size={14} aria-hidden />{email || "이메일 없음"}</p>
            <dl>
              <div><dt><School size={14} aria-hidden />학교</dt><dd>{school?.name ?? "미지정"}</dd></div>
              <div><dt><Users size={14} aria-hidden />{schoolGroup?.type === "DEPARTMENT" ? "부서" : "반"}</dt><dd>{schoolGroup?.name ?? "미지정"}</dd></div>
            </dl>
          </div>
          <div className="profile-photo-actions">
            <label className="button soft small">
              {busy === "photo" ? "업로드 중..." : "사진 바꾸기"}
              <input type="file" accept="image/*" onChange={uploadPhoto} disabled={pending} hidden />
            </label>
            {image && <button type="button" className="button ghost small" onClick={removePhoto} disabled={pending}>{busy === "remove" ? "제거하는 중..." : "제거"}</button>}
          </div>
        </aside>

        <div className="stack-form profile-page-form">
          <section className="profile-form-section">
            <header><span>프로필 정보</span><small>패드와 댓글에 표시되는 이름입니다.</small></header>
            <form onSubmit={saveName}>
              <label>닉네임<input name="name" defaultValue={name ?? ""} required maxLength={60} /></label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button primary full" disabled={pending}>{busy === "name" ? "저장하는 중..." : saved ? <><Check size={15} />저장됨</> : "저장"}</button>
            </form>
          </section>
          <div className="settings-info-zone">
            <span><b>내 데이터 다운로드</b><small>내가 만든 패드 목록, 참여 중인 패드, 작성한 글·댓글을 JSON으로 받아요.</small></span>
            <a className="button soft" href="/api/me/export" download>다운로드</a>
          </div>
          <div className="settings-danger-zone">
            <span><b>계정 탈퇴</b><small>같은 카카오 계정으로는 다시 로그인할 수 없고, 되돌릴 수 없어요. 소유한 패드가 있으면 먼저 정리해야 해요.</small></span>
            <button type="button" className="button danger" onClick={deleteAccount} disabled={pending}>{busy === "delete" ? "처리하는 중..." : "탈퇴"}</button>
          </div>
          {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
        </div>
      </div>
    </section>
  );
}
