# Cache Consolidation — Engineering Tasks

> **Architecture doc:** `docs/features/cache-consolidation-plan.md`
> **Backlog item:** `docs/backlog.md` → "Consolidate external video caches"

---

## Quick Context Recovery

**Что делаем:** сливаем `cached_suggested_traffic_videos/` в `cached_external_videos/`. Убираем `trendChannels/` fallback из tool handlers (будущий отдельный тул `lookupTrendVideos`).

**Cascade до/после:**
```
BEFORE                                                          AFTER
getMultipleVideoDetails: own → suggested → external → API   →   own → external → API
browseChannelVideos:     own + external → trend → API        →   own + external → API
mentionVideo:            own → suggested                     →   own → external
viewThumbnails:          own + suggested                     →   own + external
```

**Deployment order:**
```
Phase 0 (migration) ✅ → Phase 1 (backend) → Phase 2 (frontend) → Phase 3 (tests) → Phase 4 (docs) → Phase 5 (cleanup)
```

**Rule:** Each phase MUST be reviewed and all tasks checked off (`[x]`) before proceeding to the next. No exceptions.

**Key constraint:** Phase 0 MUST complete before deploying Phase 1-2. Otherwise handlers look in `cached_external_videos/` where data doesn't exist yet.

---

## Phase 0: Migration Script ✅

- [x] Create `functions/scripts/migrateSuggestedToExternal.ts`
- [x] Run migration — 10,110 docs migrated, 0 errors, 134s
- [x] Verify: idempotency check passed (re-run skipped all 10,110)

### Phase 0 Review ✅
- [x] All Phase 0 tasks checked off
- [x] `cached_external_videos/` has migrated docs with `source: "suggested_traffic"` + `migratedAt`
- [x] Ready to proceed to Phase 1

---

## Phase 1: Backend — Unified Cache Reads + Remove Trend Fallback ✅

### T1.1 — getMultipleVideoDetails: remove suggested_cache

**File:** `functions/src/services/tools/handlers/detail/getMultipleVideoDetails.ts`

**What to change:**
1. Delete `suggestedRefs` definition (line 32): `const suggestedRefs = ids.map(id => db.doc(...))`
2. Delete `suggestedRefs` from `Promise.all()` (lines 35-39): remove second element + destructured variable
3. Delete `suggestedSnaps` cascade branch (lines 52-54): the `else if (suggestedSnaps[i].exists)` block
4. Delete `"suggested_cache"` from `CollectionSource` type (near top of file, search for `type CollectionSource`)
5. Update header comment: remove `cached_suggested_traffic_videos` from cascade list (lines 6-7)

**Resulting cascade:** `own → external_cache → youtube_api` (true 3-level)

**Verify:** `npm run lint && npx vitest run --project functions`

---

### T1.2 — browseChannelVideos: remove trend fallback

**File:** `functions/src/services/tools/handlers/discovery/browseChannelVideos.ts`

**What to change:**
1. Delete entire "Trend channel cache check" block (lines ~98-137, ~40 lines):
   - `const targetChannelId = args.channelId ...`
   - `const trendDocRef = db.doc(...)` 
   - `const trendSnaps = await db.getAll(...)` loop
   - All `trendCacheHits` tracking
2. Delete `trendCacheHits` from response object (near bottom)
3. Update header comment (lines 7-11): remove level 2 trendChannels, change "3-level" → "2-level"
4. Remove `channelId` from handler args processing IF it was only used for trend lookup — check if `channelId` is used elsewhere in the handler. If only for trend: remove from args validation too.

**Resulting cascade:** `own + external_cache → youtube_api` (true 2-level)

**Verify:** `npm run lint && npx vitest run --project functions`

---

### T1.3 — analyzeSuggestedTraffic: path rename (reads only)

**File:** `functions/src/services/tools/handlers/analysis/analyzeSuggestedTraffic.ts`

**What to change:** Two path strings, both are `db.doc()` refs for batch reads:
1. Line 217: `cached_suggested_traffic_videos/${id}` → `cached_external_videos/${id}`
2. Line 269: `cached_suggested_traffic_videos/${id}` → `cached_external_videos/${id}`

> ⚠️ `enrichedData.set()` on lines 226, 276 is `Map.set()` (in-memory), NOT Firestore write. Don't touch.

**Verify:** `npm run lint && npx vitest run --project functions`

---

### T1.4 — mentionVideo: path rename

**File:** `functions/src/services/tools/handlers/utility/mentionVideo.ts`

**What to change:**
1. Line 19: update comment `cached_suggested_traffic_videos` → `cached_external_videos`
2. Line 23: `cached_suggested_traffic_videos/${videoId}` → `cached_external_videos/${videoId}`

**Verify:** `npm run lint`

---

### T1.5 — viewThumbnails: path rename

**File:** `functions/src/services/tools/handlers/detail/viewThumbnails.ts`

**What to change:**
1. Line 6: update comment
2. Line 31: `cached_suggested_traffic_videos` → `cached_external_videos` (title query)
3. Line 86: `cached_suggested_traffic_videos/${id}` → `cached_external_videos/${id}` (batch refs)

**Verify:** `npm run lint && npx vitest run --project functions`

---

### Phase 1 Review ✅

- [x] T1.1 checked off — getMultipleVideoDetails
- [x] T1.2 checked off — browseChannelVideos (targetChannelId kept for ownChannelSync)
- [x] T1.3 checked off — analyzeSuggestedTraffic
- [x] T1.4 checked off — mentionVideo
- [x] T1.5 checked off — viewThumbnails
- [x] `npx vitest run --project functions` — 21 files, 325 tests passed
- [x] `npm run lint` — 0 errors
- [x] `npm run typecheck` — 0 errors
- [x] Grep confirms 0 remaining refs to `cached_suggested_traffic_videos` in `functions/src/`
- [x] Phase 3 tests updated alongside Phase 1 (mock path expectations)
- [x] Ready to proceed to Phase 2

> If tests fail due to mock path expectations → fix in Phase 3 first, then re-verify.

---

## Phase 2: Frontend — Path + Service Rename ✅

### T2.1 — videoService: path + methods

**File:** `src/core/services/videoService.ts`

**What to change:**
1. Line 19: rename `getSuggestedVideosPath` → `getExternalVideosPath`
2. Line 20: path `cached_suggested_traffic_videos` → `cached_external_videos`
3. Lines 54-56: **DELETE** `fetchSuggestedVideos` method entirely (dead code — 0 callers, verified by grep)
4. Lines 114-126: rename `batchUpdateSuggestedVideos` → `batchUpdateExternalVideos`

**Verify:** `npm run typecheck` — expect errors in downstream consumers (fixed in T2.2-T2.5)

---

### T2.2 — RENAME useSuggestedVideoLookup → useExternalVideoLookup

**Old file:** `src/pages/Details/tabs/Traffic/hooks/useSuggestedVideoLookup.ts`
**New file:** `src/pages/Details/tabs/Traffic/hooks/useExternalVideoLookup.ts`

**What to change:**
1. Create new file with same content, then apply renames:
   - Import: `getSuggestedVideosPath` → `getExternalVideosPath` (line 4)
   - `suggestedVideoQueryKey` → `externalVideoQueryKey` (line 21)
   - `suggestedVideoQueryPrefix` → `externalVideoQueryPrefix` (line 25)
   - `useSuggestedVideoLookup` → `useExternalVideoLookup` (line 31)
2. Delete old file

---

### T2.3 — useMissingTitles: rename imports + add source

**File:** `src/pages/Details/tabs/Traffic/hooks/useMissingTitles.ts`

**What to change:**
1. Line 11: import `suggestedVideoQueryPrefix` → `externalVideoQueryPrefix` from new file path
2. Line 89: `VideoService.batchUpdateSuggestedVideos` → `VideoService.batchUpdateExternalVideos`
3. Line 82: add `source: "suggested_traffic"` to batch write data object:
   ```typescript
   data: {
       ...cleanData,
       source: "suggested_traffic",  // ← ADD
       lastUpdated: Date.now()
   }
   ```
4. Line 241: `suggestedVideoQueryPrefix` → `externalVideoQueryPrefix`

---

### T2.4 — TrafficTab: rename import

**File:** `src/pages/Details/tabs/Traffic/TrafficTab.tsx`

**What to change:**
1. Line 16: import path `./hooks/useSuggestedVideoLookup` → `./hooks/useExternalVideoLookup`
2. Line 16: import name `useSuggestedVideoLookup` → `useExternalVideoLookup`
3. Line 169 (approx): usage `useSuggestedVideoLookup(` → `useExternalVideoLookup(`

---

### T2.5 — suggestedVideosMigration: rename import

**File:** `src/core/utils/migration/suggestedVideosMigration.ts`

**What to change:**
1. Line 9: `getSuggestedVideosPath` → `getExternalVideosPath`

---

### Phase 2 Review ✅

- [x] T2.1 checked off — videoService (`getExternalVideosPath`, deleted `fetchSuggestedVideos`, `batchUpdateExternalVideos`)
- [x] T2.2 checked off — useExternalVideoLookup (renamed file + all exports)
- [x] T2.3 checked off — useMissingTitles (imports + `source: "suggested_traffic"` added)
- [x] T2.4 checked off — TrafficTab (import + usage updated)
- [x] T2.5 checked off — suggestedVideosMigration (import updated)
- [x] `npm run typecheck` — 0 errors (all imports resolved)
- [x] `npm run lint` — 0 errors
- [x] `npm run test:run` — 26 files, 400 tests passed
- [x] Grep confirms 0 remaining refs to `getSuggestedVideosPath` / `useSuggestedVideoLookup` in `src/`
- [x] Ready to proceed to Phase 4

---

## Phase 3: Test Updates ✅ (done alongside Phase 1)

### T3.1 — getMultipleVideoDetails tests — DONE
### T3.2 — viewThumbnails tests — DONE
### T3.3 — browseChannelVideos tests — DONE

### Phase 3 Review ✅

- [x] T3.1 — removed suggested_cache mocks, 3→2 mock chains
- [x] T3.2 — path string updated
- [x] T3.3 — 3 trend tests removed, mockDocGet removed from ownChannelSync tests
- [x] `npx vitest run --project functions` — 21 files, 325 tests passed
- [x] `npm run test:run` — all tests pass (verified below)
- [x] `npm run lint` — 0 errors
- [x] Ready to proceed to Phase 4

---

## Phase 4: Documentation (6 files) ✅

### T4.1 — Update all doc references

**Search and replace** `cached_suggested_traffic_videos` → `cached_external_videos` in:

| File | Expected matches |
|------|-----------------|
| `docs/features/chat/youtube-research-tools.md` | 5 |
| `docs/archive/tasks/chat/youtube-research-tools-tasks.md` | 4 |
| `docs/features/chat/README.md` | 2 |
| `docs/features/chat/view-thumbnails.md` | 1 |
| `docs/features/chat/context-token-optimization.md` | 1 |
| `docs/features/analyze-suggested-traffic-tool.md` | 1 |

**Also update:**
- Cascade diagrams in `youtube-research-tools.md` — remove trendChannels from handler sections
- `browseChannelVideos` section — remove trendCacheHits from response schema
- `getMultipleVideoDetails` section — remove suggested_cache from cascade list

### T4.2 — Update cache-consolidation-plan.md

Mark all phases as complete, add actual dates and results.

### Phase 4 Review ✅

- [x] T4.1 checked off — 6 doc files updated (youtube-research-tools.md, youtube-research-tools-tasks.md, README.md, view-thumbnails.md, context-token-optimization.md, analyze-suggested-traffic-tool.md)
- [x] T4.2 checked off — cache-consolidation-plan.md deployment order updated
- [x] Backlog item marked as Done
- [x] Remaining refs to `cached_suggested_traffic_videos` in docs/ are only in consolidation plan/tasks docs (expected — they describe the migration itself) and backlog (historical context)
- [x] Ready to proceed to Phase 5

## Phase 5: Cleanup Old Collection ✅

### T5.1 — Final verification before cleanup

- [x] All Phases 1-4 deployed and working in production
- [x] Manual spot-check: Traffic tab loads data correctly
- [x] Manual spot-check: AI Chat tools resolve videos from `cached_external_videos/`
- [x] Grep confirms 0 refs to `cached_suggested_traffic_videos` in working code (`src/`, `functions/src/`)
- [x] Audit script confirmed: OLD newest = 2026-03-05, NEW newest = 2026-03-15 → old collection stale

### T5.2 — Delete old collection data

- [x] `deleteSuggestedTrafficCache.ts` — dry run confirmed 10,110 docs across 2 channels
- [x] Executed: 10,110 docs deleted (8,120 + 1,990), 83.4s
- [x] Post-delete audit confirmed: OLD = 0 docs, NEW = 14,295 docs

### T5.3 — Cleanup dead files

- [x] Deleted `functions/scripts/migrateSuggestedToExternal.ts` (migration script)
- [x] Deleted `functions/scripts/deleteSuggestedTrafficCache.ts` (cleanup script)
- [x] Deleted `functions/scripts/auditCacheCollections.ts` (audit script)
- [x] Deleted `src/core/utils/migration/suggestedVideosMigration.ts` (dead code — 0 callers)
- [x] Deleted empty `src/core/utils/migration/` directory

### Phase 5 Review ✅

- [x] T5.1 checked off — verification passed
- [x] T5.2 checked off — old collection deleted (10,110 docs)
- [x] T5.3 checked off — all one-time scripts + dead migration file cleaned up
- [x] `cached_suggested_traffic_videos/` no longer exists in Firestore
- [x] `npm run check` — 0 errors
- [x] Tests: 521 frontend (38 files) + 871 backend (61 files) = 1,392 total (99 files)
- [x] Consolidation complete

---

## Key Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | `trendChannels/` stays separate | 20+ frontend consumers, future `lookupTrendVideos` tool for explicit access |
| 2 | `sync.ts` untouched | Writes only to `trendChannels/`, doesn't touch external cache |
| 3 | Phase 0 before deploy | Prevents blind spot where handlers point to empty collection |
| 4 | `fetchSuggestedVideos` deleted | Dead code — 0 callers, verified by grep |
| 5 | `source: "suggested_traffic"` on writes | Track provenance after merge into shared collection |
| 6 | `analyzeSuggestedTraffic` reads-only | `enrichedData.set()` = Map.set(), not Firestore write |
| 7 | `browseChannelVideos` already has source | `source: "channel_discovery"` at line 240 — no change needed |
| 8 | Frontend tests deferred | 0 test files in Traffic tab currently |
| 9 | `targetChannelId` kept in browseChannelVideos | Used by `ownChannelSync` (lines 161-164), not only trend fallback. Removed trend block but kept variable extraction |
| 10 | Phase 3 merged into Phase 1 | Tests failed on mock paths immediately — fixing separately made no sense. 3 trend tests deleted, 328→325 backend tests |
| 11 | `mockDocGet` kept in browseChannelVideos test mock factory | Still referenced in db mock structure (line 23). Not called in tests anymore but harmless — removing would change mock shape |
| 12 | Test count: 400 total stable | 75 frontend + 325 backend (was 328 — minus 3 trend tests) |
