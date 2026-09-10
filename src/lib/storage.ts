import type { WorkspaceState } from "@/types";
import { seedWorkspace } from "./seed";

const KEY = "recon-workbench:v1";

export function loadState(): WorkspaceState {
  if (typeof window === "undefined") return seedWorkspace();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seedWorkspace();
      localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    return seedWorkspace();
  }
}

export function saveState(state: WorkspaceState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function resetState(): WorkspaceState {
  const seeded = seedWorkspace();
  saveState(seeded);
  return seeded;
}
