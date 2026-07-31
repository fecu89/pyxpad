"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArchiveRestore, Check, FileText, Folder, ListChecks, MessageCircle, Paperclip, RotateCcw, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type TrashItem = { id: string; deletedAt: string; restorable: boolean; title?: string | null; body?: string; originalName?: string };
type TrashData = { sections: TrashItem[]; posts: TrashItem[]; comments: TrashItem[]; attachments: TrashItem[] };
type TrashKind = keyof TrashData;
type TrashTarget = { kind: TrashKind; item: TrashItem };

const emptyTrash: TrashData = { sections: [], posts: [], comments: [], attachments: [] };
const groups = [
  { key: "sections", label: "섹션", icon: Folder },
  { key: "posts", label: "게시물", icon: FileText },
  { key: "comments", label: "댓글", icon: MessageCircle },
  { key: "attachments", label: "첨부파일", icon: Paperclip },
] as const;

type PadTrashProps = { boardId: string; open: boolean };

function targetKey(kind: TrashKind, itemId: string) {
  return `${kind}:${itemId}`;
}

function itemLabel(item: TrashItem) {
  return item.title || item.originalName || item.body || "제목 없는 항목";
}

export function PadTrash({ boardId, open }: PadTrashProps) {
  const [data, setData] = useState<TrashData>(emptyTrash);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [purgeTargets, setPurgeTargets] = useState<TrashTarget[]>([]);
  const [purgeReason, setPurgeReason] = useState("");
  const [purgeError, setPurgeError] = useState("");
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) { setLoading(true); setError(""); }
    });
    fetch(`/api/boards/${boardId}/trash`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "보관함을 불러오지 못했습니다.");
        const next = result as TrashData;
        const availableKeys = new Set(groups.flatMap((group) => next[group.key].map((item) => targetKey(group.key, item.id))));
        setData(next);
        setSelectedKeys((current) => new Set(Array.from(current).filter((key) => availableKeys.has(key))));
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "보관함을 불러오지 못했습니다."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [boardId, open, refreshKey]);

  async function restore(kind: TrashKind, itemId: string) {
    setPendingId(itemId); setError("");
    try {
      const response = await fetch(`/api/${kind}/${itemId}/restore`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) return setError(result.error);
      setRefreshKey((value) => value + 1);
    } finally { setPendingId(null); }
  }

  async function purgeItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!purgeTargets.length) return;
    if (purgeReason.trim().length < 3) { setPurgeError("사유를 3자 이상 입력해 주세요."); return; }
    if (!window.confirm(`선택한 ${purgeTargets.length}개 항목이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`)) return;
    setPurging(true); setPurgeError("");
    try {
      const response = await fetch(`/api/admin/boards/${boardId}/trash/purge`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: purgeReason,
          items: purgeTargets.map((target) => ({ kind: target.kind, id: target.item.id })),
        }),
      });
      const result = await response.json();
      if (!response.ok) { setPurgeError(result.error); return; }
      setPurgeTargets([]);
      setSelectedKeys(new Set());
      setSelecting(false);
      setPurgeReason("");
      if (result.fileCleanupFailed) setError(`항목은 삭제했지만 실제 파일 ${result.fileCleanupFailed}개를 정리하지 못했습니다.`);
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      setPurgeError(reason instanceof Error ? reason.message : "선택한 항목을 영구 삭제하지 못했습니다.");
    } finally { setPurging(false); }
  }

  function toggleTarget(kind: TrashKind, itemId: string) {
    const key = targetKey(kind, itemId);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function closeSelection() {
    setSelecting(false);
    setSelectedKeys(new Set());
  }

  function openPurge(targets: TrashTarget[]) {
    setPurgeError("");
    setPurgeReason("");
    setPurgeTargets(targets);
  }

  if (loading) return <p className="trash-empty"><ArchiveRestore className="spin" size={20} />보관함을 확인하는 중입니다…</p>;
  const total = groups.reduce((sum, group) => sum + data[group.key].length, 0);
  if (!total) return <div>{error && <p className="form-error">{error}</p>}<p className="trash-empty"><ArchiveRestore size={22} />복구할 항목이 없습니다.</p></div>;
  const allTargets = groups.flatMap((group) => data[group.key].map((item) => ({ kind: group.key, item })));
  const selectedTargets = allTargets.filter((target) => selectedKeys.has(targetKey(target.kind, target.item.id)));
  const allSelected = selectedTargets.length === total;

  return (
    <div className="pad-trash">
      {error && <p className="form-error">{error}</p>}
      <div className={`trash-bulk-bar ${selecting ? "selecting" : ""}`}>
        {selecting ? (
          <>
            <span><b>{selectedTargets.length}</b>개 선택</span>
            <button
              type="button"
              onClick={() => setSelectedKeys(allSelected ? new Set() : new Set(allTargets.map((target) => targetKey(target.kind, target.item.id))))}
              disabled={purging}
            >
              <Check size={14} />{allSelected ? "전체 해제" : "전체 선택"}
            </button>
            <button type="button" onClick={closeSelection} disabled={purging}><X size={14} />취소</button>
            <button type="button" className="danger" onClick={() => openPurge(selectedTargets)} disabled={!selectedTargets.length || purging}><Trash2 size={14} />선택 영구 삭제</button>
          </>
        ) : (
          <>
            <span><ListChecks size={15} /><b>{total}</b>개 항목</span>
            <button type="button" onClick={() => setSelecting(true)}><ListChecks size={14} />여러 항목 선택</button>
          </>
        )}
      </div>
      {groups.map((group) => {
        const items = data[group.key];
        if (!items.length) return null;
        const Icon = group.icon;
        return (
          <section key={group.key}>
            <header><Icon size={15} /><h3>{group.label}</h3><span>{items.length}</span></header>
            <div>{items.map((item) => (
              <article key={item.id} className={selectedKeys.has(targetKey(group.key, item.id)) ? "selected" : ""}>
                {selecting && (
                  <label className="trash-select">
                    <input type="checkbox" checked={selectedKeys.has(targetKey(group.key, item.id))} onChange={() => toggleTarget(group.key, item.id)} aria-label={`${itemLabel(item)} 선택`} />
                    <span aria-hidden><Check size={13} /></span>
                  </label>
                )}
                <span><b>{itemLabel(item)}</b><small>{new Date(item.deletedAt).toLocaleString("ko-KR")}</small></span>
                {!selecting && (
                  <div className="trash-item-actions">
                    {item.restorable && <button type="button" onClick={() => restore(group.key, item.id)} disabled={pendingId === item.id}><RotateCcw size={13} />복구</button>}
                    <button type="button" className="danger" onClick={() => openPurge([{ kind: group.key, item }])}><Trash2 size={13} />영구 삭제</button>
                  </div>
                )}
              </article>
            ))}</div>
          </section>
        );
      })}
      <p className="trash-note">작성자, 패드 소유자·관리자는 보존 기간과 상관없이 언제든 영구 삭제할 수 있습니다. 30일 안에는 복구도 가능합니다.</p>
      <Modal
        open={purgeTargets.length > 0}
        onClose={() => { if (!purging) setPurgeTargets([]); }}
        title={purgeTargets.length > 1 ? `${purgeTargets.length}개 항목 영구 삭제` : `${groups.find((group) => group.key === purgeTargets[0]?.kind)?.label ?? "항목"} 영구 삭제`}
        description={purgeTargets.length > 1
          ? "선택한 항목과 그 아래 연결된 데이터를 되돌릴 수 없이 삭제합니다."
          : `'${itemLabel(purgeTargets[0]?.item ?? { id: "", deletedAt: "", restorable: false })}'을(를) 되돌릴 수 없이 삭제합니다.`}
      >
        <form className="stack-form" onSubmit={purgeItem}>
          <label>삭제 사유<textarea value={purgeReason} onChange={(event) => setPurgeReason(event.target.value)} rows={3} maxLength={500} required minLength={3} placeholder="감사 로그에 남을 구체적인 사유를 입력하세요." autoFocus /></label>
          {purgeError && <p className="form-error" role="alert">{purgeError}</p>}
          <button type="submit" className="button danger full" disabled={purging}><Trash2 size={16} />{purging ? "삭제하는 중..." : purgeTargets.length > 1 ? `${purgeTargets.length}개 영구 삭제` : "영구 삭제"}</button>
        </form>
      </Modal>
    </div>
  );
}
