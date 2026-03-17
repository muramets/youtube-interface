# Edit Knowledge (LLM tool) — Tasks

## Overview

`editKnowledge` tool: LLM обновляет `content` существующего KI, backend снапшотит старую версию в `versions/` subcollection, frontend показывает diff в Zen Mode. UI Edit тоже создаёт версию. Phase 1: только `content` (title/summary/category — позже).

**Feature doc:** `docs/features/knowledge/edit-knowledge.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/knowledge/edit-knowledge.md` (архитектура, решения, Firestore schema, Diff UI design)
3. `docs/features/knowledge/knowledge-items.md` (текущая KI архитектура, все файлы, handlers, hooks)
4. `functions/src/services/tools/handlers/knowledge/saveKnowledge.ts` (паттерн handler: validation, basePath, ctx, video ref resolution, batch)
5. `functions/src/services/tools/definitions.ts` + `executor.ts` (регистрация tool: TOOL_NAMES + definition object + HANDLERS map)
6. `src/features/Knowledge/components/KnowledgeViewer.tsx` (Zen Mode: Portal + AnimatePresence, header layout — diff UI будет здесь)

### Key Decisions (carry forward)

1. **`editKnowledge` — отдельный tool, не расширение `saveKnowledge`.** SRP: create vs update — разные операции, разные валидации. `saveKnowledge` имеет idempotency guard и discovery flag updates, которые не нужны при edit.

2. **Versions в subcollection `knowledgeItems/{kiId}/versions/{versionId}`, не массив на документе.** Firestore 1MB лимит, lazy loading (версии грузятся только в Zen Mode), удаление одной версии без перезаписи всего doc. `versionId` = auto-generated Firestore ID.

3. **Текущая версия на основном doc, не в subcollection.** 90% use cases = просмотр текущей версии. Zero extra reads. Subcollection — только для истории.

4. **npm `diff` (~7KB) для алгоритма + custom React `DiffViewer` для UI.** Библиотека `diff` даёт `diffLines()` с `added`/`removed`/`value`. Кастомный компонент = полный контроль над premium дизайном (line numbers, theme-aware colors). Rejected: `react-diff-viewer` (230KB, оверкилл).

5. **UI Edit тоже создаёт версию.** Единообразие: любое изменение = версия в subcollection. `KnowledgeItemModal.onSave` → `knowledgeService.updateKnowledgeItem` расширяется: сначала snapshot текущего content в `versions/`, потом update.

6. **Scope Phase 1: только `content` field.** Title/summary/category — добавить позже по необходимости. Version snapshot хранит только `content`, не весь документ.

7. **`editKnowledge` доступен при Memorize.** Добавляется в `TOOL_DECLARATIONS` (не `CONCLUDE_TOOL_DECLARATIONS`) — LLM может вызвать и в обычном чате, и при `isConclude`. `concludePrompt.ts` расширяется инструкцией "update existing KI if new data complements old analysis".

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes)
- **Parallel tasks** — независимые файлы внутри фазы (где обозначено)

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Backend: `editKnowledge` handler + tool definition + version subcollection write | DONE |
| 2 | Version history UI: `useKnowledgeVersions` hook + version dropdown в Zen Mode | DONE |
| 3 | DiffViewer component: npm `diff` + custom premium React component с line numbers | DONE |
| 4 | UI Edit creates version: `KnowledgeItemModal` + `knowledgeService` version snapshot | DONE |
| FINAL | Double review-fix cycle (R1 Architecture + R2 Production Readiness) | DONE |

## Current Test Count

- **Frontend: 489 passing (1 pre-existing failure in chatService.test.ts), 38 files**
- **Backend: 812 tests, 57 files**
- **Total: 1301 tests (95 files)** — verified 2026-03-16 via `npx vitest run --project frontend` + `npx vitest run --project functions`

---

## Phase 1: Backend — `editKnowledge` handler + tool definition + version subcollection

**Goal:** LLM может вызвать `editKnowledge(kiId, content)` → backend читает старый doc, снапшотит в `versions/`, обновляет main doc, резолвит video refs.

### Critical Context

- Follow `saveKnowledge.ts` handler pattern: validation → basePath → ctx → business logic → structured logging
- `ToolContext` уже имеет все нужные поля: `userId`, `channelId`, `conversationId`, `model`, `isConclude`
- Video ref resolution: extract shared utility `functions/src/services/tools/utils/resolveContentVideoRefs.ts` from `saveKnowledge` (~40 lines regex + resolve + snapshot). Used by both `saveKnowledge` and `editKnowledge`. Handlers stay self-contained in business logic, share only the pure extraction function
- `hasRealVideoData` guard: import from `shared/memory.ts`
- `stripUndefined` utility: copy from `saveKnowledge.ts` (local function, not shared)
- Firestore `serverTimestamp()` нельзя использовать в `arrayUnion` — use `Date.now()` for `createdAt` in version doc. Паттерн из token-transparency post-review fix
- `editKnowledge` content stripping: `aiChat.ts` strips `saveKnowledge` content. Нужно добавить strip для `editKnowledge` тоже (same pattern, line ~390)
- Tool definition добавляется в `TOOL_DECLARATIONS` (не `CONCLUDE_TOOL_DECLARATIONS`) — доступен и в чате, и при Memorize

### Tasks

- [x] **T1.1** — Version type (shared)
  - Create: `shared/knowledgeVersion.ts`
  - Type `KnowledgeVersion`:
    ```ts
    interface KnowledgeVersion {
      content: string;
      title?: string; // snapshot title at time of version (for future diff labels)
      createdAt: number; // Date.now() — NOT serverTimestamp (arrayUnion gotcha)
      source: 'chat-tool' | 'conclude' | 'manual';
      model?: string;
    }
    ```
  - Export also from frontend: `src/core/types/knowledge.ts` — add `import { KnowledgeVersion } from '../../../shared/knowledgeVersion'` + re-export

- [x] **T1.1b** — Extract shared video ref resolution utility
  - Create: `functions/src/services/tools/utils/resolveContentVideoRefs.ts`
  - Extract regex + resolveVideosByIds + MemoryVideoRef mapping (~40 lines) from `saveKnowledge.ts` lines 166-207
  - Function: `resolveContentVideoRefs(content: string, basePath: string, docRef: DocumentReference): Promise<void>`
  - Import `hasRealVideoData` from `shared/memory.ts`
  - Update `saveKnowledge.ts` to use the extracted utility (replace inline code)
  - Verify: `npx vitest run --project functions` — existing saveKnowledge tests must pass

- [x] **T1.2** — `editKnowledge` handler
  - Create: `functions/src/services/tools/handlers/knowledge/editKnowledge.ts`
  - Interface `EditKnowledgeArgs`: `{ kiId: string; content: string }`
  - Function `handleEditKnowledge(args, ctx)`:
    1. Validation: `kiId` + `content` required, `ctx.userId` + `ctx.channelId` required
    2. `basePath = users/${ctx.userId}/channels/${ctx.channelId}`
    3. Read existing KI: `db.doc(${basePath}/knowledgeItems/${kiId}).get()`
    4. If not exists → `{ error: "Knowledge Item not found: ${kiId}" }`
    5. **Atomic batch** (version snapshot + main doc update):
       ```ts
       const batch = db.batch();
       const versionRef = db.collection(`${basePath}/knowledgeItems/${kiId}/versions`).doc();
       batch.set(versionRef, { content: oldContent, title: oldTitle, createdAt: Date.now(), source: oldSource, model: oldModel });
       batch.update(kiRef, { content: newContent, updatedAt: FieldValue.serverTimestamp(), lastEditedBy: ctx.model || 'unknown', lastEditSource: ctx.isConclude ? 'conclude' : 'chat-tool' });
       await batch.commit();
       ```
       ⚠️ Must be atomic — if snapshot succeeds but update fails, user sees phantom version identical to current content.
    7. Video ref resolution via shared `resolveContentVideoRefs(newContent, basePath, kiRef)` utility (extracted from `saveKnowledge`)
    8. Return: `{ content: "Knowledge Item updated: ${title} [id: ${kiId}]", id: kiId }`
  - Structured logging: `[editKnowledge] ── Validation failed ──`, `[editKnowledge] ── Not found ──`, `[editKnowledge] ── Updated ──`, `[editKnowledge] ── VideoRefs ──`
  - `stripUndefined` local copy (same as saveKnowledge)

- [x] **T1.3** — Tool definition + executor registration
  - File: `functions/src/services/tools/definitions.ts`
    - Add `EDIT_KNOWLEDGE: "editKnowledge"` to `TOOL_NAMES`
    - Create `editKnowledge: ToolDefinition` object:
      - name: `TOOL_NAMES.EDIT_KNOWLEDGE`
      - description: "Update the content of an existing Knowledge Item. Use when you have new data that complements or replaces the existing analysis. The old version is automatically preserved in version history. Call getKnowledge first to read the current content, then call editKnowledge with the updated content. Only the content field is editable — title and category remain unchanged."
      - parametersJsonSchema: `kiId` (required) + `content` (required, markdown)
    - Add to `TOOL_DECLARATIONS` array (after `getKnowledge`, before `saveMemory` section)
  - File: `functions/src/services/tools/executor.ts`
    - Import `handleEditKnowledge` from `./handlers/knowledge/editKnowledge.js`
    - Add `[TOOL_NAMES.EDIT_KNOWLEDGE]: handleEditKnowledge` to HANDLERS map

- [x] **T1.4** — Content stripping in `aiChat.ts`
  - File: `functions/src/chat/aiChat.ts` (~line 390)
  - Extend `persistToolCalls` map: add `editKnowledge` to the strip condition
    ```ts
    if (tc.name === 'saveKnowledge' && tc.args?.content && tc.result?.id) {
        return { ...tc, args: { ...tc.args, content: `[Saved as KI ${tc.result.id}]` } };
    }
    if (tc.name === 'editKnowledge' && tc.args?.content && tc.result?.id) {
        return { ...tc, args: { ...tc.args, content: `[Updated KI ${tc.result.id}]` } };
    }
    ```
  - Update existing test in `aiChat.conclude.test.ts`: add test case for `editKnowledge` content strip

- [x] **T1.5** — Conclude prompt update
  - File: `src/core/config/concludePrompt.ts`
  - Add to `CONCLUDE_INSTRUCTION` after the saveKnowledge section:
    ```
    If you performed a NEW analysis on a topic where a Knowledge Item already exists (listed below),
    prefer editKnowledge over saveKnowledge: call getKnowledge to read the existing content,
    then call editKnowledge with integrated old + new findings.
    Only create a new KI (saveKnowledge) when the topic is fundamentally different from existing KI.
    ```

- [x] **T1.6** — Chat UI: tool registry + badge
  - File: `src/features/Chat/utils/toolRegistry.ts`
  - Add `editKnowledge` entry:
    ```ts
    editKnowledge: {
        icon: BookOpen,
        color: 'emerald',
        hasExpandableContent: true,
    },
    ```

- [x] **T1.7** — Tests for `editKnowledge` handler
  - Create: `functions/src/services/tools/handlers/knowledge/__tests__/editKnowledge.test.ts`
  - Mock: `../../shared/db.js` (db.doc, db.collection), `../../utils/resolveVideos.js`, `../../shared/memory.js`
  - Test cases:
    - Happy path: existing KI → snapshot created in versions/ → main doc updated → returns success
    - Missing kiId → validation error
    - Missing content → validation error
    - KI not found → "Knowledge Item not found" error
    - Video ref resolution runs on new content (mock resolveVideosByIds)
    - Video ref resolution failure does not block the update (graceful degradation)
    - Version snapshot contains old content, old title, old source, old model
    - Source field reflects `ctx.isConclude` (conclude vs chat-tool)
    - `updatedAt` is set via `FieldValue.serverTimestamp()`

### Parallelization plan
```
T1.1 + T1.1b — SEQUENTIAL FIRST (shared type + shared utility, imported by T1.2)
T1.2 + T1.3 — PARALLEL (handler + registration are independent files)
T1.4 + T1.5 + T1.6 — PARALLEL (aiChat strip, conclude prompt, tool registry — independent)
T1.7 — SEQUENTIAL LAST (tests need handler to exist)
```

### Verification
```bash
npx vitest run --project functions
npm run check  # lint + typecheck + doc link checker
```

### MANDATORY: Update this file before proceeding
- [x] Mark completed tasks with [x]
- [x] Update Phase 1 status: TODO → DONE
- [x] Record updated test count

**Test count after Phase 1:** Frontend 471 (36 files) + Backend 812 (57 files) = 1283 total (93 files)

### Review Gate 1

**Prompt for review agent:**

Read these files in order:
1. `docs/features/knowledge/edit-knowledge.md` (feature spec)
2. `functions/src/services/tools/handlers/knowledge/editKnowledge.ts` (new handler)
3. `functions/src/services/tools/definitions.ts` (tool definition)
4. `functions/src/services/tools/executor.ts` (registration)
5. `functions/src/chat/aiChat.ts` (~line 390, content strip)
6. `functions/src/services/tools/handlers/knowledge/__tests__/editKnowledge.test.ts`

Answer these questions:
1. Does `editKnowledge` handler read the existing KI doc BEFORE writing the version snapshot? (Must read first — old content needed)
2. Is the version snapshot written with `Date.now()` for `createdAt`, NOT `FieldValue.serverTimestamp()`? (serverTimestamp in subcollection add is OK, but Date.now() is safer and consistent with token-transparency pattern)
3. Does the handler update `resolvedVideoRefs` on the main doc after content update? (New content may reference different videos)
4. Is `editKnowledge` added to `TOOL_DECLARATIONS` (not `CONCLUDE_TOOL_DECLARATIONS`)? (Must be available in both chat and memorize)
5. Does the `aiChat.ts` content strip condition include `editKnowledge`? (Prevents bloated message history)
6. Does the test file cover the "KI not found" error path?
7. Is the `KnowledgeVersion` type defined in `shared/` (not `functions/src/`) for frontend reuse?

**Fix all findings before moving to Phase 2.**

---

## Phase 2: Version History UI — hook + dropdown in Zen Mode

**Goal:** Пользователь видит dropdown с версиями в Zen Mode header. Выбор версии запоминается для diff (Phase 3).

### Critical Context

- TanStack Query pattern: follow `useKnowledgeItems.ts` (queryKey, queryFn, staleTime)
- Zen Mode = `KnowledgeViewer.tsx`: Portal + AnimatePresence, header section (line ~69-98)
- Dropdown версий: in the header alongside title/meta. Format: "Mar 14, 2026 14:30 - LLM edit (Claude)" / "Original"
- Version ordering: `createdAt DESC` (newest first). "Current" = main doc, always first in list
- Frontend Firestore reads: use `fetchCollection` from `src/core/services/firestore.ts` with `orderBy('createdAt', 'desc')`
- Delete version: `deleteDocument` from `src/core/services/firestore.ts`
- `KnowledgeViewer` props need to expand: `item` (full KI object), `versions` data, callbacks
- Zen Mode width: when diff is active (Phase 3), expands from `max-w-4xl` to `inset-4 sm:inset-8`. Prepare the layout now, diff rendering in Phase 3
- `source` field on version: 'chat-tool' | 'conclude' | 'manual'. Display as: "LLM edit" / "via Memorize" / "Manual edit". "Original" = the oldest version or if versions array is empty

### Tasks

- [x] **T2.1** — Frontend type for version
  - File: `src/core/types/knowledge.ts`
  - Re-export `KnowledgeVersion` from `shared/knowledgeVersion.ts` (already done in T1.1)
  - Add `KnowledgeVersionWithId`:
    ```ts
    export interface KnowledgeVersionWithId extends KnowledgeVersion {
      id: string; // Firestore document ID
    }
    ```

- [x] **T2.2** — Knowledge version service
  - Create: `src/core/services/knowledge/knowledgeVersionService.ts`
  - Functions:
    - `getVersions(userId, channelId, kiId): Promise<KnowledgeVersionWithId[]>` — `fetchCollection` with `orderBy('createdAt', 'desc')`
    - `deleteVersion(userId, channelId, kiId, versionId): Promise<void>` — `deleteDocument`
  - Path: `users/${userId}/channels/${channelId}/knowledgeItems/${kiId}/versions`

- [x] **T2.3** — `useKnowledgeVersions` hook
  - Create: `src/core/hooks/useKnowledgeVersions.ts`
  - TanStack Query:
    - queryKey: `['knowledgeVersions', userId, channelId, kiId]`
    - queryFn: `knowledgeVersionService.getVersions`
    - `enabled: !!userId && !!channelId && !!kiId`
    - `staleTime: 30_000` (30s — versions change infrequently)
  - `useDeleteVersion` mutation:
    - Invalidates `['knowledgeVersions', userId, channelId, kiId]`
  - Returns: `{ versions, isLoading, deleteVersion }`

- [x] **T2.4** — Version dropdown component
  - Create: `src/features/Knowledge/components/VersionDropdown.tsx`
  - Props: `{ versions: KnowledgeVersionWithId[], selectedVersionId: string | null, onSelect: (versionId: string | null) => void, onDelete: (versionId: string) => void, currentSource: string, currentModel: string, currentDate: string }`
  - UI:
    - Trigger button: clock icon + "N versions" text (or "No history" if empty)
    - Dropdown menu (absolute positioned, z-10):
      - First item: "Current" with source badge + model + date (not deletable)
      - Subsequent items: version entries sorted by createdAt DESC
      - Each entry: formatted date + source label ("LLM edit" / "via Memorize" / "Manual edit") + model name
      - Delete button on each version entry (except "Current")
      - Selected version highlighted with accent border
    - Design tokens: `bg-bg-secondary`, `border-border`, `text-text-primary`/`text-text-secondary`
  - Source label helper function (extract to util if reused):
    ```ts
    function getSourceLabel(source: string): string {
      if (source === 'conclude') return 'via Memorize';
      if (source === 'manual') return 'Manual edit';
      return 'LLM edit';
    }
    ```

- [x] **T2.5** — Integrate dropdown into KnowledgeViewer (Zen Mode)
  - File: `src/features/Knowledge/components/KnowledgeViewer.tsx`
  - Expand props: add `item: KnowledgeItem` (full object, replaces separate `content`/`title`/`meta`)
  - Add state: `selectedVersionId: string | null` (null = current)
  - Import + use `useKnowledgeVersions` hook
  - Add `VersionDropdown` to header (right side, next to Minimize button)
  - When a version is selected: display that version's content instead of current
  - Pass `selectedVersionId` state down (Phase 3 will use it for diff)
  - Update all call sites of `KnowledgeViewer`:
    - `src/features/Knowledge/components/KnowledgeCard.tsx` (~line 289): pass `item` prop
    - `src/pages/Knowledge/KnowledgePage.tsx`: if KnowledgeViewer is used directly, update there too

- [x] **T2.6** — Tests for `useKnowledgeVersions` hook
  - Create: `src/core/hooks/__tests__/useKnowledgeVersions.test.ts`
  - Mock: `../services/knowledge/knowledgeVersionService.ts`
  - Test cases:
    - Returns versions sorted by createdAt DESC
    - Returns empty array when no versions exist
    - `deleteVersion` mutation invalidates query
    - `enabled: false` when kiId is empty
  - Use `@testing-library/react` + `renderHook` + `QueryClientProvider` pattern (follow existing hook tests)

### Parallelization plan
```
T2.1 — SEQUENTIAL FIRST (type, needed by all)
T2.2 + T2.3 — SEQUENTIAL (service → hook, tight coupling)
T2.4 — PARALLEL with T2.2/T2.3 (component can be built with mock data)
T2.5 — SEQUENTIAL AFTER T2.3 + T2.4 (integration)
T2.6 — SEQUENTIAL LAST (tests)
```

### Verification
```bash
npx vitest run --project frontend
npm run check
```

### MANDATORY: Update this file before proceeding
- [x] Mark completed tasks with [x]
- [x] Update Phase 2 status: TODO → DONE
- [x] Record updated test count

**Test count after Phase 2:** Frontend 475 (37 files) + Backend 812 (57 files) = 1287 total (94 files)

### Review Gate 2

**Prompt for review agent:**

Read these files:
1. `src/core/hooks/useKnowledgeVersions.ts`
2. `src/core/services/knowledge/knowledgeVersionService.ts`
3. `src/features/Knowledge/components/VersionDropdown.tsx`
4. `src/features/Knowledge/components/KnowledgeViewer.tsx`
5. `src/features/Knowledge/components/KnowledgeCard.tsx` (call site update)

Answer these questions:
1. Does `useKnowledgeVersions` use a `staleTime` > 0? (Versions change rarely, avoid refetching on every Zen Mode open)
2. Is the "Current" entry in the dropdown non-deletable? (Deleting current version would lose data)
3. When `selectedVersionId` is null, does KnowledgeViewer show the main doc content (not a version subcollection read)?
4. Does `KnowledgeCard.tsx` pass the full `item` object to KnowledgeViewer? (Needed for version dropdown context)
5. Is the version list ordered by `createdAt DESC` in both service and UI?
6. Does `deleteVersion` callback trigger query invalidation so the dropdown updates?

**Fix all findings before moving to Phase 3.**

---

## Phase 3: DiffViewer Component — npm `diff` + custom premium UI

**Goal:** Premium line-level diff viewer: split view, line numbers, green/red highlights. Только в Zen Mode.

### Critical Context

- npm `diff` package: `diffLines(oldStr, newStr)` returns `Change[]` where each `Change` has `{ value: string, added?: boolean, removed?: boolean, count: number }`
- Install: `npm install diff` + `npm install -D @types/diff`
- Diff view only appears when a version is selected in the dropdown (Phase 2 state)
- Zen Mode layout when diff active: expand from `max-w-4xl` to `inset-4 sm:inset-8` (nearly fullscreen with padding)
- Split view: left = selected old version, right = current content
- Line numbers: independent numbering for left and right (old lines skip added, new lines skip removed)
- Colors: CSS variables for theme-aware diff colors — add to `src/index.css`:
  - `--diff-added-bg`, `--diff-removed-bg`, `--diff-added-text`, `--diff-removed-text`
  - Light theme: green tint / red tint. Dark theme: darker green/red that works on dark bg
- Performance: `diffLines` runs synchronously. For very large content (~5000 words), wrap in `useMemo` with deps on `[oldContent, newContent]`
- Markdown content: diff operates on raw markdown (not rendered HTML). This is correct — users see the source changes

### Tasks

- [x] **T3.1** — Install `diff` package
  - `npm install diff && npm install -D @types/diff`
  - Verify `package.json` has `"diff": "^7.x"` in dependencies and `"@types/diff": "^7.x"` in devDependencies
  - Run `npm run check` to ensure no type conflicts

- [x] **T3.2** — Diff CSS variables
  - File: `src/index.css`
  - Add diff-specific CSS variables in both `:root` (light) and `.dark` sections:
    ```css
    /* Diff colors */
    --diff-added-bg: rgba(34, 197, 94, 0.12);
    --diff-removed-bg: rgba(239, 68, 68, 0.12);
    --diff-added-text: #16a34a;
    --diff-removed-text: #dc2626;
    --diff-line-number: var(--text-tertiary);
    --diff-separator: var(--border);
    ```
  - Dark theme overrides (adjust for dark background readability)
  - Add Tailwind mappings in `tailwind.config.js` if needed, or use inline `var()` references

- [x] **T3.3** — `DiffViewer` component
  - Create: `src/features/Knowledge/components/DiffViewer.tsx`
  - Props: `{ oldContent: string, newContent: string, oldLabel?: string, newLabel?: string }`
  - Implementation:
    - `useMemo(() => diffLines(oldContent, newContent), [oldContent, newContent])`
    - Split view layout: two columns (CSS grid `grid-cols-2`)
    - Each column has a header label (e.g. "Version: Mar 14" / "Current")
    - For each `Change` in diff result:
      - `added`: render in right column only, green bg, "+" prefix
      - `removed`: render in left column only, red bg, "-" prefix
      - Neither: render in both columns, no highlight
    - Line numbers: `<span>` with monospace font, `--diff-line-number` color, right-aligned
    - Lines within each `Change.value`: split by `\n`, render each as a row
    - Scrollable container: `overflow-auto`, both columns scroll in sync (shared scroll container)
  - Design tokens: all colors via CSS variables (theme-aware)
  - Font: `font-mono text-xs` for code-like appearance

- [x] **T3.4** — Integrate DiffViewer into KnowledgeViewer
  - File: `src/features/Knowledge/components/KnowledgeViewer.tsx`
  - When `selectedVersionId` is set:
    - Find version content from `versions` array
    - Replace `RichTextViewer` content area with `<DiffViewer oldContent={versionContent} newContent={item.content} />`
    - Expand Zen Mode container: change `max-w-4xl` to conditional class `inset-4 sm:inset-8` when diff active
    - Add labels: old version label = formatted date + source, new label = "Current"
  - When `selectedVersionId` is null: show normal `RichTextViewer` (no diff)
  - Animation: `AnimatePresence` for smooth transition between normal view and diff view

- [x] **T3.5** — Tests for DiffViewer
  - Create: `src/features/Knowledge/components/__tests__/DiffViewer.test.tsx`
  - Test cases:
    - Renders added lines with green background class
    - Renders removed lines with red background class
    - Renders unchanged lines in both columns
    - Empty diff (identical content) shows all lines as unchanged
    - Handles empty old content (all lines are "added")
    - Handles empty new content (all lines are "removed")
    - Line numbers are sequential and independent per column
  - Mock: none needed — `diff` is a pure function, DiffViewer is a pure component

### Parallelization plan
```
T3.1 — SEQUENTIAL FIRST (npm install)
T3.2 + T3.3 — PARALLEL (CSS variables + component can be built simultaneously)
T3.4 — SEQUENTIAL AFTER T3.3 (integration needs component)
T3.5 — PARALLEL with T3.4 (tests are standalone, mock-free)
```

### Verification
```bash
npx vitest run --project frontend
npm run check
```

### MANDATORY: Update this file before proceeding
- [x] Mark completed tasks with [x]
- [x] Update Phase 3 status: TODO → DONE
- [x] Record updated test count

**Test count after Phase 3:** Frontend 484 (38 files) + Backend 812 (57 files) = 1296 total (95 files)

### Review Gate 3

**Prompt for review agent:**

Read these files:
1. `src/features/Knowledge/components/DiffViewer.tsx`
2. `src/features/Knowledge/components/KnowledgeViewer.tsx`
3. `src/index.css` (diff CSS variables)
4. `src/features/Knowledge/components/__tests__/DiffViewer.test.tsx`

Answer these questions:
1. Does `DiffViewer` use `useMemo` for the `diffLines()` call? (Avoids recomputing on every render)
2. Are diff colors defined as CSS variables (not hardcoded hex)? (Must be theme-aware)
3. Does Zen Mode expand to near-fullscreen when diff is active? (max-w-4xl is too narrow for split view)
4. When `selectedVersionId` is set to null (deselected), does the normal RichTextViewer render? (No stale diff)
5. Do line numbers restart independently for left and right columns? (Not shared numbering)
6. Does the test file cover the "identical content" edge case? (No diff lines, all unchanged)
7. Are the left column lines from the old version and right column from the current? (Not reversed)

**Fix all findings before moving to Phase 4.**

---

## Phase 4: UI Edit Creates Version — `KnowledgeItemModal` + `knowledgeService`

**Goal:** Ручное редактирование через UI Edit модалку тоже создаёт версию в subcollection. Единообразие: любое изменение = версия.

### Critical Context

- `KnowledgeItemModal.tsx` calls `onSave({ title, summary, content })` → parent calls `updateMutation.mutate({ itemId, updates })`
- `useUpdateKnowledgeItem` (in `useKnowledgeItems.ts`) calls `KnowledgeService.updateKnowledgeItem`
- `KnowledgeService.updateKnowledgeItem` currently does a simple `updateDocument` with `updatedAt: serverTimestamp()`
- Need to: before update, snapshot current content to `versions/` subcollection
- Frontend Firestore writes: use `addDocument` from `src/core/services/firestore.ts` (or raw `addDoc` from firebase/firestore)
- The snapshot must contain the OLD content (before user edit), not the new content
- `KnowledgeItemModal` has access to `item` (the full KI object) — old content = `item.content`
- Version `source` for manual edits: `'manual'`
- Version `model` for manual edits: `''` (empty string)
- After version creation, invalidate `['knowledgeVersions', ...]` query so Zen Mode dropdown updates

### Tasks

- [x] **T4.1** — Extend `knowledgeVersionService` with `createVersion`
  - File: `src/core/services/knowledge/knowledgeVersionService.ts`
  - Add function:
    ```ts
    createVersion(userId, channelId, kiId, version: KnowledgeVersion): Promise<string>
    ```
  - Uses `addDocument` (auto-generated ID) to `users/${userId}/channels/${channelId}/knowledgeItems/${kiId}/versions`
  - Returns the new version doc ID

- [x] **T4.2** — Extend `KnowledgeService.updateKnowledgeItem` to snapshot version
  - File: `src/core/services/knowledge/knowledgeService.ts`
  - Modify `updateKnowledgeItem` signature: add `previousContent?: string` and `previousSource?: string` and `previousModel?: string` parameters
  - Before the `updateDocument` call: if `previousContent` is provided AND `updates.content?.trim()` differs from `previousContent.trim()`, call `knowledgeVersionService.createVersion` to snapshot the old state. ⚠️ Use `.trim()` to avoid phantom versions from whitespace-only changes
  - Alternative approach (cleaner): create a new wrapper function `updateKnowledgeItemWithVersion(userId, channelId, itemId, updates, previousItem)` that handles both the version snapshot and the update. Keep old `updateKnowledgeItem` for backward compatibility
  - Decision: **wrapper approach** — cleaner, no breaking changes

- [x] **T4.3** — Update `useUpdateKnowledgeItem` mutation
  - File: `src/core/hooks/useKnowledgeItems.ts`
  - Modify mutation to accept `previousItem: KnowledgeItem` alongside `updates`
  - Call `KnowledgeService.updateKnowledgeItemWithVersion` instead of `updateKnowledgeItem`
  - Add `['knowledgeVersions']` to query invalidation on success (so version dropdown updates)

- [x] **T4.4** — Update `KnowledgeItemModal` + call sites
  - File: `src/features/Knowledge/modals/KnowledgeItemModal.tsx`
  - `onSave` callback signature: add `previousItem` to what's passed to parent
  - Or: keep `onSave` signature, change parent to pass `item` context
  - Call sites to update:
    - `src/features/Watch/components/WatchPageKnowledge.tsx` (`handleSave` callback)
    - `src/pages/Knowledge/KnowledgePage.tsx` (if it has handleSave)
  - Each `handleSave` must pass the original `editingItem` to the mutation

- [x] **T4.5** — Tests
  - File: `src/core/services/knowledge/__tests__/knowledgeVersionService.test.ts`
  - Or extend: `src/core/hooks/__tests__/useKnowledgeVersions.test.ts`
  - Test cases:
    - `updateKnowledgeItemWithVersion` creates version when content changes
    - `updateKnowledgeItemWithVersion` does NOT create version when content unchanged
    - Version snapshot contains old content (not new content)
    - Version source is 'manual' for UI edits
    - Version model is empty string for UI edits

### Parallelization plan
```
T4.1 — SEQUENTIAL FIRST (service function)
T4.2 — SEQUENTIAL AFTER T4.1 (wrapper calls T4.1)
T4.3 + T4.4 — PARALLEL (hook + modal/call sites are independent)
T4.5 — SEQUENTIAL LAST (tests)
```

### Verification
```bash
npx vitest run --project frontend
npm run check
```

### MANDATORY: Update this file before proceeding
- [x] Mark completed tasks with [x]
- [x] Update Phase 4 status: TODO → DONE
- [x] Record updated test count

**Test count after Phase 4:** Frontend 489 (38 files) + Backend 812 (57 files) = 1301 total (95 files)

### Review Gate 4

**Prompt for review agent:**

Read these files:
1. `src/core/services/knowledge/knowledgeVersionService.ts`
2. `src/core/services/knowledge/knowledgeService.ts`
3. `src/core/hooks/useKnowledgeItems.ts` (mutation changes)
4. `src/features/Watch/components/WatchPageKnowledge.tsx` (call site)
5. `src/features/Knowledge/modals/KnowledgeItemModal.tsx`

Answer these questions:
1. Does the version snapshot contain the OLD content (pre-edit), not the new content?
2. Is version creation skipped when content is unchanged? (Avoid empty versions when user only edits title/summary)
3. Does the version `source` field = `'manual'` for UI edits? (Not 'chat-tool')
4. Does `useUpdateKnowledgeItem` invalidate the `knowledgeVersions` query? (Dropdown must refresh)
5. Is backward compatibility preserved — does the old `updateKnowledgeItem` still work without version params?
6. Are all call sites of `onSave` / `handleSave` updated to pass the previous item?

**Fix all findings before moving to FINAL.**

---

## FINAL: Double Review-Fix Cycle

### R1: Architecture Review

**Prompt for review agent:**

Read all files created/modified in this feature (in order):
1. `shared/knowledgeVersion.ts` (shared type)
2. `functions/src/services/tools/handlers/knowledge/editKnowledge.ts` (backend handler)
3. `functions/src/services/tools/definitions.ts` (tool definition)
4. `functions/src/services/tools/executor.ts` (registration)
5. `functions/src/chat/aiChat.ts` (content strip)
6. `src/core/config/concludePrompt.ts` (conclude instruction)
7. `src/core/types/knowledge.ts` (frontend types)
8. `src/core/services/knowledge/knowledgeVersionService.ts` (version CRUD)
9. `src/core/hooks/useKnowledgeVersions.ts` (TanStack Query hook)
10. `src/features/Knowledge/components/VersionDropdown.tsx` (UI)
11. `src/features/Knowledge/components/DiffViewer.tsx` (diff UI)
12. `src/features/Knowledge/components/KnowledgeViewer.tsx` (Zen Mode integration)
13. `src/features/Knowledge/components/KnowledgeCard.tsx` (call site)
14. `src/core/services/knowledge/knowledgeService.ts` (version-aware update)
15. `src/core/hooks/useKnowledgeItems.ts` (mutation update)
16. `src/features/Chat/utils/toolRegistry.ts` (badge)

Answer:
1. **SRP**: Does each file have a single responsibility? Is handler logic separated from service logic?
2. **Shared types**: Is `KnowledgeVersion` type SSOT in `shared/`? No duplicates in `functions/src/`?
3. **No duplication**: Is the video ref resolution logic in `editKnowledge` a clean copy of `saveKnowledge` pattern (not a divergent fork)?
4. **Hook pattern**: Does `useKnowledgeVersions` follow the same pattern as `useKnowledgeItems` (queryKey, staleTime, enabled guard)?
5. **Prop drilling**: Is `KnowledgeViewer` receiving the full `item` object instead of many individual props?
6. **CSS variables**: Are all diff colors using CSS variables, not hardcoded values?
7. **No circular deps**: Does `knowledgeVersionService` import anything from `knowledgeService` or vice versa?
8. **Test isolation**: Are all tests using mocks for Firestore, not real connections?
9. **Consistency**: Does `editKnowledge` return the same format as `saveKnowledge` (`{ content: "...", id: "..." }`)?

**Fix all findings.**

### R2: Production Readiness Review

**Prompt for review agent:**

Focus on error handling, edge cases, performance, and security.

Read the same files as R1, but check:
1. **Error handling**: Does `editKnowledge` handler handle these edge cases?
   - KI belongs to a different user (security: basePath includes `ctx.userId` — verified?)
   - Firestore write fails after version snapshot but before main doc update (partial state)
   - Content is empty string (should this be allowed?)
   - `kiId` is malformed (Firestore path injection?)
2. **Performance**: Does `DiffViewer` use `useMemo` for the expensive `diffLines()` call?
3. **Race condition**: Can two concurrent edits (LLM + UI) cause lost versions? (Both read old content, both snapshot, both write — last write wins, but both versions are preserved. Acceptable?)
4. **Security**: Is the versions subcollection path scoped to the user's channel? (`users/${uid}/channels/${chId}/knowledgeItems/${kiId}/versions/` — cannot read other users' versions?)
5. **Memory**: Could a KI with 100+ versions cause the dropdown to be slow? (Should there be a limit on versions fetched?)
6. **Bundle size**: Is `diff` imported only in the component that uses it (tree-shakeable)? Not in a global bundle?
7. **Accessibility**: Does VersionDropdown have keyboard navigation? Does DiffViewer have proper ARIA labels for screen readers?
8. **Firestore rules**: Do existing security rules allow subcollection reads/writes for `versions/`? (If rules use `knowledgeItems/{itemId}` wildcard, subcollections may need explicit rules)
9. **Backward compat**: Do existing KI without versions subcollection render correctly? (Empty versions array, no dropdown crash)
10. **SSE parser**: Does the SSE event parser handle `editKnowledge` tool responses? (Check `sseEvents.ts` — does it construct the response object correctly for new tool names?)

**Fix all findings.**

### Final Verification
```bash
npx vitest run --project frontend
npx vitest run --project functions
npm run check
```

Record final test count. Update feature doc `docs/features/knowledge/edit-knowledge.md`:
- Move `← YOU ARE HERE` marker past Phase 1
- Update "Текущее состояние"
- Update Technical Implementation with actual file paths

### MANDATORY: Update this file
- [ ] Mark all phases DONE
- [ ] Record final test count
- [ ] Move task doc to `docs/archive/tasks/knowledge/edit-knowledge-tasks.md` after completion
