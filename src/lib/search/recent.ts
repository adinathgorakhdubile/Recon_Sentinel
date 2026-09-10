const KEY = "recon-workbench:recent-searches";
const MAX = 8;

export function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return loadRecent();
  const current = loadRecent().filter((x) => x.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...current].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function clearRecent(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
