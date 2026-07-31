"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardEvent } from "@/lib/realtime/board-events";

export function usePadEvents(
  boardId: string,
  currentUserId: string | null,
  onEvent?: (event: BoardEvent) => boolean,
) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventHandler = useRef(onEvent);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    eventHandler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const source = new EventSource(`/api/boards/${boardId}/events`);
    const lastSeenAt = { current: new Date().toISOString() };
    let hasConnectedBefore = false;
    const scheduleRefresh = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        router.refresh();
      }, 800);
    };
    const handleChange = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as BoardEvent;
        if (event.emittedAt) lastSeenAt.current = event.emittedAt;
        if (eventHandler.current?.(event)) return;
        if (event.actorId && event.actorId === currentUserId) return;
        scheduleRefresh();
      } catch {
        scheduleRefresh();
      }
    };
    // 연결이 끊겼다 다시 붙으면(브라우저의 EventSource 자동 재연결) "ready"가 다시 오는데,
    // 그 사이 놓친 변경이 있었는지 활동 로그로 확인해 보충합니다(padupgrade.md 4.4).
    const handleReady = () => {
      setConnected(true);
      if (!hasConnectedBefore) {
        hasConnectedBefore = true;
        return;
      }
      fetch(`/api/boards/${boardId}/activity?since=${encodeURIComponent(lastSeenAt.current)}&limit=1`)
        .then((response) => response.ok ? response.json() : { activities: [] })
        .then((result) => { if (result.activities?.length) router.refresh(); })
        .catch(() => undefined);
    };
    source.addEventListener("ready", handleReady);
    source.addEventListener("board-change", handleChange);
    source.onerror = () => setConnected(false);
    return () => {
      source.removeEventListener("ready", handleReady);
      source.removeEventListener("board-change", handleChange);
      source.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [boardId, currentUserId, router]);

  return connected;
}
