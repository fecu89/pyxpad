"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Globe2, KeyRound, Link2, LoaderCircle, LockKeyhole } from "lucide-react";
import { OptionPicker } from "@/components/pad/settings/option-picker";
import type { PadData } from "@/components/pad/types";
import settingsStyles from "@/components/pad/settings/settings.module.css";
import styles from "@/components/pad/settings/pad-sharing-settings.module.css";

type Preset = "private" | "link" | "public";

const PRESETS: Record<Preset, {
  discoveryScope: PadData["discoveryScope"];
  visitorPermission: PadData["visitorPermission"];
  loginRequired: boolean;
}> = {
  private: { discoveryScope: "PRIVATE", visitorPermission: "NO_ACCESS", loginRequired: true },
  link: { discoveryScope: "LINK", visitorPermission: "READER", loginRequired: false },
  public: { discoveryScope: "PUBLIC", visitorPermission: "READER", loginRequired: false },
};

function presetFor(board: Pick<PadData, "discoveryScope">): Preset {
  if (board.discoveryScope === "PUBLIC") return "public";
  if (board.discoveryScope === "LINK") return "link";
  return "private";
}

// 설정의 공개·공유 탭은 접근 정책만 관리합니다. URL 복사·QR은 상단 공유 패널에만 두고,
// 방문자의 수정 권한은 어떤 공개 범위에서도 열지 않아 공개 링크가 읽기 전용이라는 계약을
// 화면과 API 요청 양쪽에서 명확히 유지합니다.
export function PadSharingSettings({ board }: {
  board: Pick<PadData, "id" | "discoveryScope" | "hasPassword">;
}) {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>(presetFor(board));
  const [hasPassword, setHasPassword] = useState(board.hasPassword);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setPending(true);

    try {
      const form = event.currentTarget;
      const data = new FormData(form);
      const nextPassword = String(data.get("password") ?? "").trim();
      const removePassword = data.get("removePassword") === "on";
      const body: Record<string, unknown> = { ...PRESETS[preset] };

      if (removePassword) body.password = null;
      else if (nextPassword) body.password = nextPassword;

      const response = await fetch(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "공개 설정을 저장하지 못했습니다.");
        return;
      }

      setHasPassword(result.board.hasPassword);
      form.reset();
      setSaved(true);
      router.refresh();
    } catch {
      setError("네트워크 오류로 공개 설정을 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={saveSettings}>
      <fieldset className={settingsStyles.group}>
        <legend>발견 범위</legend>
        <p className={styles.groupDescription}>누가 패드를 찾고 열 수 있는지 정합니다. 공개 방문자는 항상 읽기 전용이에요.</p>
        <OptionPicker
          name="discoveryScope"
          value={preset}
          onChange={(value) => { setPreset(value); setSaved(false); }}
          options={[
            { value: "private", label: "비공개", description: "소유자와 초대받은 멤버만 열 수 있어요.", icon: <LockKeyhole size={18} /> },
            { value: "link", label: "링크 공개", description: "링크를 받은 사람은 로그인 없이 읽을 수 있어요.", icon: <Link2 size={18} /> },
            { value: "public", label: "전체 공개", description: "목록과 검색에 노출되고 누구나 읽을 수 있어요.", icon: <Globe2 size={18} /> },
          ]}
        />
      </fieldset>

      <fieldset className={settingsStyles.group}>
        <legend>비밀번호</legend>
        <div className={styles.passwordHeading}>
          <span className={styles.icon}><KeyRound size={17} /></span>
          <span>
            <b>{hasPassword ? "현재 비밀번호로 보호 중" : "추가 보호가 꺼져 있어요"}</b>
            <small>공개 범위와 별개로 패드를 열 때 비밀번호를 확인합니다.</small>
          </span>
        </div>
        <label className={settingsStyles.field}>
          <span>{hasPassword ? "새 비밀번호" : "비밀번호 설정"}</span>
          <input type="password" name="password" placeholder={hasPassword ? "바꿀 때만 4자 이상 입력" : "4자 이상 입력"} minLength={4} maxLength={100} autoComplete="new-password" />
        </label>
        {hasPassword && (
          <label className={settingsStyles.check}>
            <input type="checkbox" name="removePassword" />
            <span>비밀번호 보호 끄기<small>저장하면 기존 비밀번호가 삭제돼요.</small></span>
          </label>
        )}
      </fieldset>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className={styles.actions}>
        {saved && <span>공개 설정이 저장됐어요.</span>}
        <button type="submit" className="button primary" disabled={pending}>
          {pending && <LoaderCircle size={15} className="spin" />}
          {pending ? "저장하는 중…" : "공개 설정 저장"}
        </button>
      </div>
    </form>
  );
}
