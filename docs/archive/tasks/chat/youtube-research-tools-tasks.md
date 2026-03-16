# YouTube Research Tools — Engineering Tasks

## Overview

Telescope Pattern: Discovery → Detail → Analysis tools for AI assistant to independently research YouTube.

**Architecture doc:** `docs/features/chat/tools/README.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

If you lost context — read these files in order:
1. This file (status + phase checklist)
2. `docs/features/chat/tools/README.md` (architecture + user flows)
3. The specific handler/test file for the current phase

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 0 | Safety net tests | ✅ DONE |
| 1 | Foundation (services + handlers) | ✅ DONE |
| 2 | Integration (definitions + executor + extensions) | ✅ DONE |
| 3 | Cleanup & Hardening (deprecate middleware, SRP split, trend caching) | ✅ DONE |
| FINAL | Double review-fix cycle | ✅ DONE |

---

## Phase 0: Safety Net Tests

**Goal:** Cover existing pure math functions with tests BEFORE building new code that depends on the same logic.

### Tasks

- [x] **T0.1** — Test `calculateDelta()` in `src/core/utils/trafficSource/delta.ts`
  - Create: `src/core/utils/trafficSource/__tests__/delta.test.ts`
  - Cases:
    - Matching sources → correct deltaViews/deltaImpressions
    - New source in current snapshot → delta values = undefined (new source, no baseline)
    - Missing source in current → excluded from result
    - Empty inputs → empty result
  - Reference implementation: read `delta.ts` to understand the interface

- [x] **T0.2** — Test `formatTrafficSourcesCompact()` in `src/core/ai/utils/formatTrafficSources.ts`
  - Create: `src/core/ai/utils/__tests__/formatTrafficSources.test.ts`
  - Cases:
    - Single snapshot → baseline only, no Δ lines
    - Multiple snapshots → baseline + Δ lines with correct signs
    - Sources sorted by views desc, capped at top 5
    - Empty input → empty string
    - Zero-delta sources → "(no changes)"
  - Reference: read `formatTrafficSources.ts` for internal helpers (shortenSource, formatCompact)

### Verification

```bash
npm run test:run       # frontend tests pass
npm run lint           # no new warnings
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above (T0.1, T0.2)
- [ ] Update Phase Status table: Phase 0 → ✅ DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 0

After completing T0.1 + T0.2, run an elite senior dev review:
- [x] Are edge cases covered? — prev=0 (Infinity guard), both=0, negative deltas, FP rounding, new/missing sources, empty inputs, zero-delta "(no changes)", label vs autoLabel, >5 cap, K/M formatting
- [x] Do tests match the actual function signatures and return types? — TrafficSourceMetric, TrafficSourceDeltaMetric, SnapshotWithMetrics all match
- [x] Are there any untested branches? — All branches in calculateDelta, calculateTotalDelta, pctChange, formatMetricsLine, formatDeltaLine, shortenSource, formatCompact, formatDeltaValue covered

---

## Phase 1: Foundation

**Goal:** Build backend infrastructure — YouTube service extensions, ToolContext, CSV parser port, and two new handlers with tests.

**CRITICAL CONTEXT:**

Two different CSV types exist in the system:

| | Traffic Sources (this tool) | Suggested Traffic (existing) |
|---|---|---|
| Firestore doc | `trafficSource/main` | `traffic/main` |
| Storage path | `.../trafficSource/ts_*.csv` | `.../traffic/snap_*.csv` |
| CSV format | 6 cols, rows = source names | 8 cols, rows = videoIds |
| Parser | `parseTrafficSourceCsv()` | `parseSuggestedTrafficCsv()` |
| Types | `TrafficSourceMetric` | `SuggestedVideoRow` |

**NEVER confuse these. `analyzeTrafficSources` uses `trafficSource/main`, NOT `traffic/main`.**

### Tasks

- [x] **T1.1** — `YouTubeService.getChannelInfo()` + `resolveChannelId()`
  - File: `functions/src/services/youtube.ts`
  - `getChannelInfo(channelId)`: `channels.list(part=snippet,statistics,contentDetails)` → `{ title, subscriberCount, videoCount, uploadsPlaylistId }`
  - `resolveChannelId(input)`: parse URL/handle/raw ID → channelId
    - Reference: `src/core/services/trendService.ts` lines 427-527 (`addTrendChannel`) — same URL parsing logic, port to backend
    - `youtube.com/channel/UCxxx` → extract from URL (0 units)
    - `youtube.com/@handle`, `@handle` → `channels.list(forHandle=...)` (1 unit)
  - Write tests: `functions/src/services/__tests__/youtube.test.ts` (or extend if exists)

- [x] **T1.2** — ToolContext extension
  - File: `functions/src/services/tools/types.ts`
  - Add `youtubeApiKey?: string` to `ToolContext`
  - Find where `toolContext` is created (search: `toolContext =` in `functions/src/`) and inject YouTube API key from Firestore user settings
  - Firestore path for API key: `users/{uid}/settings/general` → `apiKey` field

- [x] **T1.3** — Port `parseTrafficSourceCsv` to backend
  - Create: `functions/src/services/tools/utils/trafficSourceCsvParser.ts`
  - Port from: `src/core/utils/trafficSource/parser.ts`
  - Key change: input = `string` (not `File`), no `FileReader` (browser API)
  - Follow pattern of existing `functions/src/services/tools/utils/csvParser.ts` (suggested traffic parser)
  - Output type: `TrafficSourceMetric` — define in same file or shared types
  - Write tests: `functions/src/services/tools/utils/__tests__/trafficSourceCsvParser.test.ts`

- [x] **T1.4** — `analyzeTrafficSources` handler
  - Create: `functions/src/services/tools/handlers/analysis/analyzeTrafficSources.ts`
  - Parameters: `{ videoId: string }`
  - Firestore path: `users/{uid}/channels/{channelId}/videos/{videoId}/trafficSource/main` (NOT traffic/main!)
  - Pipeline:
    1. Read snapshot metadata from Firestore
    2. Download CSVs from Cloud Storage (admin SDK `bucket.file().download()`)
    3. Parse with ported `parseTrafficSourceCsv`
    4. Build per-source timeline with pre-computed deltas
  - Response: `{ sourceVideo, snapshotTimeline, sources[].timeline[], totalTimeline }`
  - NO `analysisGuidance` — data is compact enough
  - Copy CSV download pattern from `analyzeSuggestedTraffic.ts` lines 115-130
  - Write tests: `functions/src/services/tools/handlers/analysis/__tests__/analyzeTrafficSources.test.ts`
    - Mock: Firestore + Cloud Storage (same pattern as `viewThumbnails.handler.test.ts`)
    - Cases: missing videoId, no traffic data, correct deltas, single snapshot (deltas=null), broken CSV, sources sorted by views, totalTimeline aggregation

- [x] **T1.5** — `browseChannelVideos` handler
  - Create: `functions/src/services/tools/handlers/discovery/browseChannelVideos.ts`
  - Parameters: `{ channelId: string, publishedAfter?: string, confirmed?: boolean }`
  - Two-phase execution:
    - Phase 1 (no confirmed): `resolveChannelId` → `getChannelInfo` → return QUOTA_GATE with `_systemNote: "QUOTA_GATE: N videos, up to ~X units (less if some already cached). Ask user."`
    - Phase 2 (confirmed=true): `playlistItems.list` → split cached/missing → `videos.list` for missing → cache in `cached_external_videos/` → return compact list
  - Smart caching: check `videos/` + `cached_external_videos/` + trend channel subcollections
  - Own channel: always YouTube API → show `{ inApp, onYouTube, missing }` delta
  - `publishedAfter` early stop during pagination
  - Needs `ctx.youtubeApiKey` from T1.2
  - Write tests: `functions/src/services/tools/handlers/discovery/__tests__/browseChannelVideos.test.ts`

### Verification

```bash
npx vitest run --project functions   # all backend tests pass
npm run lint
npm run typecheck                     # new files
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above (T1.1–T1.5)
- [x] Update Phase Status table: Phase 1 → ✅ DONE
- [x] Record test count in "Current Test Count" section
- [x] Note any deviations from plan in Key Decisions Log

### Review Gate 1

Elite senior dev review:
- Correct Firestore paths used? Especially `trafficSource/main` not `traffic/main`
- CSV parser handles edge cases (missing headers, empty rows, Total row)?
- Two-phase quota gate works correctly?
- Smart caching actually checks all three sources?
- Error handling for missing YouTube API key?
- Test coverage adequate?

---

## Phase 2: Integration

**Goal:** Wire handlers into tool system, write LLM-facing descriptions, extend getVideoDetails, add security rules.

### Tasks

- [x] **T2.1** — Tool definitions + descriptions
  - File: `functions/src/services/tools/definitions.ts`
  - Added `BROWSE_CHANNEL_VIDEOS`, `ANALYZE_TRAFFIC_SOURCES` to `TOOL_NAMES`
  - Wrote LLM-facing descriptions with quota gate protocol, gateway role, and tool boundaries

- [x] **T2.2** — Executor registration
  - File: `functions/src/services/tools/executor.ts`
  - Imported and registered both handlers in `HANDLERS` map

- [x] **T2.3** — `getMultipleVideoDetails` extension
  - File: `functions/src/services/tools/handlers/detail/getMultipleVideoDetails.ts`
  - 3-level cascade: `videos/` → `cached_external_videos/` → YouTube API (after cache consolidation)
  - YouTube results cached in `cached_external_videos/` with `source: "api_fallback"`
  - `quotaUsed` in response (no underscore prefix)
  - 8 new tests: cascade priority, external cache, YouTube fallback, caching, partial resolve, graceful failure

- [x] **T2.4** — Frontend quota display (SIMPLIFIED from SSE metadata)
  - Deviation: `quotaUsed` stays in result (no `_` prefix → survives `stripInternalHints`)
  - No SSE event type changes needed — `quotaUsed` flows naturally to UI
  - Updated `toolCallGrouping.ts`: labels + expandable views for `browseChannelVideos` and `analyzeTrafficSources`
  - Updated `ToolCallSummary.tsx`: `TrafficSourceStats`, `BrowseChannelStats`, `QuotaBadge` components
  - New icons: Globe (browse), PieChart (traffic sources), Satellite (quota)

- [x] **T2.5** — Firestore security rules (NO-OP)
  - Existing wildcard `match /users/{userId}/{document=**}` already covers `cached_external_videos/`
  - Admin SDK writes bypass rules; client reads covered by wildcard

### Verification

```bash
npx vitest run --project functions   # backend
npm run test:run                      # frontend (if SSE/UI changes)
npm run lint
npm run typecheck
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above (T2.1–T2.5)
- [x] Update Phase Status table: Phase 2 → ✅ DONE
- [x] Record test count in "Current Test Count" section
- [x] Note any deviations from plan in Key Decisions Log

### Review Gate 2

Elite senior dev review:
- [x] Tool descriptions will correctly guide LLM behavior? — Yes: quota gate protocol explicit, gateway role clear, tool boundaries defined
- [x] getMultipleVideoDetails search order is correct (priority: own videos first)? — Yes: videos/ → cached_external/ → YouTube API (after cache consolidation)
- [x] YouTube fallback doesn't break when API key is missing? — Yes: `if (notFoundIds.length > 0 && ctx.youtubeApiKey)` guard, graceful fallback to notFound
- [x] SSE metadata doesn't leak into LLM context? — N/A: simplified approach, `quotaUsed` intentionally visible to both LLM and UI
- [x] Security rules match existing collection patterns? — Yes: wildcard rule covers all subcollections

---

## Phase 3: Cleanup & Hardening

**Goal:** Deprecate frontend middleware, fix SRP violation, add trend caching, clean up decisions log, update docs.

**Resolved:** `cached_suggested_traffic_videos/` fully consolidated into `cached_external_videos/`. See `docs/features/cache-consolidation-plan.md`.

### Tasks

- [x] **T3.1** — Deprecate `enrichContextWithTrafficSources`
  - **DONE.** File deleted (not just deprecated — dead code removed entirely).
  - Removed: `enrichContextWithTrafficSources.ts`, `PendingSend` interface, `EnrichmentWarning` interface, `enrichmentWarning` state, `retryEnrichment`/`dismissEnrichment` actions, enrichment warning banner UI
  - Removed `includeTrafficSources` and `trafficSourcesSummary` from `VideoCardContext` type
  - Removed `includeTrafficSources: true` auto-set from `videoAdapters.ts`
  - 📊 icon on VideoCardChip → read-only indicator for `own-published` videos
  - `prepareContext.ts` simplified: no more `failedTrafficVideos` in return type
  - `persistentContextLayer.ts`: removed `trafficSourcesSummary` rendering
  - `debugSendLog.ts`: removed traffic sources log line
  - **Files changed:** 10 files (7 edited, 1 deleted, 1 test updated)
  - **Tests:** 387 passed (all green), typecheck clean, lint clean

- [x] **T3.2** — SRP split: `browseChannelVideos` → `getChannelOverview` + `browseChannelVideos`
  - Pull from backlog (`docs/backlog.md` — "browseChannelVideos: split two-phase tool")
  - **New tool `getChannelOverview`:**
    - Parameters: `{ channelId: string }` (URL, handle, or raw ID)
    - Calls `resolveChannelId` → `getChannelInfo`
    - Returns: `{ channelTitle, subscriberCount, videoCount, uploadsPlaylistId, quotaEstimate }`
    - Always safe, 1 API unit
    - `_systemNote: "QUOTA_GATE: N videos, ~X units. Ask user before calling browseChannelVideos."`
  - **Refactored `browseChannelVideos`:**
    - Parameters: `{ uploadsPlaylistId: string, publishedAfter?: string }` — NO `confirmed`, NO `channelId`
    - `uploadsPlaylistId` is required — structural dependency on `getChannelOverview` by design
    - Only does video fetching + caching (single responsibility)
  - **Files to change:**
    - `functions/src/services/tools/handlers/discovery/browseChannelVideos.ts` — refactor, extract Phase 1
    - `functions/src/services/tools/handlers/discovery/getChannelOverview.ts` — new handler
    - `functions/src/services/tools/definitions.ts` — new tool definition + update existing
    - `functions/src/services/tools/executor.ts` — register new handler
    - `functions/src/services/tools/handlers/discovery/__tests__/browseChannelVideos.test.ts` — update tests
    - `functions/src/services/tools/handlers/discovery/__tests__/getChannelOverview.test.ts` — new tests
    - `src/features/Chat/utils/toolCallGrouping.ts` — new tool label
    - `src/features/Chat/components/ToolCallSummary.tsx` — new tool pill (reuse `BrowseChannelStats`)
  - After completion: mark backlog item as done in `docs/backlog.md`

- [x] **T3.3** — Trend channel smart caching in `browseChannelVideos`
  - File: `functions/src/services/tools/handlers/discovery/browseChannelVideos.ts`
  - **Logic:** before YouTube API, check if target channel is a tracked trend channel:
    1. Query `users/{uid}/channels/{channelId}/trendChannels/{targetChannelId}` — single doc read
    2. If exists → read `trendChannels/{targetChannelId}/videos/` — all videos already synced
    3. Use cached trend videos, only fetch missing via YouTube API (if any)
  - **No freshness check** — trend sync runs regularly, data is fresh enough
  - **Needs `channelId`** — the user's own channelId is needed for the Firestore path. Already available in `ToolContext` (from `ctx.channelId`)
  - Update tests: add case for trend channel cache hit
  - Remove "Trend channel caching deferred" from Key Decisions Log

- [x] **T3.4** — Clean up Key Decisions Log
  - Remove duplicate entries (#10 = duplicate of #3, #11 = duplicate of #5)
  - Mark resolved decisions (e.g., "Trend channel caching deferred" → resolved by T3.3)
  - Update "Quota gate hard lock" entry → replaced by SRP split (T3.2)
  - Keep only decisions that are still relevant and actionable

- [x] **T3.5** — Update feature docs (LAST — after all code changes)
  - File: `docs/features/chat/tools/README.md` (was `youtube-research-tools.md`)
    - Update architecture diagram: add `getChannelOverview` to Layer 1
    - Update sequence diagram: two separate tool calls instead of two-phase
    - Update "Текущее состояние" — mark tools as implemented
    - Move "← YOU ARE HERE" marker
  - File: `docs/features/chat/README.md`
    - Update tool list and context bridges section
  - File: `docs/backlog.md`
    - Mark "browseChannelVideos split" as ✅ Done

### Verification

```bash
npx vitest run --project functions   # backend (new handler + refactored tests)
npm run test:run                      # frontend (new tool pill)
npm run lint
npm run typecheck                     # new files
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above (T3.1–T3.5)
- [x] Update Phase Status table: Phase 3 → ✅ DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 3

Elite senior dev review:
- [x] No orphaned references to deprecated middleware?
- [x] UI still shows 📊 indicator correctly?
- [x] SRP clean: each tool does exactly one thing? No boolean mode switches?
- [x] `getChannelOverview` description clearly guides LLM to call it before `browseChannelVideos`?
- [x] Trend caching saves quota for tracked channels? Single doc check, not N+1?
- [x] Key Decisions Log is clean — no duplicates, no stale entries?
- [x] Docs reflect new tool architecture?

---

## Final Review: Double Review-Fix Cycle

After ALL phases complete — two full review passes.

### Review Pass 1: Architecture & Correctness

Full codebase review through the lens of:
- [x] **R1.1** — Telescope Pattern integrity: each tool does exactly one thing? — PASS
- [x] **R1.2** — Data flow correctness: correct Firestore paths, correct CSV parsers, correct cache collections? — PASS
- [x] **R1.3** — Error handling: what happens when YouTube API key is missing? When channel not found? When CSV is corrupt? — PASS
- [x] **R1.4** — Quota management: worst-case estimates correct? Smart caching actually saves units? — PASS (fixed `fetchedFromYouTube` accuracy)
- [x] **R1.5** — Test coverage: every handler has tests? Edge cases covered? — PASS
- [x] **R1.6** — Security: new Firestore rules in place? No sensitive data in SSE events? — PASS

→ R1 findings fixed: `fetchedFromYouTube` now tracks actual YouTube API response count

### Review Pass 2: Production Readiness

- [x] **R2.1** — Full test suite passes: `npm run test:run` + `npx vitest run --project functions` — 400 + 325 = 725 tests
- [x] **R2.2** — Lint + typecheck clean: `npm run lint` + `npm run typecheck` — zero errors/warnings
- [x] **R2.3** — Tool descriptions reviewed: will LLM actually use tools correctly? — PASS
- [x] **R2.4** — Integration test: simulate conversation flow manually — PASS (fixed `TrafficSourceStats` field name `s.name` → `s.source`)
- [x] **R2.5** — Performance: no N+1 Firestore queries? Parallel reads where possible? — PASS

→ R2 findings fixed: `TrafficSourceStats` component now reads correct `source` field

---

## Key Decisions Log

| # | Decision | Rationale | Phase |
|---|----------|-----------|-------|
| 1 | `trafficSource/main` not `traffic/main` | Two different CSV systems — Traffic Sources (aggregate) vs Suggested Traffic (individual videos) | P1 |
| 2 | Parser ported to backend (not shared/) | Frontend parser uses `FileReader` (browser API), backend needs `string` input | P1 |
| 3 | `youtubeApiKey` in ToolContext from user settings | Read from `users/{uid}/settings/general → apiKey` once per chat request, shared across all tool calls in agentic loop | P1 |
| 4 | No `analysisGuidance` for `analyzeTrafficSources` | Traffic source data is compact (6-8 rows) — LLM handles without instructions | P1 |
| 5 | Worst-case quota estimate | `ceil(videoCount / 50) * 2` — "up to ~X units (less if cached)" | P1 |
| 6 | ~~Strangler Fig migration~~ | **RESOLVED**: `cached_suggested_traffic_videos/` fully consolidated into `cached_external_videos/` (10,110 docs migrated). See `cache-consolidation-plan.md` | P2 → Done |
| 7 | `cleanField` no quote stripping | Backend `parseLine` handles RFC 4180 quoting properly; `cleanField` only trims whitespace | P1 |
| 8 | `db.batch()` for cache writes | Batch write fetched videos to `cached_external_videos/`, chunked by 500 (Firestore WriteBatch limit) | P1 |
| 9 | `publishedAfter` uses Date parsing | `new Date().getTime()` comparison instead of fragile string comparison | P1 |
| 10 | `quotaUsed` without `_` prefix | Survives `stripInternalHints`, flows to both LLM and UI. No SSE event type changes needed. | P2 |
| 11 | Firestore rules: wildcard covers all | `match /users/{userId}/{document=**}` covers `cached_external_videos/` — no new rules needed | P2 |
| 12 | YouTube mock uses class syntax | `vi.fn().mockImplementation()` doesn't work with vitest hoisting; class instance properties pattern works reliably | P1 |
| 13 | `getMultipleVideoDetails` ownership by collection | `formatVideoData` takes `CollectionSource` enum — ownership determined by source collection, not data. `videos/` → trust `data.ownership`, `cached_external_videos/` → `"external"` | P2 |
| 14 | SRP split: `getChannelOverview` + `browseChannelVideos` | `confirmed` boolean → two separate tools. `uploadsPlaylistId` = structural dependency (capability-based). Replaces quota gate hard lock workaround. | P3 |
| 15 | Optional `channelId` for trend caching | After SRP split, `browseChannelVideos` doesn't know target channel ID. Optional param enables 3-level cache cascade (own → external → trend → YouTube API). Doesn't break SRP — cache optimization only. | P3 |
| 16 | Middleware deleted, not deprecated | `enrichContextWithTrafficSources.ts` fully removed. 📊 on VideoCardChip → read-only indicator. 10 files, ~150 lines deleted. | P3 |

---

## Current Test Count

Update after each phase:
- Before: 306 tests (54 frontend + 252 backend) — 20 test files
- After Phase 0: 327 tests (+21: 11 delta + 10 formatTrafficSources) — 22 test files
- After Phase 1: 377 tests (+50: 12 youtube, 11 csvParser, 8 timeline, 9 analyzeTrafficSources, 10 browseChannelVideos) — 25 test files
- After Phase 2: 386 tests (+9: 2 thumbnail bugfix updated, 3 cascade, 6 YouTube fallback) — 25 test files
- After T3.1: 387 tests (+1 from test cleanup, 0 new tests — T3.1 was deprecation/removal) — 25 test files
- After Phase 3 (full): 400 tests (+13: 9 getChannelOverview, 8 browseChannelVideos refactored, 3 trend caching, −7 old Phase 1 tests removed) — 27 test files
