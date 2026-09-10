import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type {
  Asset,
  ChecklistTask,
  Finding,
  Note,
  PocAttachment,
  Program,
  WorkspaceState,
} from "@/types";
import { db, getMeta, setMeta, META_KEYS, type StoredFinding } from "@/lib/db";
import { ensureDbReady, resetDb } from "@/lib/migrations";
import { buildTasksForProgram, uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import { templateById } from "@/lib/templates";
import { searchService } from "@/lib/search";
import { upsertIntel, deleteIntel } from "@/lib/assets/repo";

interface Ctx {
  state: WorkspaceState;
  ready: boolean;
  activeProgram: Program | null;
  setActiveProgram: (id: string) => void;
  createProgram: (name: string, targetRoot: string) => Program;
  createFromTemplate: (templateId: string, name: string, targetRoot: string) => void;
  updateProgram: (id: string, patch: Partial<Program>) => void;
  deleteProgram: (id: string) => void;
  toggleTask: (id: string) => void;
  addAsset: (a: Omit<Asset, "id" | "createdAt" | "programId">) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  deleteAsset: (id: string) => void;
  addNote: (n: Omit<Note, "id" | "createdAt" | "programId">) => void;
  deleteNote: (id: string) => void;
  addFinding: (f: Omit<Finding, "id" | "createdAt" | "programId">) => void;
  updateFinding: (id: string, patch: Partial<Finding>) => void;
  deleteFinding: (id: string) => void;
  resetDemo: () => void;
  regenerateTasks: (programId: string) => void;
  tasks: ChecklistTask[];
  assets: Asset[];
  notes: Note[];
  findings: Finding[];
}

const WorkspaceContext = createContext<Ctx | null>(null);

async function attachmentsFor(findingId: string): Promise<PocAttachment[]> {
  const rows = await db.pocAttachments.where("findingId").equals(findingId).toArray();
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    mime: r.mime,
    caption: r.caption,
    createdAt: r.createdAt,
    sizeBytes: r.sizeBytes,
    dataUrl: URL.createObjectURL(r.blob),
  }));
}

function storedToFinding(stored: StoredFinding, attachments: PocAttachment[]): Finding {
  const { pocAttachmentIds: _drop, ...rest } = stored;
  return { ...rest, pocAttachments: attachments };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [activeProgramId, setActiveProgramIdState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureDbReady();
      const stored = await getMeta<string>(META_KEYS.activeProgramId);
      if (cancelled) return;
      if (stored) {
        setActiveProgramIdState(stored);
      } else {
        const first = await db.programs.orderBy("createdAt").first();
        if (first) {
          setActiveProgramIdState(first.id);
          await setMeta(META_KEYS.activeProgramId, first.id);
        }
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const programs = useLiveQuery(() => db.programs.orderBy("createdAt").toArray(), [], [] as Program[]) ?? [];
  const tasks = useLiveQuery(
    () => activeProgramId ? db.tasks.where("programId").equals(activeProgramId).toArray() : Promise.resolve([]),
    [activeProgramId],
    [] as ChecklistTask[],
  ) ?? [];
  const assets = useLiveQuery(
    () => activeProgramId ? db.assets.where("programId").equals(activeProgramId).reverse().sortBy("createdAt") : Promise.resolve([]),
    [activeProgramId],
    [] as Asset[],
  ) ?? [];
  const notes = useLiveQuery(
    () => activeProgramId ? db.notes.where("programId").equals(activeProgramId).reverse().sortBy("createdAt") : Promise.resolve([]),
    [activeProgramId],
    [] as Note[],
  ) ?? [];

  const findings = useLiveQuery(async () => {
    if (!activeProgramId) return [] as Finding[];
    const rows = await db.findings.where("programId").equals(activeProgramId).reverse().sortBy("createdAt");
    return Promise.all(rows.map(async (r) => storedToFinding(r, await attachmentsFor(r.id))));
  }, [activeProgramId], [] as Finding[]) ?? [];

  const activeProgram = useMemo(
    () => programs.find((p) => p.id === activeProgramId) ?? null,
    [programs, activeProgramId],
  );

  const setActiveProgram = useCallback((id: string) => {
    setActiveProgramIdState(id);
    setMeta(META_KEYS.activeProgramId, id);
  }, []);

  const createProgram = useCallback((name: string, targetRoot: string) => {
    const program: Program = {
      id: uid("prog"),
      name,
      targetRoot,
      inScope: [],
      outScope: [],
      rules: "",
      rateLimits: "",
      safeHarbor: "",
      createdAt: Date.now(),
    };
    const newTasks = buildTasksForProgram(program.id);
    (async () => {
      await db.programs.put(program);
      await db.tasks.bulkPut(newTasks);
      await searchService.indexProgram(program);
      for (const t of newTasks) await searchService.indexTask(t);
      await logActivity({
        programId: program.id, entityType: "program", entityId: program.id,
        action: "created", summary: `Created program "${program.name}"`,
      });
      setActiveProgram(program.id);
    })();
    return program;
  }, [setActiveProgram]);

  const createFromTemplate = useCallback((templateId: string, name: string, targetRoot: string) => {
    const tpl = templateById(templateId);
    if (!tpl) return;
    (async () => {
      const program: Program = {
        id: uid("prog"), name, targetRoot,
        inScope: [targetRoot].filter(Boolean), outScope: [],
        rules: "", rateLimits: "", safeHarbor: "", createdAt: Date.now(),
      };
      const newTasks = buildTasksForProgram(program.id);
      const starterAssets = tpl.starterAssets.map((a) => ({ ...a, id: uid("ast"), programId: program.id, createdAt: Date.now() }));
      const starterNotes = tpl.starterNotes.map((n) => ({ ...n, id: uid("note"), programId: program.id, createdAt: Date.now() }));
      await db.programs.put(program);
      await db.tasks.bulkPut(newTasks);
      await db.assets.bulkPut(starterAssets);
      await db.notes.bulkPut(starterNotes);
      await searchService.indexProgram(program);
      for (const t of newTasks) await searchService.indexTask(t);
      for (const a of starterAssets) await searchService.indexAsset(a);
      for (const n of starterNotes) await searchService.indexNote(n);
      await logActivity({
        programId: program.id, entityType: "template", entityId: tpl.id,
        action: "imported", summary: `Created "${name}" from ${tpl.name} template`,
        meta: { templateId: tpl.id, assets: starterAssets.length, notes: starterNotes.length },
      });
      setActiveProgram(program.id);
    })();
  }, [setActiveProgram]);

  const updateProgram = useCallback((id: string, patch: Partial<Program>) => {
    (async () => {
      const before = await db.programs.get(id);
      if (!before) return;
      const next = { ...before, ...patch };
      await db.programs.put(next);
      await searchService.indexProgram(next);
      await logActivity({
        programId: id, entityType: "program", entityId: id,
        action: "updated", summary: `Updated program "${next.name}"`,
      });
    })();
  }, []);

  const deleteProgram = useCallback((id: string) => {
    (async () => {
      const p = await db.programs.get(id);
      await db.transaction("rw", [db.programs, db.tasks, db.assets, db.notes, db.findings, db.pocAttachments], async () => {
        await db.programs.delete(id);
        const tIds = await db.tasks.where("programId").equals(id).primaryKeys();
        await db.tasks.bulkDelete(tIds);
        const aIds = await db.assets.where("programId").equals(id).primaryKeys();
        await db.assets.bulkDelete(aIds);
        const nIds = await db.notes.where("programId").equals(id).primaryKeys();
        await db.notes.bulkDelete(nIds);
        const fIds = await db.findings.where("programId").equals(id).primaryKeys();
        await db.findings.bulkDelete(fIds);
        for (const fid of fIds) {
          const pocs = await db.pocAttachments.where("findingId").equals(fid).primaryKeys();
          await db.pocAttachments.bulkDelete(pocs);
        }
      });
      await searchService.removeByProgram(id);
      await searchService.remove("program", id);
      if (p) {
        await logActivity({
          programId: null, entityType: "program", entityId: id,
          action: "deleted", summary: `Deleted program "${p.name}"`,
        });
      }
      if (activeProgramId === id) {
        const first = await db.programs.orderBy("createdAt").first();
        setActiveProgramIdState(first?.id ?? null);
        await setMeta(META_KEYS.activeProgramId, first?.id ?? null);
      }
    })();
  }, [activeProgramId]);

  const toggleTask = useCallback((id: string) => {
    (async () => {
      const t = await db.tasks.get(id);
      if (!t) return;
      const next = { ...t, completed: !t.completed };
      await db.tasks.put(next);
      await searchService.indexTask(next);
      await logActivity({
        programId: t.programId, entityType: "task", entityId: id,
        action: next.completed ? "completed" : "uncompleted",
        summary: `${next.completed ? "✓" : "↺"} ${t.title}`,
      });
    })();
  }, []);

  const withActive = useCallback(<T,>(fn: (programId: string) => T): T | undefined => {
    if (!activeProgramId) return undefined;
    return fn(activeProgramId);
  }, [activeProgramId]);

  const addAsset: Ctx["addAsset"] = useCallback((a) => {
    withActive(async (programId) => {
      const asset: Asset = { ...a, id: uid("ast"), programId, createdAt: Date.now() };
      await db.assets.put(asset);
      await upsertIntel(asset);
      await searchService.indexAsset(asset);
      await logActivity({ programId, entityType: "asset", entityId: asset.id, action: "created", summary: `Asset ${asset.name}` });
    });
  }, [withActive]);

  const updateAsset: Ctx["updateAsset"] = useCallback((id, patch) => {
    (async () => {
      const before = await db.assets.get(id);
      if (!before) return;
      const next = { ...before, ...patch };
      await db.assets.put(next);
      await upsertIntel(next);
      await searchService.indexAsset(next);
      await logActivity({ programId: next.programId, entityType: "asset", entityId: id, action: "updated", summary: `Updated asset ${next.name}` });
    })();
  }, []);

  const deleteAsset = useCallback((id: string) => {
    (async () => {
      const a = await db.assets.get(id);
      await db.assets.delete(id);
      await deleteIntel(id);
      await searchService.remove("asset", id);
      if (a) await logActivity({ programId: a.programId, entityType: "asset", entityId: id, action: "deleted", summary: `Deleted asset ${a.name}` });
    })();
  }, []);

  const addNote: Ctx["addNote"] = useCallback((n) => {
    withActive(async (programId) => {
      const note: Note = { ...n, id: uid("note"), programId, createdAt: Date.now() };
      await db.notes.put(note);
      await searchService.indexNote(note);
      await logActivity({ programId, entityType: "note", entityId: note.id, action: "created", summary: `Note: ${note.title}` });
    });
  }, [withActive]);

  const deleteNote = useCallback((id: string) => {
    (async () => {
      const n = await db.notes.get(id);
      await db.notes.delete(id);
      await searchService.remove("note", id);
      if (n) await logActivity({ programId: n.programId, entityType: "note", entityId: id, action: "deleted", summary: `Deleted note "${n.title}"` });
    })();
  }, []);

  const addFinding: Ctx["addFinding"] = useCallback((f) => {
    withActive(async (programId) => {
      const id = uid("find");
      const { pocAttachments = [], ...rest } = f;
      const stored: StoredFinding = { ...(rest as any), id, programId, createdAt: Date.now(), pocAttachmentIds: [] };
      // Persist attachments as blobs
      for (const p of pocAttachments) {
        const blob = await (await fetch(p.dataUrl)).blob().catch(() => new Blob([]));
        await db.pocAttachments.put({
          id: p.id ?? uid("poc"), findingId: id, kind: p.kind, mime: p.mime,
          caption: p.caption, createdAt: p.createdAt, sizeBytes: p.sizeBytes, blob,
        });
        stored.pocAttachmentIds.push(p.id ?? uid("poc"));
      }
      await db.findings.put(stored);
      const derived = storedToFinding(stored, pocAttachments);
      await searchService.indexFinding(derived);
      await logActivity({ programId, entityType: "finding", entityId: id, action: "created", summary: `Finding: ${stored.title}` });
    });
  }, [withActive]);

  const updateFinding: Ctx["updateFinding"] = useCallback((id, patch) => {
    (async () => {
      const before = await db.findings.get(id);
      if (!before) return;
      const patchAttachments = patch.pocAttachments;
      const { pocAttachments: _drop, ...restPatch } = patch;
      const next: StoredFinding = { ...before, ...(restPatch as any) };

      if (patchAttachments) {
        // replace attachments
        const existing = await db.pocAttachments.where("findingId").equals(id).primaryKeys();
        await db.pocAttachments.bulkDelete(existing);
        next.pocAttachmentIds = [];
        for (const p of patchAttachments) {
          const blob = await (await fetch(p.dataUrl)).blob().catch(() => new Blob([]));
          const pid = p.id ?? uid("poc");
          await db.pocAttachments.put({
            id: pid, findingId: id, kind: p.kind, mime: p.mime,
            caption: p.caption, createdAt: p.createdAt, sizeBytes: p.sizeBytes, blob,
          });
          next.pocAttachmentIds.push(pid);
        }
      }

      await db.findings.put(next);
      const attachments = patchAttachments ?? await attachmentsFor(id);
      const derived = storedToFinding(next, attachments);
      await searchService.indexFinding(derived);
      await logActivity({ programId: next.programId, entityType: "finding", entityId: id, action: "updated", summary: `Updated finding "${next.title}"` });
    })();
  }, []);

  const deleteFinding = useCallback((id: string) => {
    (async () => {
      const f = await db.findings.get(id);
      const pids = await db.pocAttachments.where("findingId").equals(id).primaryKeys();
      await db.pocAttachments.bulkDelete(pids);
      await db.findings.delete(id);
      await searchService.remove("finding", id);
      for (const pid of pids) await searchService.remove("evidence", pid);
      if (f) await logActivity({ programId: f.programId, entityType: "finding", entityId: id, action: "deleted", summary: `Deleted finding "${f.title}"` });
    })();
  }, []);

  const resetDemo = useCallback(() => {
    (async () => {
      await resetDb();
      const first = await db.programs.orderBy("createdAt").first();
      setActiveProgramIdState(first?.id ?? null);
      await setMeta(META_KEYS.activeProgramId, first?.id ?? null);
    })();
  }, []);

  const regenerateTasks = useCallback((programId: string) => {
    (async () => {
      const oldIds = await db.tasks.where("programId").equals(programId).primaryKeys();
      await db.tasks.bulkDelete(oldIds);
      for (const tid of oldIds) await searchService.remove("task", tid);
      const fresh = buildTasksForProgram(programId);
      await db.tasks.bulkPut(fresh);
      for (const t of fresh) await searchService.indexTask(t);
      await logActivity({ programId, entityType: "program", entityId: programId, action: "reset", summary: `Regenerated checklist (${fresh.length} tasks)` });
    })();
  }, []);

  // Snapshot state (kept for legacy consumers like History)
  const state: WorkspaceState = useMemo(() => ({
    programs,
    tasks: [], // filled below via all-programs live query
    assets: [],
    notes: [],
    findings: [],
    activeProgramId,
  }), [programs, activeProgramId]);

  // Full unfiltered arrays for pages that need them (History, palette).
  const allTasks = useLiveQuery(() => db.tasks.toArray(), [], [] as ChecklistTask[]) ?? [];
  const allAssets = useLiveQuery(() => db.assets.toArray(), [], [] as Asset[]) ?? [];
  const allNotes = useLiveQuery(() => db.notes.toArray(), [], [] as Note[]) ?? [];
  const allFindings = useLiveQuery(async () => {
    const rows = await db.findings.toArray();
    return Promise.all(rows.map(async (r) => storedToFinding(r, await attachmentsFor(r.id))));
  }, [], [] as Finding[]) ?? [];

  state.tasks = allTasks;
  state.assets = allAssets;
  state.notes = allNotes;
  state.findings = allFindings;

  const value: Ctx = {
    state,
    ready,
    activeProgram,
    setActiveProgram,
    createProgram,
    createFromTemplate,
    updateProgram,
    deleteProgram,
    toggleTask,
    addAsset,
    updateAsset,
    deleteAsset,
    addNote,
    deleteNote,
    addFinding,
    updateFinding,
    deleteFinding,
    resetDemo,
    regenerateTasks,
    tasks,
    assets,
    notes,
    findings,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
