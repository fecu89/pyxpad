"use client";

import {
  createContext,
  useContext,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type CreateBoardActionsValue = {
  openCreate: () => void;
};

const CreateBoardActionsContext = createContext<CreateBoardActionsValue | null>(null);

function useCreateBoardActions() {
  const value = useContext(CreateBoardActionsContext);
  if (!value) throw new Error("패드 생성 액션은 CreateBoardActionsProvider 안에서 사용해야 합니다.");
  return value;
}

export function CreateBoardActionsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState("");

  async function createBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    // 발견 범위·방문자 권한·로그인 필수를 매번 따로 고르지 않도록, 자주 쓰는 3가지 조합을 프리셋으로 묶었습니다.
    // 더 세밀한 조정은 보드 설정의 공유 패널에서 할 수 있습니다.
    const preset = String(form.get("visibilityPreset") ?? "private");
    const presets = {
      private: { discoveryScope: "PRIVATE", visitorPermission: "NO_ACCESS", loginRequired: true },
      link: { discoveryScope: "LINK", visitorPermission: "READER", loginRequired: false },
      public: { discoveryScope: "PUBLIC", visitorPermission: "READER", loginRequired: false },
    } as const;
    const response = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        ...presets[preset as keyof typeof presets],
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error);
      return;
    }
    setCreateOpen(false);
    router.push(`/b/${result.board.slug}`);
  }

  const value: CreateBoardActionsValue = {
    openCreate: () => {
      setError("");
      setCreateOpen(true);
    },
  };

  return (
    <CreateBoardActionsContext.Provider value={value}>
      {children}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="새 패드 만들기"
        description="생각을 모을 새로운 공간을 열어 보세요."
      >
        <form className="stack-form" onSubmit={createBoard}>
          <label>패드 이름<input name="title" placeholder="예: 우리 반 환경 프로젝트" required maxLength={120} autoFocus /></label>
          <label>한 줄 소개<textarea name="description" placeholder="이 패드에서 함께 할 일을 알려주세요." rows={3} maxLength={500} /></label>
          <label>공개 범위<select name="visibilityPreset" defaultValue="private"><option value="private">비공개 · 나와 초대된 멤버</option><option value="link">링크 공개 · 링크를 가진 사람</option><option value="public">전체 공개 · 목록·검색에 노출</option></select></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full">패드 만들기 <ArrowRight size={17} /></button>
        </form>
      </Modal>
    </CreateBoardActionsContext.Provider>
  );
}

export function CreateBoardButton({ className, children }: { className: string; children: ReactNode }) {
  const { openCreate } = useCreateBoardActions();
  return <button type="button" className={className} data-home-action="create-board" onClick={openCreate}>{children}</button>;
}
