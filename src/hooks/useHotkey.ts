import { useEffect } from "react";

interface HotkeyOpts {
  /** e.g. "k", "/", "Escape" */
  key: string;
  ctrlOrMeta?: boolean;
  /** Allow the hotkey while focus is in an input/textarea. Defaults to false. */
  allowInInput?: boolean;
  enabled?: boolean;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export function useHotkey(opts: HotkeyOpts, handler: (e: KeyboardEvent) => void): void {
  const { key, ctrlOrMeta = false, allowInInput = false, enabled = true } = opts;
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (ctrlOrMeta && !(e.ctrlKey || e.metaKey)) return;
      if (!ctrlOrMeta && (e.ctrlKey || e.metaKey)) return;
      if (!allowInInput && isEditableTarget(e.target)) return;
      handler(e);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, ctrlOrMeta, allowInInput, enabled, handler]);
}
