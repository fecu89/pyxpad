"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export function RestoreBoardButton({ boardId }: { boardId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function restoreBoard() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/boards/${boardId}/restore`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="button soft" onClick={restoreBoard} disabled={pending}>
        <ArchiveRestore size={15} />복구
      </button>
      {error && <small className="form-error compact" role="alert">{error}</small>}
    </>
  );
}

// 영구 삭제 사유를 window.prompt로 받으면 검증(빈 값 방지 이상)도, 키보드·스크린리더
// 접근성도 없고 실수로 취소하기도 쉬워서, 다른 파괴적 관리자 작업(감사 로그가 남는 작업)과
// 같은 방식으로 Modal 폼을 씁니다.
export function PurgeBoardButton({ board }: { board: { id: string; title: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function purgeBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setError("사유를 3자 이상 입력해 주세요.");
      return;
    }
    if (!window.confirm("게시물과 실제 첨부파일까지 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.")) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/boards/${board.id}/purge`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="button danger" onClick={() => { setError(""); setReason(""); setOpen(true); }}>
        <Trash2 size={15} />영구 삭제
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="패드 영구 삭제" description={`‘${board.title}’ 패드와 게시물·첨부파일을 모두 지웁니다. 되돌릴 수 없습니다.`}>
        <form className="stack-form" onSubmit={purgeBoard}>
          <label>삭제 사유<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} required minLength={3} placeholder="감사 로그에 남을 구체적인 사유를 입력하세요." autoFocus /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="button danger full" disabled={pending}><Trash2 size={16} />{pending ? "삭제하는 중..." : "영구 삭제"}</button>
        </form>
      </Modal>
    </>
  );
}
