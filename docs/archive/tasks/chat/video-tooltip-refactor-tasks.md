# Video Tooltip & Video Map — Refactoring Tasks

## Overview

Объединить два tooltip-компонента (Chat + Trends/Traffic) в единый `VideoPreviewTooltip` с `full`/`mini` режимами. Разбить God Component `ToolCallSummary` (602 строк). Ввести dedicated `VideoPreviewData` type. Добавить `searchDatabase` в video map.

**Feature doc:** `docs/features/chat/video-tooltip-refactor.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/chat/video-tooltip-refactor.md` (архитектура, решения, отклонённые альтернативы)
3. `src/features/Chat/utils/buildToolVideoMap.ts` (video map — 7 extractors, текущий тип VideoCardContext)
4. `src/features/Chat/utils/toolCallGrouping.ts` (grouping, videoIds, labels, isExpandable via registry)
5. `src/features/Chat/components/ToolCallSummary.tsx` (refactored orchestrator ~234 строк)
6. `src/features/Video/components/VideoPreviewTooltip.tsx` (unified tooltip, `video: VideoPreviewData` + `mode`)
7. `src/features/Chat/utils/toolRegistry.ts` (icon, color, StatsComponent per tool)
8. `src/components/ui/atoms/PortalTooltip.tsx` (fixedDimensions prop)

### Key Decisions (carry forward)

1. **`VideoPreviewData` — dedicated tooltip type.** НЕ `VideoCardContext` (app context union member с fake values). `viewCount: number` (не string). Все поля кроме `videoId`/`title` — optional. Feature doc секция "Ключевое архитектурное решение".
2. **merge-without-overwrite (first-write-wins).** `buildToolVideoMap` заполняет пустые поля, не перезаписывает. Telescope Pattern обеспечивает правильный порядок. Source priority registry — over-engineering (отклонён).
3. **Два extraction pipeline — разные concerns, не дублирование.** `buildToolVideoMap` = глобальная карта (все сообщения). `toolCallGrouping` = per-message videoIds для pill. Разная гранулярность, разное покрытие tools. Объединение создаст coupling.
4. **`toolRegistry.ts` — Open-Closed для UI concerns.** icon, color, StatsComponent, hasExpandableContent per tool. НЕ extractors (см. решение #3). `getGroupLabel()` остаётся отдельной функцией (слишком специфичная логика).
5. **`CopyButton` — relocate из `ChatMessageList.tsx:170-203`, не create.** Существующая реализация с fallback для non-secure contexts. Расширить API: `size`, `title`, `className`.
6. **`fixedDimensions` в PortalTooltip — атомарная миграция.** Добавить prop + мигрировать все 3 caller'а + удалить старые `fixedWidth`/`estimatedHeight`/`FIXED_TOOLTIP_WIDTH`/`FIXED_TOOLTIP_HEIGHT` в одном коммите. Без backward compat.
7. **`browseChannelVideos` намеренно отсутствует в `extractVideoIdsForTool()`.** Browse возвращает десятки видео — шум для pill. `BrowseChannelStats` — правильный формат. Video rows — для targeted tools (mentionVideo, findSimilarVideos).
8. **`getVideoComments` намеренно отсутствует в `buildToolVideoMap`.** Comments — не video metadata. Присутствует только в grouping (для videoId в pill).

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы
- **Parallel tasks внутри Wave 1** — P1, P3, P4 независимы

### Execution Order

```
Wave 1: P1 + P3 + P4 — PARALLEL (независимые файлы, разные домены)
              ↓
     MERGE P3+P4 into main (resolve conflicts) ✓ DONE
              ↓
     Review Gate W1 ✓ DONE (9/9 PASS)
              ↓
Wave 2: P2 — SEQUENTIAL ✓ DONE
              ↓
     Review Gate W2 ✓ DONE (8/8 PASS)
              ↓
         FINAL ✓ DONE (R1 8/8 + R2 7/7 PASS)
```

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| P1 | VideoPreviewData type + Unified tooltip + PortalTooltip fixedDimensions + CopyButton relocate | **DONE** |
| P3 | ToolCallSummary → orchestrator + toolStats/ + toolRegistry | **DONE** |
| P4 | searchDatabase in video map + тесты buildToolVideoMap | **DONE** |
| **MERGE** | Merge P4's searchDatabase into P3's refactored toolCallGrouping + registry | **DONE** |
| Review Gate W1 | Cross-check P1+P3+P4 integration points | **DONE** (9/9 PASS) |
| P2 | Chat integration: connect unified tooltip, delete old components | **DONE** |
| Review Gate W2 | Verify P2 changes | **DONE** (8/8 PASS) |
| FINAL | Double review-fix cycle (R1 Architecture + R2 Production Readiness) | **DONE** (R1 8/8, R2 7/7 PASS) |
| Post-FINAL fixes | Visual polish: glass variant, delta badges, Timeline deltas, badge font weight | **DONE** |

## Current Test Count

- **Frontend: 384 tests (26 files)** — verified after post-FINAL fixes via `npx vitest run --project frontend`
- **Backend: 699 tests (48 files)** — from previous session (not re-run yet)
- **Total: ~1083 tests**

---

## MERGE: P4 into P3's refactored structure — DONE

**Problem (resolved):** P3 and P4 both modified `toolCallGrouping.ts` and `ToolCallSummary.tsx` in parallel worktrees. P3's versions were copied to main first (structural refactor), then P4's additive changes (searchDatabase) were merged in.

**Final state in main:**
- `toolCallGrouping.ts` — registry-based `isExpandable()` + searchDatabase extraction + label
- `ToolCallSummary.tsx` — 234 lines, uses registry
- `toolRegistry.ts` — 13 tools, all with correct StatsComponent (incl. SearchDatabaseStats)
- `toolStats/index.ts` — 11 re-exports (incl. SearchDatabaseStats)
- `buildToolVideoMap.ts` — 7 extractors including searchDatabase
- Test files — 21 + 11 tests passing

**Completed merge tasks:**

### ✅ M1. Add searchDatabase to P3's `toolCallGrouping.ts`
- Add `case 'searchDatabase': return extractSearchDatabaseVideoIds(records);` in `extractVideoIdsForTool` switch (after line 62, before `default`)
- Add `extractSearchDatabaseVideoIds()` function (after `extractNicheSnapshotVideoIds`):
  ```typescript
  /** Extract unique video IDs from searchDatabase results (result.results[].videoId). */
  function extractSearchDatabaseVideoIds(records: ToolCallRecord[]): string[] {
      const ids: string[] = [];
      for (const r of records) {
          const results = r.result?.results as Array<{ videoId: string }> | undefined;
          if (results) {
              for (const v of results) {
                  if (v.videoId && !ids.includes(v.videoId)) ids.push(v.videoId);
              }
          }
      }
      return ids;
  }
  ```
- Add searchDatabase label block in `getGroupLabel()` (before `getVideoComments` block):
  ```typescript
  if (group.toolName === 'searchDatabase') {
      if (group.hasErrors) return "Couldn't search database";
      if (!group.allResolved) return 'Searching database...';
      const result = group.records[0]?.result;
      const resultCount = (result?.results as unknown[] | undefined)?.length;
      const query = result?.query as string | undefined;
      if (resultCount != null && query) {
          return `${resultCount} results for "${query}"`;
      }
      return resultCount != null
          ? `${resultCount} search ${resultCount === 1 ? 'result' : 'results'}`
          : 'Database search complete';
  }
  ```
- `isExpandable()` — NO changes needed (P3's registry-based version handles searchDatabase via `hasExpandableContent: true` in registry)

### ✅ M2. Add SearchDatabaseStats to `toolRegistry.ts`
- Import: `import { ..., SearchDatabaseStats } from '../components/toolStats';`
- Update searchDatabase entry: add `StatsComponent: SearchDatabaseStats`

### ✅ M3. Add SearchDatabaseStats to `toolStats/index.ts`
- Add: `export { SearchDatabaseStats } from './SearchDatabaseStats';`

### ✅ M4. Verify merge
```bash
npm run lint && npm run typecheck && npm run test:run
```

### ✅ M5. Clean up worktrees — DONE
Worktrees and branches removed after FINAL review.

---

## P1: VideoPreviewData + Unified Tooltip + PortalTooltip + CopyButton

**Goal:** Dedicated tooltip type. Один компонент — два режима. Parametric fixed dimensions. CopyButton atom.

### Tasks

- [x] **T1.1** — `VideoPreviewData` type → `src/features/Video/types.ts`
- [x] **T1.2** — CopyButton relocate → `src/components/ui/atoms/CopyButton.tsx` (extended API: size, title, className)
- [x] **T1.3** — PortalTooltip `fixedDimensions` (deprecated props removed, 3 callers migrated)
- [x] **T1.4** — Unified VideoPreviewTooltip (`video: VideoPreviewData` + `mode`, formatDelta/getDeltaColor extracted to formatUtils.ts, CopyButton atom, ResizeObserver removed, canLoad commented)

### Files Changed (P1)
- `src/features/Video/types.ts` — NEW: VideoPreviewData + PREVIEW_DIMENSIONS
- `src/components/ui/atoms/CopyButton.tsx` — NEW: relocated from ChatMessageList
- `src/components/ui/atoms/PortalTooltip.tsx` — fixedDimensions prop, removed deprecated
- `src/features/Video/components/VideoPreviewTooltip.tsx` — unified component
- `src/core/utils/formatUtils.ts` — formatDelta(), getDeltaColor()
- `src/features/Chat/ChatMessageList.tsx` — CopyButton import, removed inline copy, removed useCallback
- `src/pages/Trends/Table/TrendsVideoRow.tsx` — video={...} API, fixedDimensions
- `src/pages/Trends/Timeline/TrendTooltip.tsx` — video={...} API, fixedDimensions
- `src/pages/Details/tabs/Traffic/components/TrafficRow.tsx` — video={...} API, fixedDimensions

**Verification:** lint ✓ typecheck ✓

---

## P3: ToolCallSummary Refactoring

**Goal:** Разбить God Component (602 строк) → orchestrator (~200 строк) + модули.

### Tasks

- [x] **T3.1** — 10 Stats components extracted to `toolStats/` (pure relocation)
- [x] **T3.2** — `toolRegistry.ts` created (13 tools, getToolConfig)
- [x] **T3.3** — ToolCallSummary refactored 587→234 lines (registry lookups)
- [x] **T3.4** — `isExpandable()` simplified to 3-line registry formula

### Files Changed (P3)
- `src/features/Chat/components/toolStats/` — 11 component files + index.ts (NEW; SearchDatabaseStats added in MERGE)
- `src/features/Chat/utils/toolRegistry.ts` — NEW
- `src/features/Chat/components/ToolCallSummary.tsx` — refactored
- `src/features/Chat/utils/toolCallGrouping.ts` — isExpandable simplified

**Verification:** lint ✓ typecheck ✓

---

## P4: Restore Rolled-Back Extractors + searchDatabase + Tests

**Goal:** Восстановить откатившиеся extractors, добавить searchDatabase, покрыть тестами.

### Tasks

- [x] **T4.0** — Extractors restored: findSimilarVideos, browseTrendVideos, getNicheSnapshot + helpers (ytThumbnailUrl, buildChannelNameMap, delta fields in mergeInto)
- [x] **T4.1** — searchDatabase added to buildToolVideoMap
- [x] **T4.2** — searchDatabase added to toolCallGrouping (merged into P3's version ✓)
- [x] **T4.3** — SearchDatabaseStats created + integrated into registry + index ✓
- [x] **T4.4** — 21 tests in buildToolVideoMap.test.ts (was 7): findSimilar, browseTrend, nicheSnapshot, searchDatabase, delta merge, edges
- [x] **T4.5** — 11 tests in toolCallGrouping.test.ts (NEW): searchDatabase videoIds, labels, isExpandable

### Files Changed (P4)
- `src/features/Chat/utils/buildToolVideoMap.ts` — 7 extractors + helpers
- `src/features/Chat/utils/__tests__/buildToolVideoMap.test.ts` — 21 tests
- `src/features/Chat/utils/__tests__/toolCallGrouping.test.ts` — NEW, 11 tests
- `src/features/Chat/components/toolStats/SearchDatabaseStats.tsx` — NEW

**Verification:** lint ✓ typecheck ✓ frontend tests ✓ (384 tests, 26 files)

---

## P2: Chat Integration (depends on P1 + P3 + P4)

**Goal:** Chat использует unified tooltip. Удаление дубликатов. Clean cut.

**Critical Context:**
- `buildToolVideoMap` сейчас возвращает `Map<string, VideoCardContext>` — после P2 → `Map<string, VideoPreviewData>`
- `ChatMessageList.tsx` мержит `persistedContext` (VideoCardContext[]) с toolMap → нужен `toPreviewData()` adapter
- `VideoReferenceTooltip.tsx:22` принимает `video: VideoCardContext | null` → type widening к `VideoPreviewData | null`
- `getFallbackTitle()` в ToolCallSummary — станет unnecessary после P4 (extractors синхронизированы)
- ⚠️ Scope: НЕ менять `VideoCardContext` type — он используется в app context (canvas, chat persistence). Только перестать использовать для tooltip.

### Tasks

- [x] **T2.1** — `buildToolVideoMap` → `VideoPreviewData`
  - Change return type: `Map<string, VideoCardContext>` → `Map<string, VideoPreviewData>`
  - Remove `type: 'video-card'` из каждого extractor
  - Remove `stringifyCount()` — viewCount остаётся `number`
  - Update `mergeInto()` type: `PartialVideo = Partial<Omit<VideoPreviewData, 'videoId' | 'title'>>`
  - Remove `ownership: 'competitor'` default — ownership теперь optional
  - ⚠️ Этот шаг вызовет cascade type errors — fix all downstream consumers:
    - `MarkdownMessage` props: `videoMap?: Map<string, VideoCardContext>` → `Map<string, VideoPreviewData>`
    - `MessageItemProps`: `videoMap?: Map<string, VideoCardContext>` → `Map<string, VideoPreviewData>`
    - `ToolCallSummary` props: `videoMap` type
    - Все компоненты, потребляющие `videoMap.get()` — проверить совместимость с `VideoPreviewData`

- [x] **T2.2** — `ChatMessageList` → `toPreviewData()` adapter
  - Create: `src/features/Chat/utils/toPreviewData.ts`
  - `toPreviewData(ctx: VideoCardContext): VideoPreviewData`
  - `viewCount: ctx.viewCount ? Number(ctx.viewCount) : undefined` — string→number conversion в одном месте
  - Update `referenceVideoMap` in ChatMessageList: `Map<string, VideoPreviewData>`, merge via adapter
  - Remove `VideoCardContext` import from ChatMessageList (if no other usage)
  - Update `buildVideoIdMap` call → map results through `toPreviewData`

- [x] **T2.3** — `VideoReferenceTooltip` → `VideoPreviewData`
  - Props: `video: VideoCardContext | null` → `video: VideoPreviewData | null`
  - Replace внутренний tooltip → `VideoPreviewTooltip mode="mini"` через PortalTooltip `sizeMode="fixed"` `fixedDimensions={PREVIEW_DIMENSIONS.mini}`
  - Remove `VideoTooltipContent` import
  - Update все callers (type будет guide)

- [x] **T2.4** — `ToolCallSummary` → unified tooltip
  - Replace: `VideoTooltipContent` → `VideoPreviewTooltip mode="mini"` через PortalTooltip `sizeMode="fixed"` `fixedDimensions={PREVIEW_DIMENSIONS.mini}`
  - Remove: `getFallbackTitle()` (extractors синхронизированы после P4)
  - Remove: inline thumbnail fallback (`ytThumbnailUrl` в buildToolVideoMap уже покрывает)
  - Update `videoMap` prop type to `Map<string, VideoPreviewData>`

- [x] **T2.5** — Delete `VideoTooltipContent.tsx`
  - Delete: `src/features/Chat/components/VideoTooltipContent.tsx` (207 строк)
  - Grep for any remaining imports → fix

- [x] **T2.6** — Cleanup
  - Remove `stringifyCount()` import/usage если осталось
  - Remove unused imports из ChatMessageList, ToolCallSummary
  - Verify: no `VideoCardContext` references in tooltip rendering path

### Files Changed (P2)
- `src/features/Chat/utils/buildToolVideoMap.ts` — `VideoPreviewData` return type, removed `stringifyCount()`, `type: 'video-card'`
- `src/features/Chat/utils/toPreviewData.ts` — NEW: adapter `VideoCardContext → VideoPreviewData`
- `src/features/Chat/ChatMessageList.tsx` — `referenceVideoMap: Map<string, VideoPreviewData>`, uses `toPreviewData()`
- `src/features/Chat/components/VideoReferenceTooltip.tsx` — `VideoPreviewData` prop, `VideoPreviewTooltip mode="mini"`
- `src/features/Chat/components/ToolCallSummary.tsx` — `VideoPreviewData` videoMap, `VideoPreviewTooltip mode="mini"`, removed `getFallbackTitle()`
- `src/features/Chat/components/VideoTooltipContent.tsx` — **DELETED** (179 lines)
- `src/features/Chat/utils/__tests__/buildToolVideoMap.test.ts` — viewCount string→number assertions
- `docs/features/chat/video-tooltip-refactor.md` — removed broken reference to deleted file

**Verification:** lint ✓ typecheck ✓ doc check ✓ 384 frontend tests ✓

---

## Review Gates

### Review Gate W1 (after P1 + P3 + P4)

Prompt для review agent:
> Read `docs/features/chat/video-tooltip-refactor.md` and `docs/features/chat/video-tooltip-refactor-tasks.md`.
> Then review all changed/created files from P1, P3, P4. Answer:
> 1. Does `VideoPreviewData` type match the spec in feature doc? Any missing fields?
> 2. Does `VideoPreviewTooltip` correctly handle both `full` and `mini` modes? Is "show what you have" principle followed?
> 3. Are all 3 Trends/Traffic callers migrated to `fixedDimensions`? Any remaining `fixedWidth`/`estimatedHeight`?
> 4. Is `CopyButton` properly relocated? Does `ChatMessageList` still work?
> 5. Does `toolRegistry.ts` cover all 13 tools? Does `isExpandable()` match the one-liner formula?
> 6. Are all Stats components properly extracted? No logic changes — pure relocation?
> 7. Is `searchDatabase` in both `buildToolVideoMap` and `toolCallGrouping`? Stats component created?
> 8. New test coverage: are all uncovered tools tested (findSimilarVideos, browseTrendVideos, getNicheSnapshot, searchDatabase)?
> 9. Run `npm run lint && npm run typecheck && npm run test:run` — all pass?

Fix all findings before proceeding to P2.

**Result: 9/9 PASS.** Minor observation: icon assignments in toolRegistry differ from feature doc spec (`getMultipleVideoDetails` = BarChart3, `analyzeSuggestedTraffic` = TrendingUp) — intentional refinements, not bugs. Feature doc to be updated post-completion.

### Review Gate W2 (after P2)

Prompt для review agent:
> Read feature doc + task doc. Review all P2 changes. Answer:
> 1. Is `buildToolVideoMap` return type now `Map<string, VideoPreviewData>`? No `VideoCardContext` in tooltip path?
> 2. Is `toPreviewData()` adapter correct? `viewCount` string→number? No data loss?
> 3. Is `VideoTooltipContent.tsx` deleted? No orphan imports?
> 4. Is `VideoReferenceTooltip` props widened to `VideoPreviewData`?
> 5. Is `getFallbackTitle()` removed? All tools in extractors synced?
> 6. Is `stringifyCount()` removed?
> 7. Run `npm run lint && npm run typecheck && npm run test:run` — all pass?
> 8. Grep for `VideoTooltipContent` across codebase — zero hits?

Fix all findings before FINAL.

---

## FINAL: Double Review-Fix Cycle

### R1: Architecture Review

Prompt для review agent:
> Read feature doc + task doc. Full architecture review:
> 1. **Type safety:** No `as any`, no fake values, no unnecessary type assertions in tooltip path
> 2. **Single responsibility:** ToolCallSummary < 250 lines? Each Stats component = 1 file?
> 3. **Open-Closed:** Adding a new tool = 1 entry in toolRegistry + 1 extractor in buildToolVideoMap + 1 extractor in toolCallGrouping. No other files need changes?
> 4. **No dead code:** VideoTooltipContent deleted? stringifyCount deleted? ResizeObserver removed? FIXED_TOOLTIP_WIDTH/HEIGHT removed?
> 5. **Import hygiene:** No circular dependencies? No unused imports?
> 6. **Data flow:** VideoPreviewData flows cleanly from buildToolVideoMap → tooltip? No intermediate conversions?
> 7. **Merge strategy:** first-write-wins preserved? No regressions in existing tool extractors?
> 8. **Design tokens:** CopyButton uses CSS variables? Tooltip colors from theme? No hardcoded values?

### R2: Production Readiness

Prompt для review agent:
> Read feature doc + task doc. Production readiness check:
> 1. **Test coverage:** All tools in buildToolVideoMap have tests? Delta merge tested? Edge cases?
> 2. **UI consistency:** `full` and `mini` tooltips look correct? Badges, formatting, copy buttons work?
> 3. **No regressions:** Trends/Traffic tooltip unchanged in appearance? Chat tooltip upgraded?
> 4. **Performance:** No unnecessary re-renders? VideoPreviewTooltip memoized where needed?
> 5. **Accessibility:** CopyButton has proper aria labels? Tooltip keyboard accessible?
> 6. **Feature doc updated:** "Текущее состояние" reflects post-refactor state? Technical Implementation updated?
> 7. **All checks pass:** `npm run lint && npm run typecheck && npm run test:run`

Fix all findings. Then final verification:
```bash
npm run lint && npm run typecheck && npm run test:run
```

Update feature doc "Текущее состояние" and Phase Status table → all DONE.

---

## Post-FINAL: Visual Polish

Fixes applied after FINAL review, during manual QA.

### ✅ PF1. Chat tooltip `variant="glass"` — missing frosted glass
- **Problem:** Trends tooltip had `variant="glass"` (backdrop-blur), Chat tooltip had default (solid fill)
- **Fix:** Added `variant="glass"` to `ToolCallSummary.tsx` and `VideoReferenceTooltip.tsx`

### ✅ PF2. Delta badge color inconsistency (Tailwind JIT bug)
- **Problem:** `getDeltaColor(d7d, '/80')` dynamically concatenated opacity suffix → Tailwind JIT couldn't scan it → classes not generated → 7d/30d badges had no color
- **Fix:** Removed `opacity` parameter from `getDeltaColor()`, all three badges use same `text-emerald-400`
- **Root cause:** Dynamic class construction (`text-emerald-400${opacity}`) breaks Tailwind JIT scanning

### ✅ PF3. Trends Table tooltip missing deltas
- **Problem:** `TrendsVideoRow` had `delta24h/7d/30d` as props but didn't include them in `video` object passed to `VideoPreviewTooltip`
- **Fix:** Added `delta24h`, `delta7d`, `delta30d` to the inline video object

### ✅ PF4. Timeline tooltip missing deltas
- **Problem:** `TrendTooltip` received `video: TrendVideo` which has no delta fields. Timeline never had delta data.
- **Fix:** Added `useTrendSnapshots` + `calculateViewDeltas` in `TrendsPage` → `deltaMap` prop through `TimelineCanvas` → `TrendTooltip` → `VideoPreviewTooltip` via `deltaStats`
- **Files changed:** `TrendsPage.tsx`, `TimelineCanvas.tsx`, `TrendTooltip.tsx`
- **Cost:** Zero — TanStack Query caches snapshots (`staleTime: Infinity`), shared with Table view

### ✅ PF5. Delta badge period label styling
- **Problem:** Period label (24h:, 7d:, 30d:) and value had same font weight — hard to distinguish from views badge
- **Fix:** Period labels `font-bold`, values `font-medium` in `VideoPreviewTooltip.tsx`

### Pending: Mini tooltip sizing
- **Problem:** Fixed 500px height wastes space; 420px width causes badge row wrapping
- **Proposed:** `fixedDimensions.height` optional → fixed width + auto height (industry standard). Width bump to ~480px
- **Status:** Awaiting user decision
