# Channel Sync Migration: Frontend → Cloud Function — Tasks

## Overview

Миграция Channel Sync пайплайна с фронтенда (React hooks) на Cloud Functions. Цель: консолидация всех sync-пайплайнов на бэкенде, устранение multi-tab race condition, повышение reliability (sync работает даже если вкладка закрыта).

**Feature doc:** `docs/features/sync-architecture.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/sync-architecture.md` (обзор всех пайплайнов, field parity таблица, cross-cache логика)
3. `functions/src/trends/scheduledSync.ts` (паттерн для scheduled function — users → channels iteration)
4. `functions/src/trends/manualSync.ts` (паттерн для callable function — auth, API key, return result)
5. `src/core/hooks/useVideoSync.ts` (текущая frontend реализация sync engine — переносим на бэкенд)

### Key Decisions (carry forward)

1. **No autoSync toggle. Minimum frequency = 1 day.** В UI нет переключателя вкл/выкл — есть только Update Frequency (`ApiSyncSettings.tsx`). Backend scheduled function запускается раз в сутки (00:10 UTC) — покрывает любую частоту ≥ 24h. UI dropdown ограничен **Days и Weeks** (Minutes и Hours удалены). Поле `autoSync` в `SyncSettings` type — legacy, можно игнорировать.
2. **API key читается из Firestore** (`settings/general.apiKey`), тот же паттерн что `manualTrendSync`. Не передаётся от клиента.
3. **Cron 00:10 UTC** — 10 минут после Trends Sync (00:00 UTC). Cross-cache максимально эффективен: Trends данные свежие.
4. **Video Fetch Retry поглощён** scheduled function. Отдельного пайплайна не будет. Retry-eligible видео обрабатываются в том же проходе что и обычные видео.
5. **`syncVideo()` (single video) остаётся на фронтенде.** Используется в VideoCard и RecommendationCard для immediate feedback при клике. Trade-off: 2 API units vs latency callable round-trip. Accepted tech debt: API key visible in browser Network tab (existing behavior, not introduced by migration). Future path: single-video callable.
6. **Backend использует `YouTubeService`** из `functions/src/services/youtube.ts` (axios, backend API). НЕ портируем `fetchVideosBatch` из `src/core/utils/youtubeApi.ts` (browser fetch API). Backend YouTubeService уже умеет `getVideoDetails()` (batch) и `getChannelSubscriberCounts()`.
7. **`ChannelSyncService` — новый класс** в `functions/src/services/channelSync.ts`. Отдельно от `SyncService` (Trends). Single Responsibility: Channel Sync = sync user's own videos. Trends Sync = sync competitor videos.
8. **Backend `SyncSettings` расширяется**, НЕ создаётся отдельный `ChannelSyncSettings`. Один Firestore doc `settings/sync` = один интерфейс. Frontend и backend описывают один и тот же документ.
9. **Backend `Notification` расширяется** полями `link`, `thumbnail`, `isPersistent`, `internalId` — нужны для retry notifications (final failure = persistent error with link + thumbnail).
10. **Manual sync updates ALL videos** (no per-video freshness filter). Same as current frontend `syncAllVideos()` behavior — `manualSync()` with per-video filter is removed. Scheduled function checks freshness at channel level (`lastGlobalSync + frequencyHours`), not per-video.
11. **Minimum sync frequency = 1 day.** Daily cron cannot serve sub-24h frequencies. UI dropdown limited to Days/Weeks. This matches real usage — sub-24h sync was never used.
12. **No feature flag. Rollback via git revert.** Backend (P1+P2) and frontend (P3) can be independently reverted. If only backend fails → frontend shows callable error, scheduled sync stops, no data corruption (merge:true). If only frontend fails → revert P3, restore old hooks from git history, backend functions sit unused.

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes, независимый agent)
- **Parallel tasks** — независимые файлы внутри фазы

## Phase/Wave Status

| Phase | Description | Status |
|-------|-------------|--------|
| P1 | Backend: ChannelSyncService (core sync engine) | TODO |
| P2 | Backend: scheduledChannelSync + manualChannelSync | TODO |
| P3 | Frontend: simplify hooks + update UI | TODO |
| P4 | Cleanup: delete dead code + update docs | TODO |
| FINAL | Double review-fix cycle | TODO |

## Current Test Count

**Baseline (before work begins) — verified 2026-03-25:**
- Frontend: 686 tests (49 files)
- Backend: 1041 tests (69 files)
- **Total: 1727 (118 files)**

MUST be re-obtained by running `npx vitest run --project frontend` and `npx vitest run --project functions` after every phase.

---

## Phase 1: ChannelSyncService — Core Sync Engine

**Goal:** Create the backend sync engine that replicates `syncVideosWithCrossCache()` + Video Fetch Retry logic from frontend hooks.

### Critical Context

- ⚠️ **viewCount type mismatch.** `videos/` stores **string** (YouTube API native). `trendChannels/*/videos/` stores **number** (parsed on write). Cross-cache MUST convert: `String(trendData.viewCount)`. Frontend does this at `useVideoSync.ts:108`. **Do NOT use `parseInt()` — that pattern is SyncService-specific for Trends analytics. `ChannelSyncService` must write strings.**
- ⚠️ **Custom video ID mapping.** Videos with `publishedVideoId` use YouTube ID for API lookup but save under internal `video.id` (e.g. `custom-abc123`). Frontend does this at `useVideoSync.ts:147-154`.
- ⚠️ **Firestore rejects `undefined` values.** Must strip before `batch.set()`. Frontend does this at `useVideoSync.ts:163-167`.
- ⚠️ **MUST use `batch.set(docRef, data, { merge: true })`** on Admin SDK. Without merge, Firestore **replaces the entire document** — all 50+ user fields (notes, packaging, gallery, renders, localizations) would be deleted. This matches frontend pattern in `VideoService.batchUpdateVideos`.
- ⚠️ **`fetchStatus: 'failed'` videos are skipped by regular sync** but processed by retry logic. In the backend, retry-eligible = `isCustom && publishedVideoId && fetchStatus !== 'success' && fetchStatus !== 'pending' && fetchRetryCount < 7`. The `'pending'` guard prevents race condition with active user updates (e.g. user re-linking a YouTube URL while sync runs).
- ⚠️ **Cloned videos (`isCloned: true`) and custom without `publishedVideoId`** are always skipped. No sync attempted.
- Backend `YouTubeService.getVideoDetails()` returns `YouTubeVideoItem[]` — must map to flat video doc fields:
  ```
  YouTubeVideoItem → Video Doc:
    snippet.title             → title
    snippet.thumbnails (maxres probe or fallback) → thumbnail
    statistics.viewCount      → viewCount (already string from API)
    snippet.description       → description
    snippet.tags              → tags
    snippet.publishedAt       → publishedAt
    snippet.channelTitle      → channelTitle
    contentDetails.duration   → duration
    statistics.likeCount      → likeCount
    + lastUpdated             = Date.now()
    + fetchStatus             = 'success'
    + lastFetchAttempt        = Date.now()

  NOT mapped by YouTube API batch (only available via cross-cache):
    channelAvatar   — comes from TrendChannel doc, NOT videos.list API
    subscriberCount — comes from TrendChannel doc, NOT videos.list API
    channelId       — already exists in video doc, no update needed
  ```
  With `{ merge: true }`, existing `channelAvatar`/`subscriberCount` values are preserved for API-only videos. This is an accepted behavioral diff from frontend (which made a separate `channels.list` call).
- ⚠️ **Missing video handling.** For each requested video ID NOT returned by YouTube API → write `{ fetchStatus: 'failed', lastFetchAttempt: Date.now() }`. These videos are likely deleted/private — the retry pass will pick them up. Frontend does this at `useVideoSync.ts:179-190`.
- ⚠️ **`YouTubeService.getVideoDetails()` re-throws on first chunk failure** — no error isolation between chunks. `ChannelSyncService` must call YouTube API **per-chunk (50 IDs)** with try/catch around each chunk, NOT pass all IDs at once. This preserves partial results when one chunk fails.
- Cross-cache reads trend channel docs for `subscriberCount` and `avatarUrl` — same as frontend `useVideoSync.ts:103,113,121`.
- ⚠️ **`mergedVideoData` legacy field.** On retry success, also delete `mergedVideoData` via `FieldValue.delete()` — defensive cleanup for old documents that may still have this nested object (migration from March 2026, most docs already clean).

### Tasks

- [ ] **T1.1** Create `functions/src/services/channelSync.ts` — `ChannelSyncService` class with:
  - `syncUserVideos(userId, channelId, apiKey)` — main entry point
  - Phase 1: read all `videos/` docs from `users/{uid}/channels/{cid}/videos`
  - Filter: skip `isCloned`, skip `isCustom` without `publishedVideoId`, skip `fetchStatus === 'failed'` (handled by retry pass)
  - Phase 2: cross-cache from `trendChannels/*/videos/` via `db.getAll()`, grouped by channel, **chunks of ~100 refs** (NOT 30 — that's a frontend client SDK limitation; Admin SDK `getAll()` handles thousands)
  - Phase 3: YouTube API **per-chunk (50 IDs)** with try/catch around each chunk via `YouTubeService.getVideoDetails()`. Do NOT pass all IDs at once — `getVideoDetails()` re-throws on first chunk failure, breaking error isolation.
  - Phase 4: retry pass for eligible failed custom videos (`fetchStatus !== 'success' && fetchStatus !== 'pending' && fetchRetryCount < 7`) via `YouTubeService.getVideoDetails()` (single IDs). ⚠️ Clean `publishedVideoId` before API call — may contain full YouTube URL (e.g. `https://youtu.be/xxx`), extract video ID first. On success: clear `fetchRetryCount`, `lastFetchAttempt`, `mergedVideoData` via `FieldValue.delete()`.
  - Batch write results to `videos/{videoId}` via `batch.set(docRef, data, { merge: true })` (400 ops per commit — 1 op/video, no embedding queue unlike SyncService which uses 225 due to 2 ops/video). **`merge: true` is mandatory** — sync writes ~10 fields, video doc has 50+.
  - Return: `{ cachedCount, apiSuccessCount, apiSkippedCount, quotaUsed, retryResults: { succeeded: string[], failed: string[], finalFailed: string[] } }`
  - ⚠️ **Cross-cache field mapping from TrendVideo (number) to Video doc (string):** `viewCount: String(td.viewCount)`, `likeCount: String(td.likeCount)`, `subscriberCount: String(tc.subscriberCount)`
  - ⚠️ **Strip undefined values** from all objects before `batch.set()`: iterate entries, skip `undefined` values
  - ⚠️ **Thumbnail resolution:** use shared `resolveMaxResThumbnails()` utility (extracted in T1.4). Cross-cache takes thumbnail as-is from trend data.
  - ⚠️ **`commentCount` is NOT written** to `videos/` — consistent with current frontend Channel Sync behavior. Only Trends Sync writes `commentCount`.
  - Follow existing pattern: `functions/src/services/sync.ts` (SyncService) for Firestore access patterns, batch chunking, error handling

- [ ] **T1.2** Extend existing `SyncSettings` in `functions/src/types.ts` (NOT a separate interface — same Firestore doc as frontend):
  ```typescript
  export interface SyncSettings {
      trendSync?: { enabled: boolean; lastRun?: number };
      // Channel Sync fields (read from same settings/sync doc):
      frequencyHours?: number;    // default 24
      lastGlobalSync?: number;
  }
  ```
  Also add `ChannelSyncResult` interface for function return type.
  Also extend `Notification` interface with fields needed for retry notifications:
  ```typescript
  link?: string;
  thumbnail?: string;
  isPersistent?: boolean;
  internalId?: string;
  ```

- [ ] **T1.4** Extract `functions/src/services/thumbnailUtils.ts` — shared CDN maxres probe:
  ```typescript
  export async function resolveMaxResThumbnails(
      videoIds: string[]
  ): Promise<Map<string, string>>
  ```
  Extract from `SyncService.syncChannel()` (`sync.ts:77-95`). Update `SyncService` to use the shared utility. Used by both `SyncService` and `ChannelSyncService`.

- [ ] **T1.5** Create `functions/src/services/notificationUtils.ts` — generic notification writer:
  ```typescript
  export async function writeNotification(
      userId: string, channelId: string,
      notification: Omit<Notification, 'isRead'>
  ): Promise<void>
  ```
  `SyncService.sendNotification()` has hardcoded `type: 'success'` and `category: 'trends'` — cannot be reused for Channel Sync (needs `'channel'`, `'video'`, `'warning'`, `'error'`, `isPersistent`, `link`, etc.). Extract the generic Firestore write into `writeNotification()`. Must support optional `internalId` for idempotent writes: if `internalId` provided → `doc(ref, internalId).set()`, otherwise `collection.add()`. Retry notifications need `internalId` (e.g. `fetch-retry-{videoId}-{count}`) to prevent duplicates. Optionally refactor `SyncService` to use it too.

- [ ] **T1.3** Create `functions/src/services/__tests__/channelSync.test.ts` — tests for `ChannelSyncService`:
  - **Mock targets:** `../shared/db` (Firestore), `./youtube` (YouTubeService), `axios` (CDN HEAD probes)
  - **Happy path:** videos split between cross-cache and API, correct field mapping, correct ID mapping for custom videos
  - **Cross-cache freshness:** only use cache when `trendData.lastUpdated > video.lastUpdated`
  - **Type conversion:** viewCount/likeCount/subscriberCount converted from number to string
  - **Skip logic:** cloned videos skipped, custom without publishedVideoId skipped, failed status skipped by main pass
  - **Retry pass:** failed custom video retried, success clears fetchRetryCount/lastFetchAttempt (deleteField), failure increments fetchRetryCount
  - **Retry cap:** video at fetchRetryCount=7 is NOT retried
  - **Pending guard:** video with `fetchStatus: 'pending'` is NOT retried (active user update in progress)
  - **Undefined stripping:** fields with undefined values not written to Firestore
  - **Batch chunking:** >400 updates split into multiple batch.commit() calls
  - **Error isolation:** YouTube API error for one chunk doesn't stop processing of other chunks
  - **Quota error:** 403/quota error stops API processing early, sets hadQuotaError flag
  - **Merge mode:** every `batch.set()` uses `{ merge: true }` — verify in mock assertions
  - **Missing videos:** video IDs in API request but not in response → `fetchStatus: 'failed'` + `lastFetchAttempt`
  - **Empty videos:** returns zero counts when no syncable videos exist

### Parallelization Plan
```
T1.2 — SEQUENTIAL FIRST (type definitions, foundation)
T1.4 + T1.5 — PARALLEL (shared utilities: thumbnail probe + notification writer)
T1.1 — SEQUENTIAL (main service, depends on types + utilities)
T1.3 — SEQUENTIAL LAST (tests, needs service to exist)
```

### Verification
```bash
npx vitest run --project functions -- functions/src/services/__tests__/channelSync.test.ts
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark tasks above as ✅
- [ ] Update Phase 1 status in table → DONE
- [ ] Record test count after `npx vitest run --project frontend` + `npx vitest run --project functions`

### Review Gate 1

Prompt for review agent:

> Read `functions/src/services/channelSync.ts` and `functions/src/services/__tests__/channelSync.test.ts`.
>
> 1. Does the cross-cache correctly convert `viewCount` from number (trendChannels) to string (videos/)? Check every field that needs conversion.
> 2. Does the custom video ID mapping work correctly? `publishedVideoId` used for YouTube API lookup, but results saved under `video.id` (internal ID).
> 3. Are undefined values stripped from Firestore writes? Show the code path.
> 4. Does the retry pass handle all 3 outcomes: success (clear retry fields), failure (increment count + notification), final failure (count=7, persistent notification)?
> 5. Is the batch write chunked safely below Firestore's 500-op limit?
> 6. Does the freshness check (`trendData.lastUpdated > video.lastUpdated`) correctly fall back to API when cache is stale?
> 7. Does `getVideoDetails()` from `YouTubeService` correctly map to flat video doc fields? The return type is `YouTubeVideoItem[]`, not `VideoDetails[]` — ensure all field mappings (snippet.title → title, statistics.viewCount → viewCount, etc.) are correct.
> 8. Is YouTube API called **per-chunk (50 IDs)** with try/catch around each chunk? Or does it pass all IDs to `getVideoDetails()` at once (which would break error isolation since the method re-throws on first failure)?
> 9. Does retry success delete `mergedVideoData` via `FieldValue.delete()` alongside `fetchRetryCount` and `lastFetchAttempt`?
> 10. Does retry filter include `fetchStatus !== 'pending'` guard to avoid racing with active user updates?
> 11. Does **every** `batch.set()` call use `{ merge: true }`? Without it, entire video documents would be overwritten — catastrophic data loss.
> 12. Does the YouTube API batch handle **missing videos** (requested but not returned)? They should get `{ fetchStatus: 'failed', lastFetchAttempt: Date.now() }`.
>
> Fix all findings before moving to Phase 2.

---

## Phase 2: Scheduled + Manual Cloud Functions

**Goal:** Create two Cloud Functions — `scheduledChannelSync` (daily cron) and `manualChannelSync` (callable) — that invoke `ChannelSyncService`.

### Critical Context

- ⚠️ **Follow `scheduledTrendSnapshot` pattern exactly** for cron (users → channels iteration, settings reads, error isolation per channel).
- ⚠️ **Follow `manualTrendSync` pattern exactly** for callable (auth check, channelId arg, API key from Firestore, return stats object).
- ⚠️ **`lastGlobalSync` update.** Write `lastGlobalSync = Date.now()` to `settings/sync` **inside try block, after `syncUserVideos` returns successfully**. NOT in `finally` — if sync throws, `lastGlobalSync` must NOT update (otherwise broken sync silently skipped until next frequency window). Path: `users/{uid}/channels/{cid}/settings/sync` — per-channel, not global.
- ⚠️ **Frequency check in scheduled function.** Read `settings/sync` → if `lastGlobalSync + frequencyHours * 3600000 > now`, skip this channel. This respects user's configured frequency without needing the `autoSync` toggle.
- Notifications use category `'channel'` (same as current frontend), and MUST follow the same notification format as `useVideoSync.ts:297-319` for consistency. Backend notification includes `quotaBreakdown.details`.
- Retry notifications: intermediate → category `'video'`, type `'info'`. Final → category `'video'`, type `'error'`, `isPersistent: true`. Pattern from `useVideoFetchRetry.ts:167-188`.
- ⚠️ **Export in `functions/src/index.ts`** — add both functions to the appropriate section.
- ⚠️ **`SyncSettings` in backend types** — extended in T1.2 with `frequencyHours` and `lastGlobalSync` (same interface, same Firestore doc). Default `frequencyHours = 24` when field is missing.
- ⚠️ **Use `sendNotification()` utility** (from `SyncService` or extracted shared function) for consistency with Trends Sync notifications. Do NOT create notification inline via `db.collection().add()`.
- ⚠️ **Deployment order:** Backend functions MUST be deployed BEFORE frontend changes go live. If frontend calls `manualChannelSync` callable before it's deployed → "Function not found" error. Deploy strategy: P1+P2 → `firebase deploy --only functions` → P3 → frontend deploy.

### Tasks

- [ ] **T2.1** Create `functions/src/channelSync/scheduledSync.ts`:
  - `onSchedule({ schedule: "10 0 * * *", timeZone: "Etc/UTC", timeoutSeconds: 540, memory: "512MiB" })`
  - Iterate users → channels (same pattern as `trends/scheduledSync.ts`)
  - Read `settings/general` → API key check
  - Read `settings/sync` → frequency check: `lastGlobalSync + frequencyHours * 3600000 < now`
  - Call `channelSyncService.syncUserVideos(userId, channelId, apiKey)`
  - ⚠️ Update `settings/sync.lastGlobalSync = Date.now()` **inside try, after successful sync only** (NOT in finally — failed sync must retry next cron run)
  - Send notification (category: `'channel'`) via `sendNotification()` utility:
    - All from cache, 0 API → no notification (silent success). Note: retry notifications (below) fire independently — "silent" only means no main sync notification
    - Mixed cache+API → `"Channel Sync: {N} videos updated"` + `"{cached} from Trends cache, {api} from YouTube API."` + `meta: String(quotaUsed)` + `quotaBreakdown: { details: quotaUsed }`
    - API only → `"Channel Sync: {N} videos updated"` + `"Successfully synced {N} videos."` + `meta: String(quotaUsed)` + `quotaBreakdown: { details: quotaUsed }`
    - With skipped → append `" {skipped} skipped due to network error."` + type `'warning'`
  - Send retry notifications for failed custom videos (from `retryResults`):
    - Intermediate failure (retryCount 1-6): `title: 'Data update delayed'`, `message: 'Update #{count} for "{videoTitle}". Will automatically retry in 24 hours.'`, `type: 'info'`, `category: 'video'`, `internalId: 'fetch-retry-{videoId}-{count}'`, `link: '/video/{channelId}/{videoId}/details?action=update_link'`, `thumbnail: video.thumbnail`
    - Final failure (retryCount = 7): `title: 'Failed to update data for Home Page'`, `message: 'Could not retrieve details for "{videoTitle}". Please check if the video is still available on YouTube.'`, `type: 'error'`, `category: 'video'`, `isPersistent: true`, `internalId: 'fetch-failed-final-{videoId}'`, `link: '/video/{channelId}/{videoId}/details?action=update_link'`, `thumbnail: video.thumbnail`
    - ⚠️ **`link` format must be `/video/{channelId}/{videoId}/details?action=update_link`** — `NotificationDropdown` uses `startsWith('/video/')` then `split('/video/')[1]` to extract videoId for modal routing
    - ⚠️ **Display title/thumbnail fallback:** use `abTestTitles[0] || video.title` for title, `abTestThumbnails[0] || customImage || thumbnail` for thumbnail — matches frontend `useVideoFetchRetry.ts:157-163` parity
  - ⚠️ Use `admin.firestore.FieldValue.serverTimestamp()` for notification `timestamp` — same pattern as `SyncService.sendNotification()`. Frontend read layer handles Timestamp → number conversion.
  - Missing API key → log warning + **update `lastGlobalSync`** to prevent warning-on-every-cron-run (same anti-loop pattern as frontend `useAutoSync.ts:63-70`). No notification — user won't see until they open app

- [ ] **T2.2** Create `functions/src/channelSync/manualSync.ts`:
  - `onCall({ timeoutSeconds: 540, memory: "512MiB" })`
  - Auth check + channelId validation (same pattern as `manualTrendSync`)
  - API key from `settings/general`
  - Call `channelSyncService.syncUserVideos(userId, channelId, apiKey)`
  - ⚠️ Update `settings/sync.lastGlobalSync = Date.now()` **inside try, after successful sync only**
  - Send same sync notification as scheduled (via `sendNotification()` utility)
  - Return `{ success: true, totalSynced, cachedCount, apiCount, quotaUsed }`

- [ ] **T2.3** Update `functions/src/index.ts`:
  ```typescript
  // --- Channel Sync ──────────────────────────────────────────────────
  export { scheduledChannelSync } from "./channelSync/scheduledSync.js";
  export { manualChannelSync } from "./channelSync/manualSync.js";
  ```

- [ ] **T2.4** Create `functions/src/channelSync/__tests__/scheduledSync.test.ts`:
  - **Mock targets:** `../shared/db`, `../services/channelSync` (ChannelSyncService)
  - **Happy path:** iterates users → channels, calls syncUserVideos, updates lastGlobalSync, sends notification
  - **Frequency gate:** skips channel when lastGlobalSync + frequencyHours > now
  - **Missing API key:** skips channel (no notification, only log)
  - **Error isolation:** failure on one channel doesn't affect others
  - **Notification format:** correct title/message/category for different scenarios (all-cache, mixed, API-only, with-skipped)
  - **Retry notifications:** intermediate → info, final → error persistent

- [ ] **T2.5** Create `functions/src/channelSync/__tests__/manualSync.test.ts`:
  - **Mock targets:** `../shared/db`, `../services/channelSync` (ChannelSyncService)
  - **Auth validation:** unauthenticated → error
  - **Missing channelId:** invalid-argument error
  - **Missing API key:** failed-precondition error
  - **Happy path:** calls syncUserVideos, returns stats, sends notification, updates lastGlobalSync
  - **Error isolation:** syncUserVideos failure → proper error response

### Parallelization Plan
```
T2.1 + T2.2 — PARALLEL (independent functions, both use ChannelSyncService)
T2.3 — after T2.1 + T2.2 (needs exports to exist)
T2.4 + T2.5 — PARALLEL (independent test files)
```

### Verification
```bash
npx vitest run --project functions -- functions/src/channelSync/__tests__/scheduledSync.test.ts
npx vitest run --project functions -- functions/src/channelSync/__tests__/manualSync.test.ts
npx vitest run --project functions  # full suite — ensure no regressions
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark tasks above as ✅
- [ ] Update Phase 2 status in table → DONE
- [ ] Record test count after `npx vitest run --project frontend` + `npx vitest run --project functions`

### Review Gate 2

Prompt for review agent:

> Read `functions/src/channelSync/scheduledSync.ts`, `functions/src/channelSync/manualSync.ts`, and their tests.
>
> 1. Does the scheduled function correctly check `lastGlobalSync + frequencyHours * 3600000 < now` before syncing? What happens if `settings/sync` doc doesn't exist or `frequencyHours` is missing?
> 2. Does the manual callable follow the exact same auth/validation pattern as `manualTrendSync`? Compare side-by-side.
> 3. Is `lastGlobalSync` updated in `settings/sync` after both scheduled and manual sync? What if the sync itself throws — does it still update lastGlobalSync (it should NOT)?
> 4. Are retry notifications correct? Intermediate failures → category `'video'`, type `'info'`, with video title and retry count. Final failure (count=7) → category `'video'`, type `'error'`, `isPersistent: true`. Verify `link` format is exactly `/video/{channelId}/{videoId}/details?action=update_link` — `NotificationDropdown` splits on `/video/` to extract route. Verify `timestamp` uses `FieldValue.serverTimestamp()`, not `Date.now()`.
> 5. Is the sync notification silent when all videos served from cache (0 API quota used, 0 skipped)? This matches current frontend behavior.
> 6. Are both functions exported in `index.ts`?
> 7. Does the scheduled function handle the edge case where a user has no channels, or a channel has no videos?
>
> Fix all findings before moving to Phase 3.

---

## Phase 3: Frontend Simplification

**Goal:** Simplify frontend hooks — remove auto-sync timer, remove retry hook, make "Sync Now" call the backend callable.

### Critical Context

- ⚠️ **`useAutoSync.ts` → DELETE entirely.** Timer logic moves to backend cron. No more tab focus trigger.
- ⚠️ **`useVideoFetchRetry.ts` → DELETE entirely.** Retry logic absorbed into `ChannelSyncService`.
- ⚠️ **`useStoreInitialization.ts`** imports `useAutoSync` — must remove the import and call.
- ⚠️ **`App.tsx`** imports `useVideoFetchRetry` — must remove the import and call.
- ⚠️ **`useVideoSync.ts` simplification:**
  - `syncAllVideos()` and `manualSync()` → **REPLACE** with callable invocation (same pattern as `TrendService.syncChannelCloud`)
  - `syncVideosWithCrossCache()` → **DELETE** (moved to backend)
  - `syncVideo()` → **KEEP** (single video sync stays on frontend for immediate UI feedback)
  - Hook still exports `isSyncing` + `syncVideo` + a new `syncAllVideos` that calls the callable
- ⚠️ **`ApiSyncSettings.tsx`** calls `syncAllVideos(generalSettings.apiKey)` — after migration, the callable reads API key from Firestore, so the frontend no longer passes it. Signature changes.
- ⚠️ **`SettingsDropdown.tsx` + `SettingsMenuSync.tsx`** — dead code (zero importers). Delete in T3.7 (backlog #21).
- ⚠️ **`VideoCard.tsx` and `RecommendationCard.tsx`** use `syncVideo()` — this stays unchanged (single video sync remains on frontend).
- ⚠️ **Existing tests** for `useAutoSync.test.ts` and `useVideoFetchRetry.test.ts` → **DELETE** (hooks deleted). `useVideoSync.test.ts` → **REWRITE** to test callable invocation instead of cross-cache logic.

### Tasks

- [ ] **T3.1** Simplify `src/core/hooks/useVideoSync.ts`:
  - Remove `syncVideosWithCrossCache` (entire function)
  - Remove `manualSync` export
  - Rewrite `syncAllVideos` to call `manualChannelSync` callable:
    ```typescript
    const syncAllVideos = useCallback(async () => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        setIsSyncing(true);
        try {
            const { functions } = await import('../../config/firebase');
            const { httpsCallable } = await import('firebase/functions');
            const manualChannelSync = httpsCallable(functions, 'manualChannelSync');
            await manualChannelSync({ channelId });
            // No manual cache invalidation needed:
            // useFirestoreSync has active onSnapshot on videos/ →
            // backend Firestore write → snapshot fires → setQueryData updates cache
        } catch (error: unknown) {
            // ... error handling with logger
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
        }
    }, [channelId]);
    ```
  - Keep `syncVideo` unchanged (single video sync)
  - Remove imports: `collection`, `query`, `where`, `documentId`, `getDocs`, `db` (from `../../config/firebase`), `TrendService`, `fetchVideosBatch`, `useNotificationStore`
  - Keep imports needed for `syncVideo`: `fetchVideoDetails`, `type VideoDetails`, `VideoService`, `useUIStore`, `useQueryClient`, `useState`, `useCallback`, `useRef`
  - Export: `{ isSyncing, syncVideo, syncAllVideos }`

- [ ] **T3.2** Delete `src/core/hooks/useAutoSync.ts`

- [ ] **T3.3** Delete `src/core/hooks/useVideoFetchRetry.ts`

- [ ] **T3.4** Update `src/core/hooks/useStoreInitialization.ts`:
  - Remove `import { useAutoSync } from './useAutoSync'`
  - Remove `useAutoSync()` call

- [ ] **T3.5** Update `src/App.tsx`:
  - Remove `import { useVideoFetchRetry } from './core/hooks/useVideoFetchRetry'`
  - Remove `useVideoFetchRetry()` call

- [ ] **T3.6** Update `src/features/Settings/components/ApiSyncSettings.tsx`:
  - `syncAllVideos()` — no argument (backend reads API key from Firestore)
  - `disabled={isSyncing}` — remove `!generalSettings.apiKey` from disabled condition (backend checks)
  - Actually, keep `!generalSettings.apiKey` check for UX — show tooltip "Please configure API key" if missing
  - Remove `'Minutes'` and `'Hours'` from frequency unit dropdown — only keep `['Days', 'Weeks']`. Daily cron cannot serve frequency < 24h.
  - Narrow `FrequencyUnit` type in `unitConversion.ts`: `type FrequencyUnit = 'Days' | 'Weeks'` (keep `DurationUnit` unchanged — used by Clone Settings)
  - Update `getFrequencyUnit()`: values < 24h → return `'Days'` (not `'Minutes'`/`'Hours'`). Clamp display for existing users with sub-24h values.
  - Clamp in `updateFrequency`: `Math.max(24, frequencyToHours(val, unit))` — prevents `0.5 Days = 12h` via direct number input
  - If current `frequencyHours < 24`, clamp to 24 on save (migration guard)

- [ ] **T3.7** Delete `src/features/Settings/SettingsDropdown.tsx` and all 5 sub-components — dead code (backlog #21, `SettingsDropdown` has zero importers):
  - `src/features/Settings/components/SettingsMenuMain.tsx`
  - `src/features/Settings/components/SettingsMenuSync.tsx`
  - `src/features/Settings/components/SettingsMenuApiKey.tsx`
  - `src/features/Settings/components/SettingsMenuAppearance.tsx`
  - `src/features/Settings/components/SettingsMenuClone.tsx`
  - ⚠️ Grep each component name before deleting — verify no callers outside `SettingsDropdown`

- [ ] **T3.8** Delete `src/core/hooks/__tests__/useAutoSync.test.ts`

- [ ] **T3.9** Delete `src/core/hooks/__tests__/useVideoFetchRetry.test.ts`

- [ ] **T3.10** Rewrite `src/core/hooks/__tests__/useVideoSync.test.ts`:
  - Remove all cross-cache tests
  - Remove all manualSync tests
  - Add tests for new `syncAllVideos`:
    - Calls `httpsCallable(functions, 'manualChannelSync')` with `{ channelId }`
    - Sets `isSyncing = true` during call, `false` after
    - Concurrent guard: second call while first in-flight is ignored
    - Error handling: network error → shows toast/notification
  - Keep tests for `syncVideo` (unchanged)

### Parallelization Plan
```
T3.7 — SEQUENTIAL FIRST (delete dead code BEFORE changing signatures — prevents transient type errors in SettingsMenuSync.tsx)
T3.1 — SEQUENTIAL (core hook change, everything depends on new signature)
T3.2 + T3.3 — PARALLEL (independent deletes)
T3.4 + T3.5 — PARALLEL (independent import removals)
T3.6 — SEQUENTIAL (UI update, depends on T3.1 new signature)
T3.8 + T3.9 — PARALLEL (independent test deletes)
T3.10 — SEQUENTIAL LAST (test rewrite, needs T3.1 final shape)
```

### Verification
```bash
npx vitest run --project frontend  # full suite — ensure no regressions despite deleted files
npm run check  # lint + typecheck (catch broken imports from deleted files)
```

### MANDATORY: Update this file before proceeding
- [ ] Mark tasks above as ✅
- [ ] Update Phase 3 status in table → DONE
- [ ] Record test count after `npx vitest run --project frontend` + `npx vitest run --project functions`
- NOTE: Frontend test count will DROP (deleted test files). Backend test count will stay same. This is expected.

### Review Gate 3

Prompt for review agent:

> Read the modified `src/core/hooks/useVideoSync.ts`, the deleted files list, and `src/core/hooks/__tests__/useVideoSync.test.ts`.
>
> 1. Is `syncVideo()` completely untouched? It must still work for VideoCard and RecommendationCard single-video sync.
> 2. Does `syncAllVideos()` correctly call the `manualChannelSync` callable with `{ channelId }`? No API key passed?
> 3. Have ALL references to `useAutoSync` been removed? Check `useStoreInitialization.ts`, any barrel exports (`index.ts` files).
> 4. Have ALL references to `useVideoFetchRetry` been removed? Check `App.tsx`, any barrel exports.
> 5. Does `ApiSyncSettings.tsx` call `syncAllVideos()` without arguments? Is `SettingsDropdown.tsx` + its sub-components deleted (dead code)?
> 6. Does `npm run check` pass with zero errors? (Broken imports from deleted files would show here.)
> 7. Is the `useVideoSync` test file properly rewritten? Does it test the callable invocation, not the old cross-cache logic?
>
> Fix all findings before moving to Phase 4.

---

## Phase 4: Cleanup + Documentation

**Goal:** Remove dead frontend utility code, update docs, ensure feature doc is current.

### Critical Context

- ⚠️ **`src/core/utils/youtubeApi.ts`** — `fetchVideosBatch` is only used by the old `syncVideosWithCrossCache`. After Phase 3 it has zero callers. `fetchVideoDetails` is still used by `syncVideo` (frontend). Check with grep before deleting.
- ⚠️ **`src/core/services/trendService.ts`** — `fetchTrendChannels` was used by cross-cache. Check if it has other callers before removing.
- ⚠️ **Feature doc** `docs/features/sync-architecture.md` must be updated: Channel Sync now runs on backend, not frontend. Pipeline table, trigger table, technical implementation section all need updates.
- ⚠️ **Notification categories doc** `docs/features/notification-categories.md` — update sources column for `channel` and `video` categories.

### Tasks

- [ ] **T4.1** Check if `fetchVideosBatch` in `src/core/utils/youtubeApi.ts` has any remaining callers (grep). **Known callers outside sync**: `useEnrichmentGate.ts`, `TrafficPlaylistSelector.tsx`, `TrafficFloatingBar.tsx` (Traffic tab). If the only removed caller was `useVideoSync.ts` → function stays, do NOT delete. Only delete if grep shows zero remaining callers. Keep `fetchVideoDetails`, `extractVideoId`, `VideoDetails` interface regardless.

- [ ] **T4.2** Check if `TrendService.fetchTrendChannels` in `src/core/services/trendService.ts` has any remaining callers after Phase 3. If only used by deleted cross-cache → remove. If used elsewhere → keep.

- [ ] **T4.3** Update `docs/features/sync-architecture.md`:
  - Pipeline table: Channel Sync → "Cloud Function" instead of "Frontend"
  - Trigger table: remove `useAutoSync` timer/tab focus entries, add `scheduledChannelSync` (00:10 UTC) and `manualChannelSync` (callable)
  - Video Fetch Retry row → remove from table (absorbed into Channel Sync)
  - Technical Implementation: replace frontend file paths with backend file paths
  - Cross-cache section: still relevant but now executes on backend
  - Update test count at bottom

- [ ] **T4.4** Update `docs/features/notification-categories.md`:
  - `channel` category sources: replace `useVideoSync`, `useAutoSync` with `scheduledChannelSync`, `manualChannelSync`
  - `video` category sources: replace `useVideoFetchRetry` with `scheduledChannelSync` (retry notifications)

- [ ] **T4.5** Check `docs/features/` for any other docs referencing the deleted hooks. Grep for `useAutoSync`, `useVideoFetchRetry`, `useVideoSync.syncVideosWithCrossCache` in docs.

### Parallelization Plan
```
T4.1 + T4.2 — PARALLEL (independent dead code checks)
T4.3 + T4.4 + T4.5 — PARALLEL (independent doc updates)
```

### Verification
```bash
npm run check  # lint + typecheck + doc link checker
npx vitest run --project frontend
npx vitest run --project functions
# Grep for deleted symbols to ensure no stale references:
grep -r "useAutoSync\|useVideoFetchRetry\|syncVideosWithCrossCache\|fetchVideosBatch" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".test."
```

### MANDATORY: Update this file before proceeding
- [ ] Mark tasks above as ✅
- [ ] Update Phase 4 status in table → DONE
- [ ] Record test count after `npx vitest run --project frontend` + `npx vitest run --project functions`

### Review Gate 4

Prompt for review agent:

> Read the updated `docs/features/sync-architecture.md` and the git diff for this phase.
>
> 1. Does the pipeline table correctly show Channel Sync as "Cloud Function"?
> 2. Does the trigger table list `scheduledChannelSync` at 00:10 UTC and `manualChannelSync` as callable?
> 3. Is Video Fetch Retry removed as a separate pipeline (absorbed into Channel Sync)?
> 4. Are there any stale references to `useAutoSync`, `useVideoFetchRetry`, or `fetchVideosBatch` in the codebase? (Run the grep command.)
> 5. Is the notification categories doc updated with new backend sources?
> 6. Does the sync-architecture.md test count match the actual test count from running the suites?
>
> Fix all findings before moving to FINAL.

---

## FINAL Phase: Double Review-Fix Cycle

### R1: Architecture Review

Prompt for review agent:

> Perform a full architecture review of the Channel Sync migration. Read ALL files in `functions/src/channelSync/` and `functions/src/services/channelSync.ts`, plus the modified frontend files.
>
> 1. **Single Responsibility:** Is `ChannelSyncService` focused on one job? Does it avoid mixing concerns with `SyncService` (Trends)?
> 2. **Shared utilities:** Is there code duplicated between `ChannelSyncService` and `SyncService`? (e.g., notification sending, Firestore batch patterns, CDN thumbnail probing). If so, should a shared utility be extracted?
> 3. **Type consistency:** Does backend `SyncSettings` in `functions/src/types.ts` include `frequencyHours` and `lastGlobalSync` fields that align with frontend `SyncSettings` in `src/core/services/settingsService.ts`? Both describe the same Firestore doc `settings/sync` — field names must match exactly.
> 4. **Error propagation:** Does `scheduledChannelSync` properly isolate errors per-user and per-channel? A failure for user A should not affect user B.
> 5. **Callable contract:** Does `manualChannelSync` return the same shape that the frontend expects? Check that `useVideoSync.syncAllVideos` handles the response correctly (or doesn't need to).
> 6. **No dead code:** Are all deleted frontend files truly unreferenced? Run `npm run check` to verify.
> 7. **Test coverage:** Are all new backend code paths covered by tests? Check: cross-cache, API batch, retry logic, notification logic, frequency gate, auth validation.
> 8. **Naming consistency:** Do the new function names (`scheduledChannelSync`, `manualChannelSync`) follow the same pattern as existing functions (`scheduledTrendSnapshot`, `manualTrendSync`)?
> 9. **Previous gates incorporated:** Verify all findings from Review Gates 1-4 have been addressed in the final code.
>
> Report findings. Fix all before R2.

### R2: Production Readiness Review

Prompt for review agent:

> Perform a production readiness review of the Channel Sync migration.
>
> 1. **Race condition eliminated:** The multi-tab race condition from `useAutoSync` — is it truly gone? No frontend timer, no tab focus trigger, only backend cron + manual callable.
> 2. **Frequency respected:** If a user sets frequency to 1 week, does the scheduled function (daily cron) correctly skip until 1 week has passed? Walk through the `lastGlobalSync + frequencyHours` check.
> 3. **API quota safety:** Does the backend correctly handle YouTube quota errors (403)? Does it stop processing remaining chunks? Does it send an appropriate notification?
> 4. **Firestore batch safety:** Are all batch writes below the 500-operation limit? Check the chunking logic.
> 5. **Retry idempotency:** If the scheduled function runs twice (e.g., Cloud Scheduler retry), does `lastGlobalSync` prevent double-sync within the frequency window?
> 6. **Custom video edge cases:** Custom video with `publishedVideoId` + `fetchStatus: 'failed'` + `fetchRetryCount: 7` — is it correctly skipped (no more retries)?
> 7. **Notification consistency:** Do backend notifications match the exact format the frontend UI expects? Check category, type, meta, quotaBreakdown fields against `NotificationDropdown.tsx` rendering logic.
> 8. **Memory/timeout:** Are `512MiB` and `540s` sufficient? The existing `scheduledTrendSnapshot` uses the same limits for iterating all users — but Channel Sync also does YouTube API calls per-user. Consider if this is enough for a user with 200+ videos.
> 9. **Rollback plan:** If the backend sync has a bug, can we quickly revert? The deleted frontend hooks are in git history. Is there a feature flag or kill switch?
> 10. **deleteField() on retry success:** Backend uses Firestore `FieldValue.delete()` to clear `fetchRetryCount`, `lastFetchAttempt`, and `mergedVideoData` on successful retry. Verify this is the correct Admin SDK API (not the client SDK `deleteField()`).
> 11. **Previous gates incorporated:** Verify all findings from Review Gates 1-4 and R1 have been addressed in the final code.
>
> Report findings. Fix all before marking FINAL as DONE.

### Final Verification
```bash
npm run check
npx vitest run --project frontend
npx vitest run --project functions
```

### MANDATORY: Update this file after FINAL
- [ ] Mark FINAL status in table → DONE
- [ ] Record final test count
- [ ] Move this file to `docs/archive/tasks/sync-channel-sync-migration-tasks.md`
- [ ] Update `docs/features/sync-architecture.md` with final test count
