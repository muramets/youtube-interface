# Video View Deltas — Refactoring Tasks

## Overview

Refactoring the view delta system (24h/7d/30d) from a client-only monolith to a shared-algorithm architecture with caching and server-side tool integration.

**Feature doc:** `docs/features/video-view-deltas.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

If you lost context — read these files in order:
1. This file (status + phase checklist)
2. `docs/features/video-view-deltas.md` (architecture, decisions, data flow)
3. `shared/viewDeltas.ts` (shared algorithm — SSOT for `calculateViewDeltas`, `VideoDeltaStats`, `DELTA_SNAPSHOT_DAYS`)
4. The specific files for the current phase (listed in phase section below)

### Key decisions (carry forward)
- `shared/viewDeltas.ts` = pure algorithm, zero imports from `src/` or `functions/`, used by both
- `computeVideoDeltas.ts` = I/O wrapper, calls `calculateViewDeltas` **per-channel** (not merged), then merges results ("first channel with data wins")
- `ViewSnapshot` (shared) is a structural subset of `TrendSnapshot` (src) — TypeScript structural typing, no import needed
- `src/core/types/videoDeltaStats.ts` was DELETED — all consumers import from `shared/viewDeltas`
- Total tests at end of Phase 2: 481 (31 files)

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents used for:
- **Review Gates** — read-only checks after each phase (fresh eyes)
- **Parallel tasks** — independent work within a phase

### Phase 3 parallelization plan
```
T3.1 (create useTrendSnapshots hook) — SEQUENTIAL FIRST (foundation)
T3.2 + T3.3 + T3.4 — PARALLEL subagents (refactor 3 consumers to use cached hook)
T3.5 (channelIdHints in enrichContextWithDeltas) — INDEPENDENT, parallel with T3.2-T3.4
T3.6 (tests) — SEQUENTIAL LAST
→ Review Gate 3: subagent
```

### Phase 4 parallelization plan
```
T4.1 (persist channelId in writers) + T4.1b (backfill script) — PARALLEL subagents
T4.2 (server-side trendSnapshotService) — SEQUENTIAL (depends on shared algorithm)
T4.3 + T4.4 (enrich handlers) — PARALLEL subagents (both depend on T4.2)
T4.5 (tool descriptions) — after T4.3+T4.4
T4.6 (tests) — SEQUENTIAL LAST
→ Review Gate 4: subagent
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
| 1 | Safety net tests for existing logic | DONE |
| 2 | Shared algorithm extraction + deduplication | DONE |
| 3 | Caching (TanStack Query in-memory) | DONE |
| 4 | Server-side tool integration | DONE |
| FINAL | Double review-fix cycle (R1: Architecture, R2: Production Readiness) | DONE |

## Current Test Count

- Frontend: 65 tests (Phase 1: 19 + 9 + 12, Phase 2: +13 shared, Phase 3: +7 caching, FINAL: +2 useTrendSnapshots + +1 computeVideoDeltas + +2 implicit)
- Backend: 356 tests (24 files) — includes +15 Phase 4 (trendSnapshotService: 9, getMultipleVideoDetails.viewDeltas: 5, existing: 1) + 3 FINAL (analyzeSuggestedTraffic.viewDeltas)
- **Total: 865 tests (35 files frontend + 24 files backend)**

---

## Phase 1: Safety Net Tests

**Goal:** Cover existing delta computation logic with tests BEFORE any refactoring. This is the regression safety net — if any test breaks during Phases 2-4, we know exactly what we broke.

### Tasks

- [x] **T1.1** — Test `computeVideoDeltas()` in `src/core/utils/computeVideoDeltas.ts`
  - Create: `src/core/utils/__tests__/computeVideoDeltas.test.ts`
  - Mock `TrendService.getTrendSnapshots` (this function has I/O inside, we mock it)
  - Cases:
    - Single channel, 3 snapshots (24h, 7d, 30d) → correct deltas
    - Video missing from old snapshot → `null` delta (appeared after snapshot)
    - Video missing from latest snapshot → excluded from result
    - No snapshots at all → empty Map
    - Multiple channels, some overlap in videoIds → first channel wins
    - `channelIdHints` filters to subset of channels
    - Invalid video IDs (non-11-char) → filtered out
    - Zero growth → `delta = 0`, not `null`
    - Negative growth (viewCount decreased) → negative delta
    - Error in one channel → other channels still computed (graceful)

- [x] **T1.2** — Test `enrichContextWithDeltas()` in `src/core/ai/pipeline/enrichContextWithDeltas.ts`
  - Create: `src/core/ai/pipeline/__tests__/enrichContextWithDeltas.test.ts`
  - Mock `computeVideoDeltas`, `useTrendStore.getState()`, `useChannelStore.getState()`
  - Cases:
    - No video-card items → returns items unchanged
    - Video-card items with matching deltas → patched with delta24h/7d/30d
    - Video-card items without matching deltas → returned without delta fields
    - No trend channels → returns items unchanged (graceful)
    - No currentChannel → returns items unchanged (graceful)
    - Mixed item types (video-card + canvas + traffic) → only video-card patched
    - `computeVideoDeltas` throws → returns original items (graceful fallback)

- [x] **T1.3** — Test delta aggregation in `usePlaylistDeltaStats` hook
  - Create: `src/features/Playlists/hooks/__tests__/usePlaylistDeltaStats.test.ts`
  - Test the **aggregation logic** specifically (totals computation)
  - Cases:
    - All videos have deltas → correct sum totals
    - Some videos have null deltas → sum only non-null, count correctly
    - All videos null → totals = null (not 0)
    - Empty playlist → empty result
    - `videosWithData` count matches perVideo.size

### Verification

```bash
npm run test:run       # all tests pass
npm run lint           # no new warnings
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 1 → DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 1

After completing Phase 1, spawn a review agent:

**Prompt:** "Review the tests created in Phase 1 of video-view-deltas refactoring. Check:
- Are all edge cases covered for `computeVideoDeltas`? (null snapshots, zero growth, negative growth, multi-channel, channelIdHints filtering, invalid videoIds)
- Are all graceful degradation paths tested for `enrichContextWithDeltas`? (no channels, no currentChannel, thrown error, mixed item types)
- Does aggregation logic in `usePlaylistDeltaStats` handle null-vs-zero correctly? (null total when ALL are null, not when SOME are null)
- Do test mocks accurately reflect the real function signatures and Firestore data shapes?
- Run `npm run test:run` and `npm run lint` to confirm green."

Fix all review findings before moving to Phase 2.

---

## Phase 2: Shared Algorithm Extraction

**Goal:** Extract the pure delta calculation algorithm into `shared/`, eliminate code duplication between `computeVideoDeltas`, `useTrendTableData`, and `useTrendChannelTableData`. Zero behavior change — all Phase 1 tests must still pass.

**CRITICAL CONTEXT:**

Three files currently contain inline delta computation logic:
1. `src/core/utils/computeVideoDeltas.ts` — uses `latestSnapshot.videoViews[videoId]` as currentViews
2. `src/pages/Trends/hooks/useTrendTableData.ts` — uses `video.viewCount` as currentViews (inconsistency!)
3. `src/pages/Trends/hooks/useTrendChannelTableData.ts` — uses `video.viewCount` as currentViews + aggregates per channel (inconsistency!)

After refactoring, ALL consumers use snapshot-based `currentViews`. This eliminates a class of data consistency bugs where `video.viewCount` (from API sync) and snapshot `videoViews` (from trend sync) can differ.

### Tasks

- [x] **T2.1** — Create shared pure algorithm
  - Create: `shared/viewDeltas.ts`
  - Export: `calculateViewDeltas(snapshots, videoIds, now)` → `Map<videoId, VideoDeltaStats>`
  - All consumers use snapshot-based currentViews (no `currentViewOverrides` parameter)
  - The algorithm reads currentViews from the latest snapshot's `videoViews[videoId]`
  - 0 I/O, 0 dependencies, 0 framework imports
  - Move `VideoDeltaStats` interface to `shared/viewDeltas.ts`
  - Export constant `DELTA_SNAPSHOT_DAYS = 35` (30d + 5d buffer) — single source of truth for all snapshot fetch limits

- [x] **T2.2** — Test shared algorithm
  - Create: `shared/__tests__/viewDeltas.test.ts`
  - Port relevant test cases from T1.1 (they test the same logic, but now directly on pure function)
  - Additional cases:
    - `now` parameter respected (not `Date.now()`)
    - Snapshots not sorted → still works (algorithm sorts internally)
    - `currentViews` comes from latest snapshot, not from external source
    - Empty `videoIds` array → empty Map

- [x] **T2.3** — Refactor `computeVideoDeltas()`
  - File: `src/core/utils/computeVideoDeltas.ts`
  - Keep I/O (TrendService calls), delegate math to `calculateViewDeltas()` from shared
  - Remove inline `findSnapshot` logic — replaced by shared
  - Use `DELTA_SNAPSHOT_DAYS` from shared instead of hardcoded `32`
  - Import `VideoDeltaStats` from `shared/viewDeltas` (remove from `src/core/types/videoDeltaStats.ts`)
  - Update ALL imports across codebase. Full list (10 files):
    - `src/core/hooks/useVideoDeltaMap.ts` — from `core/types/videoDeltaStats`
    - `src/core/utils/computeVideoDeltas.ts` — from `core/types/videoDeltaStats`
    - `src/features/Video/components/VideoPreviewTooltip.tsx` — from `core/types/videoDeltaStats`
    - `src/pages/Details/tabs/Traffic/components/TrafficTable.tsx` — from `core/types/videoDeltaStats`
    - `src/pages/Details/tabs/Traffic/components/TrafficRow.tsx` — from `core/types/videoDeltaStats`
    - `src/features/Playlists/hooks/usePlaylistDeltaStats.ts` — from `core/types/videoDeltaStats` (remove re-export)
    - `src/features/Video/SortableVideoCard.tsx` — from `Playlists/hooks/usePlaylistDeltaStats`
    - `src/features/Video/VideoGrid.tsx` — from `Playlists/hooks/usePlaylistDeltaStats`
    - `src/features/Video/VirtualVideoGrid.tsx` — from `Playlists/hooks/usePlaylistDeltaStats`
    - `src/features/Video/VideoCard.tsx` — from `Playlists/hooks/usePlaylistDeltaStats`
  - Delete `src/core/types/videoDeltaStats.ts` after migration

- [x] **T2.4** — Refactor `useTrendTableData()`
  - File: `src/pages/Trends/hooks/useTrendTableData.ts`
  - Keep I/O (TrendService calls), delegate delta math to `calculateViewDeltas()` from shared
  - Switch delta calculation from `video.viewCount` to snapshot-based `currentViews` (consistency fix)
  - Use `DELTA_SNAPSHOT_DAYS` from shared instead of hardcoded `60`
  - Remove inline `findSnapshot` + `getDelta` logic
  - ⚠️ **Intentional split**: the "Views" table column (`row.video.viewCount`) still comes from TrendVideo doc (latest API sync). Delta comes from snapshots. Both are written during the same sync, so drift is <1%. Do NOT change the Views column to snapshot-based — it would make viewCount ~24h stale. This is a documented, accepted trade-off.

- [x] **T2.5** — Refactor `useTrendChannelTableData()`
  - File: `src/pages/Trends/hooks/useTrendChannelTableData.ts`
  - Keep I/O (TrendService calls), delegate delta math to `calculateViewDeltas()` from shared
  - Switch delta calculation from `video.viewCount` to snapshot-based `currentViews` (consistency fix)
  - Use `DELTA_SNAPSHOT_DAYS` from shared instead of hardcoded `60`
  - Remove inline `findSnapshot` (line 124) + `calcDelta` (lines 143-148)
  - Note: this hook aggregates per-channel (sums all video deltas) — the aggregation logic stays in the hook, only the per-video delta computation moves to shared
  - ⚠️ Same **intentional split** as T2.4: `totalViews` column uses `video.viewCount` (API-synced), deltas use snapshots. Do not unify — accepted trade-off.

- [x] **T2.6** — Verify zero regression
  - All Phase 1 tests pass unchanged
  - All Phase 2 tests pass
  - `npm run lint` clean
  - `npm run typecheck` clean (new shared imports)
  - Grep for `findSnapshot` — should only exist in `shared/viewDeltas.ts`

### Verification

```bash
npm run test:run       # all tests pass (Phase 1 + Phase 2)
npm run lint           # clean
npm run typecheck      # clean (new imports from shared/)
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 2 → DONE
- [x] Record test count

### Review Gate 2

After completing Phase 2, spawn a review agent:

**Prompt:** "Review Phase 2 of video-view-deltas refactoring (shared algorithm extraction). Check:
- Is `shared/viewDeltas.ts` truly pure? No imports from `src/`, `functions/`, Firebase, React. Only standard TS.
- Is `VideoDeltaStats` type correctly moved to `shared/` and all imports updated? Grep for old import path `core/types/videoDeltaStats` — should return 0 results.
- Does `computeVideoDeltas()` correctly delegate to shared without behavior change?
- Does `useTrendTableData()` correctly delegate to shared and use snapshot-based currentViews?
- Does `useTrendChannelTableData()` correctly delegate to shared? Grep for `findSnapshot` — should only exist in `shared/viewDeltas.ts`.
- Is `DELTA_SNAPSHOT_DAYS` used everywhere instead of hardcoded values? Grep for `getTrendSnapshots` calls — all should use the constant.
- Are there any remaining inline delta calculations that should use shared?
- Run `npm run test:run`, `npm run lint`, `npm run typecheck` to confirm green.
- Run `npm run check:docs` to verify no broken doc references."

Fix all review findings before moving to Phase 3.

---

## Phase 3: In-Memory Caching

**Goal:** Eliminate redundant Firestore reads by caching snapshots in TanStack Query (in-memory). Cache invalidation is deterministic: triggered by `TrendChannel.lastUpdated` change (= new sync happened).

**CRITICAL CONTEXT:**

Snapshots are immutable — once written, they never change. New snapshots are added ~once per day during sync. This makes them ideal for aggressive caching. The `TrendChannel.lastUpdated` field tells us the exact moment new data arrived.

IndexedDB persistence is intentionally deferred — in-memory cache with `gcTime: 30min` is sufficient for the current single-user stage. IndexedDB can be added later when there are real users and measured performance needs.

### Tasks

- [x] **T3.1** — Create `useTrendSnapshots()` hook
  - Create: `src/core/hooks/useTrendSnapshots.ts`
  - **Two-layer design:**
    - Internal: `useSingleTrendSnapshots(userId, channelId, trendChannelId)` — one TanStack Query per trend channel
      - Query key: `['trendSnapshots', userId, channelId, trendChannelId]`
      - `staleTime`: derived from `TrendChannel.lastUpdated` — data is "fresh" until `lastUpdated` changes
      - `gcTime: 30 * 60 * 1000` (30 min) — reasonable memory footprint without persistence layer
      - Uses `DELTA_SNAPSHOT_DAYS` from `shared/viewDeltas` as fetch limit
    - Public: `useTrendSnapshots(channelIds)` — calls N internal hooks, TanStack deduplicates identical queries automatically
      - Returns `Map<trendChannelId, TrendSnapshot[]>`
  - This split keeps per-channel caching granular while providing a convenient multi-channel API to consumers

- [x] **T3.2** — Refactor `useVideoDeltaMap()` to use cached snapshots
  - File: `src/core/hooks/useVideoDeltaMap.ts`
  - Replace direct `computeVideoDeltas()` call (which does its own Firestore reads) with:
    1. `useTrendSnapshots(channelIds)` → cached snapshots
    2. `calculateViewDeltas(snapshots, videoIds, now)` → deltas
  - `computeVideoDeltas()` remains as a thin wrapper for non-React contexts (AI middleware)

- [x] **T3.3** — Refactor `useTrendTableData()` to use cached snapshots
  - File: `src/pages/Trends/hooks/useTrendTableData.ts`
  - Replace direct `TrendService.getTrendSnapshots()` call with `useTrendSnapshots()`
  - The hook already delegates delta math to shared (from Phase 2), now also caches I/O

- [x] **T3.4** — Refactor `useTrendChannelTableData()` to use cached snapshots
  - File: `src/pages/Trends/hooks/useTrendChannelTableData.ts`
  - Replace direct `TrendService.getTrendSnapshots()` call with `useTrendSnapshots()`
  - Same pattern as T3.3

- [x] **T3.5** — Add `channelIdHints` to `enrichContextWithDeltas()`
  - File: `src/core/ai/pipeline/enrichContextWithDeltas.ts`
  - Extract `channelId` from `VideoCardContext` items → pass as `channelIdHints`
  - ⚠️ **Non-React context**: this middleware runs from `chatStore.sendMessage`, NOT inside React. It uses `computeVideoDeltas()` (direct Firestore reads), NOT `useTrendSnapshots()` hook. `channelIdHints` here reduce **Firestore reads** (fewer channels scanned), not cache hits.

- [x] **T3.6** — Test caching behavior
  - Create: `src/core/hooks/__tests__/useTrendSnapshots.test.ts`
  - Cases:
    - First call → Firestore read, result cached
    - Second call with same params → no Firestore read (cache hit)
    - `lastUpdated` changes → cache invalidated, new Firestore read
    - Multiple channels requested → parallel fetches, each cached independently
    - `channelIdHints` subset → only relevant channels queried

### Verification

```bash
npm run test:run       # all tests pass (Phase 1 + 2 + 3)
npm run lint           # clean
npm run typecheck      # clean
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 3 → DONE
- [x] Record test count

### Review Gate 3

After completing Phase 3, spawn a review agent:

**Prompt:** "Review Phase 3 of video-view-deltas refactoring (in-memory caching). Check:
- Is cache invalidation deterministic (based on `lastUpdated`, not time-based)?
- Is `gcTime` set to 30 minutes (not `Infinity`)?
- Does `useVideoDeltaMap` correctly consume cached snapshots + shared algorithm?
- Does `useTrendTableData` correctly consume cached snapshots?
- Does `useTrendChannelTableData` correctly consume cached snapshots?
- Is `enrichContextWithDeltas` now passing `channelIdHints` (no more scanning ALL channels)?
- Are there any Firestore reads that bypass the cache (direct `TrendService.getTrendSnapshots` calls remaining in React hooks)?
- Run `npm run test:run`, `npm run lint`, `npm run typecheck` to confirm green."

Fix all review findings before moving to Phase 4.

---

## Phase 4: Server-Side Tool Integration

**Goal:** Give AI chat tools access to view deltas. `getMultipleVideoDetails` returns deltas per video. `analyzeSuggestedTraffic` enriches suggested videos with YouTube-wide view growth data.

**CRITICAL CONTEXT:**

Server-side tools run in Cloud Functions (Node 24, admin SDK). They cannot use React hooks or TanStack Query. They read Firestore directly via admin SDK.

The `shared/viewDeltas.ts` algorithm (from Phase 2) is already framework-agnostic and works in both environments.

Suggested traffic semantics: a "suggested video" in the table is a competitor video that **gives impressions to the user's video** (it's recommended alongside, and viewers come from there). Adding view deltas to these videos tells the LLM whether a video that's driving traffic is itself growing or stagnating on YouTube.

**Prerequisite:** `channelId` must be persisted in `cached_external_videos` (T4.1) before delta lookup can efficiently match videos to trend channels.

### Tasks

- [x] **T4.1** — Persist `channelId` in `cached_external_videos` (all writers)
  - **Root cause:** `YouTubeVideoSnippet` type in `functions/src/types.ts` (line 44) does NOT declare `channelId` even though YouTube API **always returns it**. Without fixing the type, TypeScript rejects `item.snippet.channelId`.
  - **Step 0 (type fix):** `functions/src/types.ts` → add `channelId?: string;` to `YouTubeVideoSnippet` interface
  - **Writer 1:** `functions/src/services/tools/handlers/detail/getMultipleVideoDetails.ts`
    - Add `channelId: item.snippet.channelId` to `cacheData` object (line ~77-88)
  - **Writer 2:** `functions/src/services/tools/handlers/discovery/browseChannelVideos.ts`
    - Add `channelId: item.snippet.channelId` to `youtubeItemToCacheDoc()` (line ~187-199)
  - **Shared:** Add `channelId: data.channelId || undefined` to `formatVideoData()` in `getMultipleVideoDetails.ts`
  - This enables Phase 4 delta lookup: `channelId` → match with `trendChannels` → fetch snapshots

- [x] **T4.1b** — One-time `channelId` backfill script
  - **EXECUTED & DELETED.** Result: 0 updated, 4826 skipped — all documents already had `channelId` from prior `suggestedVideosMigration.ts` (which copied full docs from `videos/` → `cached_external_videos/`).
  - Script removed after successful run (no longer needed).

- [x] **T4.2** — Create server-side trend snapshot service
  - Create: `functions/src/services/trendSnapshotService.ts`
  - Uses admin Firestore SDK to read `users/{uid}/channels/{cid}/trendChannels/{tcid}/snapshots`
  - Function: `getTrendSnapshots(userId, channelId, trendChannelId, limitDays)` → `TrendSnapshot[]`
  - Function: `getViewDeltas(userId, channelId, videoIds, trendChannels)` → `Map<videoId, VideoDeltaStats>`
    - Orchestrates: fetch snapshots per relevant channel → `calculateViewDeltas()` from shared
    - Uses `DELTA_SNAPSHOT_DAYS` from shared
  - Handles errors gracefully (missing channels, empty snapshots → empty map)
  - Note for future scale: when concurrent users grow, add in-memory LRU cache (TTL 5min) on top of Firestore reads. Not needed now.

- [x] **T4.3** — Enrich `getMultipleVideoDetails` handler
  - File: `functions/src/services/tools/handlers/detail/getMultipleVideoDetails.ts`
  - After fetching video details, call `getViewDeltas()` for the returned videoIds
  - Use `channelId` from video data (T4.1) as hint to narrow snapshot queries
  - Add to response per video: `viewDelta24h`, `viewDelta7d`, `viewDelta30d` (null if unavailable)
  - Deltas should be in the formatted string output that LLM reads

- [x] **T4.4** — Enrich `analyzeSuggestedTraffic` handler
  - File: `functions/src/services/tools/handlers/analysis/analyzeSuggestedTraffic.ts`
  - After building `topSources`, call `getViewDeltas()` for all suggested video IDs
  - Add to each `topSource`: `viewDelta24h`, `viewDelta7d`, `viewDelta30d`
  - Update `analysisGuidance` to explain: "viewDelta fields show how fast each suggested video is growing on YouTube overall — a video giving impressions to yours while itself growing rapidly signals strong algorithmic association"
  - ⚠️ **channelId dependency**: delta lookup reads `channelId` from `cached_external_videos`. If a suggested video was never cached by prior `getMultipleVideoDetails` / `browseChannelVideos` calls → `channelId` missing → delta = null. This is an accepted trade-off — do NOT add extra YouTube API fetches to resolve channelId. Natural usage pattern (user asks LLM about videos first) ensures most suggested videos get cached over time.

- [x] **T4.5** — Update tool descriptions
  - File: `functions/src/services/tools/definitions.ts`
  - `getMultipleVideoDetails` description: mention that response includes view growth data (24h/7d/30d) when trend data is available
  - `analyzeSuggestedTraffic` description: mention YouTube-wide view deltas on suggested videos

- [x] **T4.6** — Tests for server-side integration
  - Create: `functions/src/services/__tests__/trendSnapshotService.test.ts`
  - Create: `functions/src/services/tools/handlers/detail/__tests__/getMultipleVideoDetails.viewDeltas.test.ts`
  - Cases for trendSnapshotService:
    - Normal flow → correct deltas
    - No trend channels for user → empty map (graceful)
    - Firestore error → empty map (graceful)
  - Cases for getMultipleVideoDetails:
    - Video with trend data → deltas included in response
    - Video without trend data → null deltas (no error)
    - Mix of own + external videos → deltas for all where available
  - Cases for analyzeSuggestedTraffic:
    - Suggested videos with trend data → viewDelta fields populated
    - Suggested videos without trend data → viewDelta = null

### Verification

```bash
npm run test:run                              # frontend tests pass
npx vitest run --project functions            # backend tests pass
npm run lint                                  # clean
cd functions && npm run build                 # compiles
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 4 → DONE
- [x] Record test count

### Review Gate 4

After completing Phase 4, spawn a review agent:

**Prompt:** "Review Phase 4 of video-view-deltas refactoring (server-side tool integration). Check:
- Is `channelId` added to `YouTubeVideoSnippet` type in `functions/src/types.ts`?
- Do BOTH writers persist `channelId` in `cached_external_videos`? (`getMultipleVideoDetails` + `browseChannelVideos`)
- Was the one-time backfill script (`scripts/backfill-channelId.ts`) created and tested?
- Does `trendSnapshotService.ts` use admin SDK correctly (not frontend Firestore client)?
- Does it import `calculateViewDeltas` from `shared/` (not duplicating the algorithm)?
- Does it use `DELTA_SNAPSHOT_DAYS` from shared (not hardcoded)?
- Is `getMultipleVideoDetails` handler latency acceptable? (parallel snapshot reads, ~0.1s added)
- Does `analyzeSuggestedTraffic` correctly explain viewDelta semantics in `analysisGuidance`?
- Are tool descriptions updated so LLM knows deltas are available?
- Run all test suites: `npm run test:run` + `npx vitest run --project functions`
- Run `npm run lint` + `cd functions && npm run build` to confirm green."

Fix all review findings before moving to FINAL phase.

---

## FINAL: Double Review-Fix Cycle

**Goal:** Two rounds of comprehensive review to catch anything missed in individual phases.

### R1: Architecture Review

Spawn a review agent:

**Prompt:** "Architecture review of the completed video-view-deltas refactoring. Read `docs/features/video-view-deltas.md` for full context. Check:

1. **Shared algorithm purity**: `shared/viewDeltas.ts` has zero imports from `src/`, `functions/`, or any framework. Only TypeScript standard library.
2. **No remaining duplication**: grep for `findSnapshot` — should only exist in `shared/viewDeltas.ts`. No inline delta calculation in `useTrendTableData`, `useTrendChannelTableData`, or `computeVideoDeltas`.
3. **Cache coverage**: every Firestore read of trend snapshots goes through `useTrendSnapshots()` on frontend. No direct `TrendService.getTrendSnapshots()` calls remain in React components/hooks.
4. **Server-side consistency**: `trendSnapshotService.ts` uses the same `calculateViewDeltas()` from shared as frontend.
5. **Type source of truth**: `VideoDeltaStats` is defined once in `shared/viewDeltas.ts`. All imports point there. Old `src/core/types/videoDeltaStats.ts` is deleted.
6. **Constant source of truth**: `DELTA_SNAPSHOT_DAYS` is defined once in `shared/viewDeltas.ts`. All snapshot fetch calls use it.
7. **AI integration completeness**: `enrichContextWithDeltas` passes `channelIdHints`. `getMultipleVideoDetails` returns deltas. `analyzeSuggestedTraffic` returns viewDeltas on suggested videos.
8. **No broken imports**: `npm run typecheck` + `cd functions && npm run build` pass.
9. **All tests green**: `npm run test:run` + `npx vitest run --project functions`."

Fix all R1 findings.

### R2: Production Readiness Review

Spawn a review agent:

**Prompt:** "Production readiness review of video-view-deltas refactoring. Check:

1. **Error handling**: What happens when TanStack Query cache fails? Cache should degrade gracefully (re-fetch from Firestore).
2. **Performance**: For a user with 20 trend channels and 500 videos per channel — does the shared algorithm scale? Any O(n^2) patterns?
3. **Cache invalidation**: Is there a race condition where `lastUpdated` changes WHILE snapshots are being fetched? Does TanStack Query handle this?
4. **Memory footprint**: With `gcTime: 30min` and 20 channels — estimate memory usage. Is 30min reasonable?
5. **Server cold start**: First `getMultipleVideoDetails` call after Cloud Function cold start — is latency acceptable? Are Firestore reads parallelized?
6. **Token budget**: `analyzeSuggestedTraffic` with 20 suggested videos + viewDeltas — total response size still within LLM context limits?
7. **Backwards compatibility**: Old conversation docs with persisted context (without delta fields) — does `buildPersistentContextLayer` handle missing fields?
8. **Snapshot-based currentViews migration**: After switching from `video.viewCount` to snapshot-based in Trends Table — are displayed values still correct? Any visible difference to user?
9. **Test coverage**: Are there any untested code paths? Run coverage report if available.
10. **Docs**: Run `npm run check:docs`. Are all doc references valid? Is `video-view-deltas.md` updated with final architecture?"

Fix all R2 findings.

### Final Verification

```bash
npm run test:run                              # frontend
npx vitest run --project functions            # backend
npm run lint                                  # lint
npm run typecheck                             # types
cd functions && npm run build                 # compile
npm run check:docs                            # docs
```

**MANDATORY: Update this file:**
- [x] Update Phase Status table: FINAL → DONE
- [x] Record final test count
- [x] Update `docs/features/video-view-deltas.md`:
  - Move `← YOU ARE HERE` marker to post-refactoring state
  - Update "Текущее состояние" checklist
  - Update Data Flow diagram to target architecture
  - Update Technical Implementation section (new file paths)
- [x] Update related docs:
  - `docs/features/trends/table-view.md` — reference shared algorithm
  - `docs/features/chat/context-bridges/enrichment-pipeline.md` — updated middleware behavior
  - `docs/features/video-details/suggested-traffic/README.md` — viewDeltas in tool response
  - `docs/features/chat/tools/layer-3-analysis/2-analyze-suggested-traffic-tool.md` — step 5b, return type, backend files
  - `docs/features/chat/tools/layer-2-detail/1-get-multiple-video-details-tool.md` — viewDelta fields in response schema
  - `docs/features/chat/tools/layer-1-discovery/2-browse-channel-videos-tool.md` — channelId persistence for delta lookup
