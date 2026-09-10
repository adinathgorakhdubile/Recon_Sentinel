
# Phase 1 — Persistence, Search, Command Palette, Activity Timeline

Goal: Replace the monolithic `localStorage` blob with a proper client-side database (Dexie/IndexedDB), normalize the data model, and layer three UX primitives on top: universal search, a `⌘K` command palette, and a workspace activity timeline. No feature regressions — every existing page keeps working.

## 1. Current state (what we're replacing)

- `src/lib/storage.ts` serializes the entire `WorkspaceState` to one JSON key (`recon-workbench:v1`). Every mutation rewrites the whole blob via `useEffect` in `WorkspaceContext`.
- `WorkspaceContext` filters `programs / tasks / assets / notes / findings` in memory on every render.
- `History.tsx` exists but has no real event source — Phase 1 gives it one.
- No cross-entity search. Command palette is not wired (`cmdk` is already a dep).
- PoC attachments live as data URLs inside findings — big JSON blob risk, another reason to move off `localStorage`.

## 2. Deliverables

1. **Dexie DB layer** with typed tables, indexes, and a one-shot migrator from the legacy `localStorage` blob.
2. **Normalized data model** — split embedded arrays (PoC attachments, tags, task commands) into their own tables where it pays off; keep small enums inline.
3. **Reactive workspace store** — `WorkspaceContext` reads via `dexie-react-hooks` `useLiveQuery` instead of holding the world in React state.
4. **Activity events** — every mutation writes an `ActivityEvent` row; `History` page renders a live timeline.
5. **Universal search** — one indexed search across programs / assets / notes / findings / tasks / encyclopedia entries.
6. **Command palette (`⌘K` / `Ctrl+K`)** using existing `cmdk` — navigation, entity jump, quick actions (new note, new finding, toggle task, switch program, run search).

## 3. Data model (normalized)

New Dexie schema in `src/lib/db.ts`:

```text
programs        &id, createdAt, name
tasks           &id, programId, phase, category, completed, [programId+phase]
assets          &id, programId, type, status, createdAt, *tags
notes           &id, programId, createdAt, relatedAssetId, *tags
findings        &id, programId, status, severity, createdAt
pocAttachments  &id, findingId, kind, createdAt          // extracted from Finding.pocAttachments
taskCommands    &id, taskId, order                       // extracted from ChecklistTask.commands
activity        &id, ts, programId, entityType, entityId, action, actorSummary
searchIndex     &id, entityType, entityId, programId, *tokens, updatedAt
settings        &key                                     // wraps current localStorage settings
meta            &key                                     // schemaVersion, lastMigratedAt
```

Notes:
- `*tokens` and `*tags` are multi-entry indexes — Dexie's built-in mechanism for full-text-ish lookup.
- `pocAttachments.dataUrl` stored as a `Blob` (converted from data URL) to keep IndexedDB efficient.
- `types.ts` gains no breaking changes; `PocAttachment.dataUrl` becomes derived (blob URL) at read time via a helper.

## 4. Modules and files

New:
- `src/lib/db.ts` — Dexie instance, table typings, schema versions.
- `src/lib/migrations.ts` — one-shot import of the legacy `recon-workbench:v1` blob → Dexie, then mark `meta.migratedFromLocalStorage=true`. Idempotent.
- `src/lib/repo/*.ts` — thin repositories per entity (`programs.ts`, `tasks.ts`, `assets.ts`, `notes.ts`, `findings.ts`, `activity.ts`, `search.ts`). All mutations funnel through here so activity + search index stay in sync.
- `src/lib/search/tokenize.ts` — lowercase, strip punctuation, split, dedupe. Small (~30 LOC), no external dep.
- `src/lib/search/index.ts` — `reindex(entity)`, `searchAll(query, opts)`, `searchScoped(programId, query)`.
- `src/components/CommandPalette.tsx` — cmdk-backed palette, global `⌘K` / `Ctrl+K` shortcut, opened from anywhere.
- `src/components/GlobalSearch.tsx` — inline search in the AppShell header (opens palette in Search mode).
- `src/hooks/useHotkeys.ts` — small utility.
- `src/hooks/useActivity.ts` — `useLiveQuery` wrapper for the timeline.

Refactored:
- `src/context/WorkspaceContext.tsx` — internals swap to Dexie/`useLiveQuery`; **public API is kept identical** so pages don't have to change. Each mutator additionally writes an `ActivityEvent` and updates the search index for the touched entity.
- `src/lib/storage.ts` — becomes a shim that only implements `readLegacyBlob()` for the migrator; then can be removed in a later phase.
- `src/pages/History.tsx` — rewritten to render the `activity` table (filters by program, entity type, date range).
- `src/components/AppShell.tsx` — mount `<CommandPalette />` globally, add header search trigger and keybinding hint.

Unchanged in Phase 1: `Dashboard`, `Findings`, `Assets`, `Notebook`, `Checklist`, `Scope`, `Assistant`, `Encyclopedia`, `AttackChain`, `Settings`, reports/PoC modules.

## 5. Migration strategy

On app boot (inside `WorkspaceProvider`):
1. Open Dexie DB.
2. Read `meta.schemaVersion`. If missing and `localStorage['recon-workbench:v1']` exists → run migrator inside one Dexie transaction:
   - insert programs, tasks (+ split commands), assets, notes, findings (+ split PoC attachments, data URL → Blob).
   - synthesize `activity` rows with `action="imported"` and `ts=createdAt`.
   - build initial `searchIndex` rows.
3. Set `meta.schemaVersion=1`, `meta.migratedAt=Date.now()`.
4. Keep the legacy blob for one release as backup (rename key to `recon-workbench:v1.backup`) — user can restore from Settings later.

Rollback path: Settings gains a "Restore from pre-migration backup" button (small addition, wired but hidden behind a `showAdvanced` toggle).

## 6. Universal search

- Every write via a repo calls `search.upsert(entityType, id, buildDoc(entity))` where `buildDoc` returns `{ title, subtitle, body, tags, programId }`.
- `searchAll(q)` tokenizes the query, does `where('tokens').anyOf(tokens)` on `searchIndex`, groups by `entityId`, scores by `hits * (recencyBoost)`.
- Encyclopedia entries are indexed once at boot from the static module — no persistence required (kept in memory + optionally mirrored to Dexie for offline search parity).
- Result item shape: `{ entityType, entityId, programId?, title, snippet, score, route }` so the palette can navigate directly.

## 7. Command palette

Powered by existing `cmdk`. Modes:
- **Navigate** — every route in `App.tsx` (Dashboard, Scope, Checklist, …).
- **Jump to entity** — top N results from `searchAll`.
- **Quick actions** — "New note", "New finding", "Toggle task…", "Switch program → …", "Export report", "Open assistant".
- **Search** — free-text, streams results as you type (debounced 120ms).

Shortcut: global `⌘K` / `Ctrl+K` (also `/` when not focused in an input). Trigger button in AppShell header. Escape closes; Enter runs.

## 8. Activity timeline

- Entry shape: `{ id, ts, programId, entityType, entityId, action: 'created'|'updated'|'deleted'|'completed'|'imported', summary, diff?: string }`.
- Repos emit these automatically. Batch writes coalesce (e.g. bulk task import → one `imported` event with `count`).
- `History.tsx` uses `useLiveQuery` with filters: program (defaults to active), entity type multi-select, date range, free-text over `summary`.
- Retention: unbounded in Phase 1; Phase 2 can add pruning.

## 9. Testing

- Unit: `tokenize`, `searchAll` ranking, migrator (feed a fixture blob → assert row counts and blob conversion), repo activity emission.
- Integration (vitest + jsdom + fake-indexeddb): open provider → mutate finding → expect Dexie row + activity row + search hit.
- Add `fake-indexeddb` as a dev dep for tests.

## 10. Dependencies to add

- `dexie` (~200KB min, tree-shaken)
- `dexie-react-hooks`
- `fake-indexeddb` (dev)

No other new runtime deps; `cmdk` and `sonner` are already installed.

## 11. Risk / non-goals

- **Non-goal (Phase 1):** cloud sync, multi-device, conflict resolution, encryption at rest — deferred to a later phase.
- **Risk:** IndexedDB quota with many large PoC blobs. Mitigation: store as `Blob` (not data URL), expose quota indicator in Settings (`navigator.storage.estimate()`).
- **Risk:** users on private-mode browsers with IndexedDB disabled. Mitigation: detect at boot, fall back to legacy `localStorage` path with a banner.
- **Backwards compat:** `WorkspaceContext`'s public API stays identical, so no page-level refactors ship in Phase 1.

## 12. Rollout order (build phase, once approved)

1. Add deps, create `db.ts` + `migrations.ts` + repos (no UI change yet).
2. Swap `WorkspaceContext` internals to Dexie; migrator runs on first load; ship behind a boot-time toggle for one build to compare parity.
3. Add search index + `searchAll`.
4. Ship `CommandPalette` + header trigger + `⌘K` binding.
5. Rewrite `History` page against `activity` table.
6. Tests + docs update in `README.md`.

Estimated size: ~10 new files, ~4 refactors, ~600–800 LOC net.
