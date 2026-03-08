# Competitive Intelligence — Этап 1 Tasks

## Overview

Добавить 3 новых AI tool в agentic loop: `listTrendChannels`, `browseTrendVideos`, `getNicheSnapshot`. Дают LLM доступ к данным конкурентов из Trends (Firestore). Побочный продукт: вынос percentile алгоритма в `shared/`.

**Feature doc:** `docs/features/chat/competitive-intelligence.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/chat/competitive-intelligence.md` (архитектура, решения, примеры ответов)
3. `functions/src/services/tools/definitions.ts` (существующие tool definitions — паттерн)
4. `functions/src/services/tools/executor.ts` (как регистрируются handlers)
5. `functions/src/services/tools/handlers/browseChannelVideos.ts` (ближайший паттерн — Layer 1 handler)
6. `functions/src/services/trendSnapshotService.ts` (getViewDeltas — переиспользуем)

### Key Decisions (carry forward)

1. **Layer 4: все данные из Firestore, zero YouTube API cost.** Данные конкурентов уже синхронизированы через Trends. Не ходим в YouTube API.
2. **Percentile всегда per-channel.** Cross-channel percentile = синоним размера канала. Per-channel показывает аномалии — полезнее для анализа.
3. **Shared percentile algorithm** → `shared/percentiles.ts` (SSOT для frontend + backend). Паттерн `shared/viewDeltas.ts`.
4. **`getNicheSnapshot` = data + computation, not interpretation.** Возвращает сырые данные + pre-computed агрегаты (подсчёт тегов, средние, сортировки). LLM интерпретирует.
5. **View deltas через `trendSnapshotService.getViewDeltas()`** — runtime enrichment, не хранение. `null` = нет данных (не `0`).
6. **`browseTrendVideos`: default limit 50, max 200, без пагинации.** `totalMatched` (required) в ответе. LLM сужает фильтры или увеличивает limit.
7. **Staleness awareness:** каждый tool response содержит `dataFreshness` — LLM знает, когда данные были синхронизированы.

## Agent Orchestration Strategy

Main context = **executor + orchestrator**.
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы
- **Parallel tasks** — независимые handlers внутри фазы

### Phase 2 parallelization plan
```
T2.1 (shared/percentiles.ts) — done in Phase 1
T2.1.5 (getHiddenVideoIds utility) + T2.2a (cache distribution in sync) — PARALLEL FIRST
T2.2b + T2.3 + T2.4 (3 handlers) — PARALLEL subagents (depend on T2.1.5, T2.2a)
T2.5 (registration: definitions.ts + executor.ts) — SEQUENTIAL (depends on T2.2-T2.4)
T2.6 (frontend: ToolCallSummary + toolCallGrouping) — INDEPENDENT, parallel with T2.5
T2.7 (tests) — SEQUENTIAL LAST (depends on T2.2-T2.6)
→ Review Gate 2: subagent
```

### Phase 3 parallelization plan
```
T3.1 + T3.2 + T3.3 (3 tool docs) — PARALLEL subagents
→ Review Gate 3: subagent
```

### FINAL phase
```
R1 (Architecture Review) — subagent → fix findings
R2 (Production Readiness) — subagent → fix findings
Final verification — all test suites + lint + typecheck + docs
```

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Safety net: понять текущие данные, написать тесты для shared percentile | DONE |
| 2 | Реализация 3 handlers + registration + frontend refactor | DONE |
| 3 | Документация инструментов (tool docs) | DONE |
| FINAL | Double review-fix cycle | DONE |

## Current Test Count

- **Frontend: 718 tests (50 files)** — verified via `npm run test:run` (2026-03-08)
- **Backend: 436 tests (28 files)** — verified via `npx vitest run --project functions` (2026-03-08)
- **Total: 1154 tests** — all passing

---

## Phase 1: Shared Percentile Algorithm

**Goal:** Вынести percentile calculation из `TrendsPage.tsx` в `shared/percentiles.ts` — SSOT для frontend и backend. Покрыть тестами.

### CRITICAL CONTEXT

- Текущий алгоритм: `src/pages/Trends/TrendsPage.tsx` lines 52-68, `useMemo` внутри React-компонента
- 5 групп: `Top 1%`, `Top 5%`, `Top 20%`, `Middle 60%`, `Bottom 20%`
- Группы определены в `src/core/stores/trends/trendStore.ts` lines 28-37 (`PERCENTILE_GROUPS`)
- Визуальные стили: `src/core/utils/trendStyles.ts` (`DOT_STYLES`)
- ⚠️ Фильтр по percentile в `src/pages/Trends/hooks/useFilteredVideos.ts` lines 82-86 хранит **excluded** groups (не included)
- ⚠️ `PERCENTILE_GROUPS` экспортируется из store — при переносе в shared нужно обновить все импорты

### Tasks

- [x] **T1.1** — Create shared pure algorithm
  - Create: `shared/percentiles.ts`
  - Export: `assignPercentileGroups(videos: {id: string, viewCount: number}[])` → `Map<videoId, PercentileGroup>`
  - Export: `PERCENTILE_GROUPS` constant (move from `trendStore.ts`)
  - Export: `type PercentileGroup`
  - Export: `getPercentileDistribution(videos: {viewCount: number}[])` → `{p25, median, p75, max}` (для `listTrendChannels`)
  - 0 I/O, 0 dependencies, 0 framework imports
  - Паттерн: `shared/viewDeltas.ts`

- [x] **T1.2** — Test shared algorithm
  - Create: `shared/__tests__/percentiles.test.ts`
  - ⚠️ Tests in `shared/__tests__/` run under the **frontend** vitest project (`npm run test:run`). Паттерн: `shared/__tests__/viewDeltas.test.ts`
  - Cases for `assignPercentileGroups`:
    - 100 videos → correct distribution (1 in Top 1%, 4 in Top 5%, 15 in Top 20%, 60 in Middle, 20 in Bottom)
    - Single video → Top 1% (i=0, percentile = 0/1*100 = 0, ≤1 → Top 1%)
    - Empty array → empty Map
    - Tied view counts → stable order (sort is stable in modern JS)
    - Videos already sorted → same result as unsorted
  - Cases for `getPercentileDistribution`:
    - Normal distribution → correct quartiles
    - Single video → p25=median=p75=max=that view count
    - Empty array → all zeros (or null? — decide)
    - Two videos → correct interpolation

- [x] **T1.3** — Refactor frontend to use shared
  - `src/pages/Trends/TrendsPage.tsx`: replace inline useMemo with `import { assignPercentileGroups } from 'shared/percentiles'`
  - `src/core/stores/trends/trendStore.ts`: remove `PERCENTILE_GROUPS` definition, re-export from shared
  - Update all imports of `PERCENTILE_GROUPS` and `PercentileGroup` across codebase (known files):
    - `src/features/Filter/FilterInputs/FilterInputPercentile.tsx` — imports both `PERCENTILE_GROUPS` and `PercentileGroup` from trendStore
    - `src/pages/Trends/Header/TrendsFilterButton.tsx` — imports `PercentileGroup` from trendStore
    - `src/core/utils/trendStyles.ts` — defines its own `PercentileGroup` type (line 10) + uses string literals as keys. ⚠️ Reconcile with shared type to avoid duplicate type definitions
  - ⚠️ Before making changes: `grep -r "PERCENTILE_GROUPS\|PercentileGroup" src/` to verify no other imports exist beyond this list
  - All existing tests must still pass (zero behavior change)

### Verification

```bash
npm run test:run                       # all frontend tests pass
npx vitest run --project functions     # all backend tests pass
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 1 → DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 1

**Prompt:** "Review the shared percentile algorithm created in Phase 1 of competitive-intelligence. Check:
- Does `shared/percentiles.ts` have zero I/O, zero dependencies? (same pattern as `shared/viewDeltas.ts`)
- Are all 5 percentile groups correctly assigned? (Top 1% = index/count ≤ 0.01, etc.)
- Does `getPercentileDistribution` correctly compute p25/median/p75/max?
- Are all frontend imports updated? Grep for old import paths.
- Does `TrendsPage.tsx` use the shared function in the same `useMemo`?
- Do all existing percentile filter tests still pass?
- Run `npm run test:run && npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 2.

---

## Phase 2: Handler Implementation

**Goal:** Implement 3 tool handlers, register them, verify end-to-end.

### CRITICAL CONTEXT

- Handler signature: `async (args: Record<string, unknown>, ctx: ToolContext) => Promise<Record<string, unknown>>`
- ToolContext: `{ userId, channelId, youtubeApiKey?, reportProgress? }`
- Firestore base path: `users/${ctx.userId}/channels/${ctx.channelId}`
- Trend channels path: `${basePath}/trendChannels/{trendChannelId}`
- Trend videos path: `${basePath}/trendChannels/{trendChannelId}/videos/{videoId}`
- Trend snapshots path: `${basePath}/trendChannels/{trendChannelId}/snapshots/{timestamp}`
- ⚠️ Firestore field: `thumbnail` (НЕ `thumbnailUrl`)
- ⚠️ `trendChannelId` в Firestore = YouTube channel ID (e.g., `UC_x5XG1OV2P6uZZ5FSM9Ttw`)
- ⚠️ Never throw from handler — return `{ error: "message" }`
- ⚠️ Hidden videos: `${basePath}/hiddenVideos/{videoId}` — содержит `{ id, channelId, hiddenAt }`. `channelId` = trend channel ID. Фильтрация: читать ALL hidden videos, затем `hv.channelId === trendChannelId` для каждого канала
- ⚠️ `publishedAt` в Firestore = **string (ISO 8601)**. Firestore `where` range queries работают корректно на ISO строках
- ⚠️ `performanceDistribution` кэшируется на channel doc при sync (T2.2a). `listTrendChannels` = 10 doc reads, не 8000
- View deltas: `import { getViewDeltas } from "../../trendSnapshotService.js"` — всегда передавать `channelIdHints` (массив trendChannelId текущего запроса) для предотвращения лишних Firestore reads

### Tasks

- [x] **T2.1** — `shared/percentiles.ts` done in Phase 1 (dependency)

- [x] **T2.1.5** — Backend utility: `getHiddenVideoIds`
  - Create: `functions/src/services/tools/utils/getHiddenVideoIds.ts`
  - Signature: `async (basePath: string) => Promise<Set<string>>`
  - Logic: read `${basePath}/hiddenVideos/` collection → return `Set` of document IDs
  - ⚠️ Бэкенд сейчас вообще не знает о hidden videos (zero existing usage in `functions/src/`). Это первый backend consumer
  - ⚠️ Flat `Set<string>` достаточен: YouTube video ID глобально уникален — один videoId = один канал. `channelId` поле на hidden doc используется фронтендом для UI и copy channel, но для handler фильтрации не нужно
  - Переиспользуется в T2.2b, T2.3, T2.4

- [x] **T2.2a** — Cache `performanceDistribution` at sync time
  - File: `functions/src/services/sync.ts` — private method `updateChannelStats()` (lines 131-147)
  - Called from `syncChannel()` at line 122: `await this.updateChannelStats(userId, userChannelId, trendChannel.id, videos, timestamp)`
  - Сейчас метод получает `videos: YouTubeVideoItem[]` и считает `totalViewCount` + `averageViews`. Добавить в тот же `channelRef.update()` (line 142-146):
    - `performanceDistribution: getPercentileDistribution(videos.map(v => ({ viewCount: parseInt(v.statistics.viewCount || '0') })))`
    - `videoCount: videos.length`
  - Import: `getPercentileDistribution` from `shared/percentiles.ts` (через symlink `../../shared/percentiles.js`)
  - ⚠️ `videos` — это `YouTubeVideoItem[]` (YouTube API response). ViewCount = `parseInt(v.statistics.viewCount || '0')` — тот же parsing, что уже на line 138
  - ⚠️ Zero дополнительных Firestore reads — видео уже в памяти

- [x] **T2.2b** — Handler: `listTrendChannels`
  - Create: `functions/src/services/tools/handlers/listTrendChannels.ts`
  - Input: none (uses ctx)
  - Logic:
    1. Read all docs from `${basePath}/trendChannels/` — **10 doc reads, не 8000**
    2. For each channel: read `performanceDistribution`, `totalViewCount`, `averageViews`, `videoCount` directly from channel doc (cached at sync time by T2.2a)
    3. Build `dataFreshness` from channel `lastUpdated`
  - Output: `{ channels: [...], totalChannels, totalVideos, dataFreshness: [...] }`
  - Error: if no trend channels → `{ channels: [], totalChannels: 0, totalVideos: 0, dataFreshness: [] }` (valid empty result, not error)
  - ⚠️ Channels added before T2.2a won't have `performanceDistribution` — handler must handle `null` gracefully (omit field or return empty object). Distribution appears after first sync

- [x] **T2.3** — Handler: `browseTrendVideos`
  - Create: `functions/src/services/tools/handlers/browseTrendVideos.ts`
  - Input: `{ channelIds?, dateRange?: {from, to}, performanceTier?, sort?, limit? }`
  - Logic:
    1. Get list of trend channels (all or filtered by `channelIds`)
    2. For each channel: read ALL videos → `assignPercentileGroups()` on full set → attach `performanceTier` to each video. ⚠️ Percentile = rank among ALL videos of channel, not just date-filtered subset (same as frontend `globalPercentileMap`)
    3. Apply date range filter (`publishedAt` in `dateRange`)
    4. Filter by `performanceTier` if specified
    5. Get hidden videos → filter out
    6. Sort by requested field (default: `publishedAt desc`)
    7. ⚠️ Sort by delta fields: if all deltas null → fallback to `viewCount desc`, add `_note`
    8. Compute `totalMatched = filteredVideos.length` — BEFORE limit. ⚠️ Must reflect count after all filters (date + percentile + hidden) but before truncation
    9. Apply limit (default 50, max 200)
    10. Enrich with view deltas via `getViewDeltas()` — pass `channelIdHints` (array of trendChannelIds from current query). ⚠️ Only for limit-truncated set, not all matched
    11. Build `dataFreshness` from channel `lastUpdated`
  - Output: `{ videos: [...], totalMatched, channels: [...], dataFreshness: [...] }`

- [x] **T2.4** — Handler: `getNicheSnapshot`
  - Create: `functions/src/services/tools/handlers/getNicheSnapshot.ts`
  - Input: `{ date?, videoId?, channelId?, windowDays? }`
  - ⚠️ `windowDays` default = `7` (window = ±7 дней = 14 дней total). Вынести в именованную константу `DEFAULT_WINDOW_DAYS`
  - ⚠️ `date` = **primary input**. Основной flow: bridge context передаёт publishedAt → AI вызывает `getNicheSnapshot(date: "...")` напрямую. `videoId` — fallback для edge case (пользователь вставляет ссылку без bridge context)
  - Logic:
    1. Determine reference date:
       - (a) If `date` provided → use directly (primary path, zero extra reads)
       - (b) If only `videoId` → resolve with inverted fallback (Layer 4 first):
         - If `channelId` provided → single doc read: `trendChannels/{channelId}/videos/{videoId}` (1 read)
         - Else → batch-read `trendChannels/{id}/videos/{videoId}` across all channels (max 10 reads)
         - If still not found → fallback to `resolveVideosByIds(basePath, [videoId])` (user's own videos)
         - If still not found → `{ error: "Video not found: {videoId}" }`
         - Extract `publishedAt` from whichever source succeeded
    2. Compute window: `[date - windowDays, date + windowDays]`
    3. For each trend channel: query videos by `publishedAt` in window
    4. Filter hidden videos
    5. Group by channel, compute per-channel stats (count, avgViews, topPerformer)
    6. Compute aggregates: `totalVideosInWindow`, `commonTags` (tag frequency counting), `avgViewsInWindow`, `topByViews` (top 5 by viewCount)
    7. Enrich with view deltas via `getViewDeltas()` — pass `channelIdHints` (array of trendChannelIds in window)
    8. Build `dataFreshness`
  - Output: `{ referencePoint, window, competitorActivity: [...], aggregates: {...}, dataFreshness: [...] }`
  - Edge case: no videos in window → valid empty response with zero aggregates

- [x] **T2.5** — Registration
  - `functions/src/services/tools/definitions.ts`:
    - Add 3 constants to `TOOL_NAMES`
    - Create 3 `ToolDefinition` objects with clear descriptions + `parametersJsonSchema`
    - Add to `TOOL_DECLARATIONS` array
  - `functions/src/services/tools/executor.ts`:
    - Import 3 handlers
    - Add to `HANDLERS` map
  - ⚠️ Tool descriptions: include usage guidance for LLM (when to call, what to do with results, dependencies)
  - ⚠️ `getNicheSnapshot` description must guide LLM: "Prefer `date` parameter when publishedAt is known from context. Use `videoId` only when date is unavailable. Pass `channelId` alongside `videoId` when known (from browseTrendVideos result) to minimize lookups."
  - ⚠️ `performanceTier` parameter: use enum `["Top 1%", "Top 5%", "Top 20%", "Middle 60%", "Bottom 20%"]`
  - ⚠️ `sort` parameter: use enum `["date", "views", "delta24h", "delta7d", "delta30d"]`

- [x] **T2.6** — Frontend: ToolCallSummary + toolCallGrouping
  - `src/features/Chat/utils/toolCallGrouping.ts`:
    - `extractVideoIdsForTool()` switch: add 3 new cases. ⚠️ Layer 4 tools extract IDs from `result.videos[].videoId` (not `args.videoIds` like Layer 1-2)
    - `isExpandable()`: add cases for 3 new tools
    - `getGroupLabel()`: add display labels for 3 new tools
  - `src/features/Chat/components/ToolCallSummary.tsx`: add summary rendering for `listTrendChannels`, `browseTrendVideos`, `getNicheSnapshot`
  - ⚠️ Without this, new tools execute on backend but chat UI won't display results properly

- [x] **T2.7** — Tests
  - Create: `functions/src/services/tools/handlers/__tests__/listTrendChannels.test.ts`
    - Mock Firestore (trend channels + videos subcollections)
    - Cases: multiple channels, empty channels, channel with 0 videos
  - Create: `functions/src/services/tools/handlers/__tests__/browseTrendVideos.test.ts`
    - Mock Firestore + `getViewDeltas`
    - Cases: filter by channel, filter by date range, filter by tier, sort by views, sort by delta (with null fallback), limit, hidden videos filtered, empty result, dataFreshness present
  - Create: `functions/src/services/tools/handlers/__tests__/getNicheSnapshot.test.ts`
    - Mock Firestore + `resolveVideosByIds` + `getViewDeltas`
    - Cases: by date (primary path, zero resolution reads), by videoId with channelId (1 read), by videoId without channelId (trend channels scan → found), by videoId (not in trends → fallback to resolveVideosByIds → own video found), by videoId (not found anywhere → error), window calculation, common tags counting, empty window, dataFreshness present, DEFAULT_WINDOW_DAYS used when windowDays not specified

### Verification

```bash
npm run test:run                       # all frontend tests pass
npx vitest run --project functions     # all backend tests pass (incl. new)
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 2 → DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 2

**Prompt:** "Review the 3 new tool handlers for competitive-intelligence Этап 1. Check:
- Do all handlers follow the existing pattern? (signature, error handling, no throws)
- Does `listTrendChannels` read ONLY channel docs (10 reads), not video subcollections (8000 reads)?
- Does `functions/src/services/sync.ts` `updateChannelStats()` (line ~131) save `performanceDistribution` and `videoCount` on channel doc?
- Does `browseTrendVideos` correctly compute per-channel percentiles (not cross-channel)?
- Does `browseTrendVideos` include `performanceTier` in each video object in response?
- Does `browseTrendVideos` handle delta sort fallback (all nulls → viewCount + `_note`)?
- Does `getNicheSnapshot` use `date` as primary input (zero extra reads)? Is videoId resolution inverted (trend channels first → own videos fallback)? Does optional `channelId` reduce lookup to 1 read?
- Are `channelIdHints` passed to `getViewDeltas()` in both `browseTrendVideos` and `getNicheSnapshot`?
- Are hidden videos filtered in all 3 handlers? (read ALL hiddenVideos, filter by `hv.channelId`)
- Is `dataFreshness` present in ALL 3 handlers (not just 2)?
- Is `totalMatched` always present (required, not optional) in `browseTrendVideos`?
- Are tool definitions clear for LLM? (when to call, enum params, dependencies)
- Does `getNicheSnapshot` use `DEFAULT_WINDOW_DAYS` constant (not hardcoded 7)?
- Are frontend `ToolCallSummary` and `toolCallGrouping` updated for 3 new tools?
- Run `npm run test:run && npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 3.

---

## Phase 3: Tool Documentation

**Goal:** Создать docs для каждого нового инструмента в `docs/features/chat/tools/`. Обновить tools README (telescope pattern diagram).

### Tasks

- [x] **T3.1** — `docs/features/chat/tools/list-trend-channels.md`
  - What it does, when LLM should call it, input/output schema, example response
  - Follow pattern of existing tool docs (e.g., `analyze-suggested-traffic-tool.md`)

- [x] **T3.2** — `docs/features/chat/tools/browse-trend-videos.md`
  - Filters, sorting, limit, totalMatched, dataFreshness
  - Delta sort fallback behavior
  - Token budget note (50 videos ≈ 6K tokens)

- [x] **T3.3** — `docs/features/chat/tools/get-niche-snapshot.md`
  - videoId vs date input, window calculation
  - aggregates section: data + computation (not interpretation)
  - dataFreshness

- [x] **T3.4** — Update `docs/features/chat/tools/README.md`
  - Add Layer 4: Competition to telescope pattern diagram
  - Add 3 new tools to tool index table

- [x] **T3.5** — Update `docs/features/chat/competitive-intelligence.md`
  - Move `← YOU ARE HERE` marker
  - Update "Текущее состояние"
  - Mark Этап 1 checklist items as done

### Verification

```bash
npm run check    # doc link checker validates new files
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 3 → DONE

### Review Gate 3

**Prompt:** "Review the tool documentation for competitive-intelligence Этап 1. Check:
- Do all 3 tool docs follow the pattern of existing docs in `docs/features/chat/tools/`?
- Is the telescope pattern diagram updated with Layer 4?
- Are example responses consistent with actual handler output format?
- Does the competitive-intelligence.md feature doc reflect current state?
- Run `npm run check` to verify doc links."

Fix all findings before FINAL.

---

## FINAL: Double Review-Fix Cycle

### R1: Architecture Review

**Prompt:** "Architecture review of competitive-intelligence Этап 1. Check ALL of the following:
1. Does `shared/percentiles.ts` have zero dependencies? (no imports from `src/` or `functions/`)
2. Is `PERCENTILE_GROUPS` imported from `shared/` everywhere? (grep for old import paths)
3. Do all 3 handlers use the same `ToolContext` pattern as existing handlers?
4. Is Firestore access efficient? (listTrendChannels = 10 reads via cached distribution, channelIdHints for getViewDeltas)
5. Are hidden videos filtered consistently across all handlers? (read ALL hiddenVideos, filter by channelId)
6. Does `browseTrendVideos` correctly implement per-channel percentile (not global)?
7. Is `dataFreshness` present in ALL 3 handlers and derived from real `lastUpdated` field?
8. Is `totalMatched` in `browseTrendVideos` computed BEFORE limit is applied?
9. Does `getNicheSnapshot` handle `date` (primary, zero reads) and `videoId` (fallback, inverted: trend channels first) correctly? Does `channelId` optimize to 1 read?
10. Does `getNicheSnapshot` use `DEFAULT_WINDOW_DAYS` constant?
11. Are frontend `ToolCallSummary` and `toolCallGrouping` consistent with handler response shapes?
Run `npm run test:run && npx vitest run --project functions && npm run check`."

Fix all findings → re-run verification.

### R2: Production Readiness Review

**Prompt:** "Production readiness review of competitive-intelligence Этап 1. Check ALL:
1. Error handling: do all handlers return `{ error }` instead of throwing?
2. Edge cases: empty trend channels, channel with 0 videos, video not found (both sources), all deltas null, competitor videoId in getNicheSnapshot
3. Performance: is `listTrendChannels` reading only 10 channel docs (not 8000 video docs)? Is `performanceDistribution` cached at sync time? Are channelIdHints passed to getViewDeltas?
4. Tool descriptions: will the LLM understand when to call each tool? Are enum values correct?
5. No hardcoded values — limit defaults (50/200), window days (DEFAULT_WINDOW_DAYS), all derived from constants?
6. Security: does Firestore path always use `ctx.userId` + `ctx.channelId`? (no cross-user data leaks)
7. Frontend: do ToolCallSummary and toolCallGrouping render all 3 new tools correctly?
8. Backlog: any TODOs left in code? Any known limitations that should be documented?
Run all tests one final time."

Fix all findings → re-run verification.

### Final Verification

```bash
npm run test:run                       # frontend
npx vitest run --project functions     # backend
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file:**
- [x] Mark all phases DONE in Status table
- [x] Record final test count: 1154 (718 frontend + 436 backend)
- [x] Update `docs/features/chat/competitive-intelligence.md` — mark Этап 1 checklist complete

### Final Doc Updates

- [x] `docs/features/chat/competitive-intelligence.md` — current state, checklist, YOU ARE HERE marker
- [x] `docs/features/chat/README.md` — add reference to competitive-intelligence.md in Stage 6
- [x] `docs/features/chat/tools/README.md` — Layer 4 in telescope diagram
