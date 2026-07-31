"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Modal({ open, onClose, title, description, children, className, variant = "center" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  // "side"는 오른쪽에서 슬라이드로 열리는 패널입니다. 설정처럼 뒤에 있는 보드가 어떻게
  // 바뀌는지 보면서 조정해야 하는 화면에 씁니다(가운데 모달은 게시물을 다 가려서 요청받음).
  variant?: "center" | "side";
}) {
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // onClose는 호출부에서 인라인 함수나 매번 새로 만들어지는 콜백으로 넘어오는 경우가 많아
  // (예: post-composer.tsx의 closeComposer는 매번 새 객체인 큐 상태에 의존) 참조가 렌더마다
  // 바뀝니다. 이 이펙트가 onClose를 의존성 배열에 두면 그때마다(예: 입력창에 한 글자 칠 때마다)
  // 다시 실행되어 포커스를 다시 훔쳐가므로("타이핑하면 자꾸 닫기 버튼으로 포커스 이동"), ref로
  // 최신 값만 참조하고 이펙트 자체는 open이 바뀔 때만 실행합니다.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      // React의 autoFocus prop은 마운트 시 곧바로 focus()만 호출할 뿐 실제 DOM에 autofocus
      // 속성을 남기지 않으므로 "[autofocus]" 셀렉터는 항상 매치되지 않았고, 그래서 이 콜백이
      // 매번 무조건 "첫 포커스 가능 요소"(대개 헤더의 닫기 버튼)로 되돌리고 있었습니다. 이미
      // 패널 안의 무언가에 포커스가 가 있으면(React autoFocus든 사용자 클릭이든) 건드리지 않고,
      // 아무 데도 포커스가 없을 때만 첫 요소로 기본 포커스를 줍니다.
      if (panel && document.activeElement instanceof Node && panel.contains(document.activeElement)) return;
      const first = panel?.querySelector<HTMLElement>(focusableSelector);
      (first ?? panel)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") return onCloseRef.current();
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={cn("modal-backdrop", variant === "side" && "modal-side")} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section ref={panelRef} tabIndex={-1} className={cn("modal-panel", variant === "side" && "modal-panel-side", className)} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={description ? "modal-description" : undefined}>
        <header className="modal-header">
          <div><h2 id="modal-title">{title}</h2>{description && <p id="modal-description">{description}</p>}</div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}
