"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const draftVersion = 1;
const autosaveDelayMs = 700;

export type PostDraftValue = {
  title: string;
  body: string;
};

type StoredPostDraft = {
  version: typeof draftVersion;
  savedAt: string;
  value: PostDraftValue;
};

function storageKey(scope: string) {
  return `pyxpad:post-draft:v${draftVersion}:${scope}`;
}

function readDraft(scope: string): StoredPostDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPostDraft>;
    if (
      parsed.version !== draftVersion
      || !parsed.value
      || typeof parsed.value.title !== "string"
      || typeof parsed.value.body !== "string"
      || typeof parsed.savedAt !== "string"
    ) {
      localStorage.removeItem(storageKey(scope));
      return null;
    }
    return parsed as StoredPostDraft;
  } catch {
    return null;
  }
}

function writeDraft(scope: string, value: PostDraftValue) {
  const draft: StoredPostDraft = {
    version: draftVersion,
    savedAt: new Date().toISOString(),
    value,
  };
  localStorage.setItem(storageKey(scope), JSON.stringify(draft));
  return draft.savedAt;
}

function removeDraft(scope: string) {
  try {
    localStorage.removeItem(storageKey(scope));
  } catch {
    // 저장 공간을 사용할 수 없는 브라우저에서도 작성 자체는 계속 허용합니다.
  }
}

export function usePostDraft({
  scope,
  initialTitle = "",
  initialBody = "",
  enabled = true,
}: {
  scope: string;
  initialTitle?: string;
  initialBody?: string;
  enabled?: boolean;
}) {
  const initialValue = useMemo(
    () => ({ title: initialTitle, body: initialBody }),
    [initialBody, initialTitle],
  );
  const [value, setValue] = useState<PostDraftValue>(initialValue);
  const [baseline, setBaseline] = useState<PostDraftValue>(initialValue);
  const [availableDraft, setAvailableDraft] = useState<StoredPostDraft | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [ready, setReady] = useState(false);
  const dirty = value.title !== baseline.title || value.body !== baseline.body;

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setValue(initialValue);
      setBaseline(initialValue);
      setLastSavedAt(null);
      setStorageError(false);
      const stored = enabled ? readDraft(scope) : null;
      setAvailableDraft(stored);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [enabled, initialValue, scope]);

  useEffect(() => {
    if (!enabled || !ready || !dirty) return;
    const timeout = window.setTimeout(() => {
      try {
        setLastSavedAt(writeDraft(scope, value));
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    }, autosaveDelayMs);
    return () => window.clearTimeout(timeout);
  }, [dirty, enabled, ready, scope, value]);

  useEffect(() => {
    if (!enabled || !dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty, enabled]);

  const restoreDraft = useCallback(() => {
    if (!availableDraft) return;
    setValue(availableDraft.value);
    setLastSavedAt(availableDraft.savedAt);
    setAvailableDraft(null);
  }, [availableDraft]);

  const discardDraft = useCallback(() => {
    removeDraft(scope);
    setAvailableDraft(null);
    setLastSavedAt(null);
  }, [scope]);

  const markSaved = useCallback(() => {
    removeDraft(scope);
    setBaseline(value);
    setAvailableDraft(null);
    setLastSavedAt(null);
  }, [scope, value]);

  const reset = useCallback(() => {
    removeDraft(scope);
    setValue(initialValue);
    setBaseline(initialValue);
    setAvailableDraft(null);
    setLastSavedAt(null);
    setStorageError(false);
  }, [initialValue, scope]);

  return {
    value,
    setValue,
    dirty,
    availableDraft,
    lastSavedAt,
    storageError,
    restoreDraft,
    discardDraft,
    markSaved,
    reset,
  };
}
