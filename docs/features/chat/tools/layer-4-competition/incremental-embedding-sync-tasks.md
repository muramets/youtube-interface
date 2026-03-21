# Incremental Embedding Sync — Tasks

## Overview

Embedding sync pipeline сейчас при каждом запуске выполняет full scan: `discoverChannels()` → collection group query на `trendChannels` → чтение ВСЕХ видео из ВСЕХ каналов (~5000+ Firestore reads). Большинство видео не менялось — это бессмысленные reads.

Оптимизация: Trends Sync (`syncChannel()`) при записи видео в Firestore сравнивает content-relevant поля (`title`, `tags`, `description`, `thumbnail`) с предыдущими значениями. Изменённые/новые видео попадают в "dirty queue" (`system/embeddingQueue/videos/{videoId}`). Embedding Sync читает только queue вместо full scan.

**Feature doc:** `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md` (архитектура embedding infrastructure)
3. `functions/src/services/sync.ts` (Trends Sync — `syncChannel()`, куда добавляется dirty queue write)
4. `functions/src/embedding/scheduledEmbeddingSync.ts` (launcher, который переключается на queue)
5. `functions/src/embedding/embeddingSyncBatch.ts` (batch processor, изменения в video list source)

### Key Decisions (carry forward)

1. **Queue collection path: `system/embeddingQueue/videos/{videoId}`.** Subcollection под `system/embeddingQueue` doc. Doc ID = YouTube video ID (natural key, дедупликация бесплатная). Альтернатива (flat `embeddingQueue/{videoId}`) отклонена — `system/` уже содержит admin-only docs (`embeddingBudget`, `embeddingStats`, `syncState`), subcollection логически группирует.

2. **Queue entry содержит `youtubeChannelId` + `channelPath` + `enqueuedAt`.** Embedding sync batch'у нужен channelPath для чтения video doc. Без этого batch должен либо заново делать discovery (дорого), либо хранить mapping. Проще записать path при enqueue — sync уже знает `userId`, `userChannelId`, `trendChannelId`. `enqueuedAt` — для мониторинга stale entries.

3. **Dirty detection: сравнение 4 полей (`title`, `tags`, `description`, `thumbnail`).** `viewCount`/`likeCount`/`commentCount` НЕ влияют на embeddings — они меняются каждый sync, но embedding строится из контента. Сравнение через pre-read: `db.getAll()` текущих video docs ПЕРЕД `batch.set()`, сравнение полей. ⚠️ `processOneVideo` должен проверять те же контентные поля — `needsPackaging` проверяет `title`, `tags`, `description`; `needsVisual` и `needsThumbnailDesc` проверяют `thumbnailUrl`. Без этого alignment'а changes "проглатываются" pipeline'ом (queue entry создаётся → processOneVideo считает "all current" → entry удаляется, embedding stale).

4. **Queue write — в том же Firestore batch, что и video write.** Атомарность: видео обновляется И попадает в queue одним commit. Без этого возможен race: видео обновилось, но не попало в queue → embedding stale навсегда.

5. **Fallback на full scan при пустой queue + пустой `globalVideoEmbeddings`.** Первый запуск или после wipe: queue пуста (sync ещё не писал в неё), embeddings пусты → нужен full scan. Если queue пуста, но embeddings есть → значит все embeddings актуальны, ничего не делать. Backfill через existing `backfillEmbeddings` endpoint (не queue).

6. **Queue cleanup: delete из queue ПОСЛЕ успешной обработки.** Failed videos остаются в queue для retry на следующем запуске. Cleanup = simple `doc.delete()` per video в batch processor после `processOneVideo` return `generated` или `alreadyCurrent`.

7. **`batch.set()` для видео продолжает записывать ВСЕ видео (stats update).** Queue — ТОЛЬКО для embedding sync. Trends Sync pipeline не меняется функционально, только добавляется dirty detection + queue write.

8. **Pre-read failure = best-effort degradation.** `db.getAll()` в `syncChannel()` обёрнут в `try/catch`. Если pre-read падает — логируем warning, пропускаем queue writes для этого chunk, video sync продолжает работать как раньше. Queue enrichment — best-effort, video sync — critical path.

9. **`SyncService` использует shared `db` singleton.** Миграция с `admin.firestore()` на `import { db } from "../shared/db.js"` (Phase 0). Alignment с остальными 20+ файлами в `functions/src/`, упрощение моков в тестах.

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes, независимый agent)
- **Parallel tasks** — независимые файлы внутри фазы

### Phase 0 parallelization plan
```
T0.1 — SEQUENTIAL (migrate SyncService to shared db)
T0.2 — SEQUENTIAL (update tests)
→ No Review Gate (mechanical refactor)
```

### Phase 1 parallelization plan
```
T1.1 — SEQUENTIAL FIRST (types + constants)
T1.2 — SEQUENTIAL (queue writer utility)
T1.3 — SEQUENTIAL (fix processOneVideo description check)
T1.4 — SEQUENTIAL LAST (tests)
→ Review Gate 1: subagent
```

### Phase 2 parallelization plan
```
T2.1 — SEQUENTIAL FIRST (integrate queue writer into syncChannel)
T2.2 — SEQUENTIAL (tests for sync integration)
→ Review Gate 2: subagent
```

### Phase 3 parallelization plan
```
T3.1 — SEQUENTIAL FIRST (queue reader utility)
T3.2 — SEQUENTIAL (modify scheduledEmbeddingSync to use queue)
T3.3 — SEQUENTIAL (modify embeddingSyncBatch for queue-sourced video list)
T3.4 — SEQUENTIAL LAST (tests)
→ Review Gate 3: subagent
```

### Phase 4 parallelization plan
```
T4.1 — SEQUENTIAL FIRST (queue cleanup in batch processor)
T4.2 — SEQUENTIAL (fallback logic)
T4.3 — SEQUENTIAL LAST (tests)
→ Review Gate 4: subagent
```

### FINAL phase
```
R1 (Architecture Review) — subagent → fix findings
R2 (Production Readiness) — subagent → fix findings
Final verification — all test suites + lint + typecheck
```

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 0 | Prep: migrate `SyncService` to shared `db` singleton | TODO |
| 1 | Queue infrastructure: types, queue writer utility, processOneVideo fix, tests | TODO |
| 2 | Integrate queue writer into `syncChannel()` | TODO |
| 3 | Switch embedding sync launcher + batch to queue-based discovery | TODO |
| 4 | Queue cleanup + fallback logic | TODO |
| FINAL | Double review-fix cycle (R1: Architecture, R2: Production Readiness) | TODO |

## Current Test Count

- **Frontend: 615 tests (45 files)** — verified via `npx vitest run --project frontend` (2026-03-21)
- **Backend: 876 tests (61 files)** — verified via `npx vitest run --project functions` (2026-03-21)
- **Total: 1491 tests (106 files)** — all passing

---

## Phase 0: Prep — Migrate SyncService to Shared `db`

**Goal:** Перевести `SyncService` с `admin.firestore()` на shared `db` singleton из `../shared/db.js` — alignment с остальным codebase.

### CRITICAL CONTEXT

- ⚠️ `SyncService` — **единственный файл** в `functions/src/`, использующий `private db = admin.firestore()`. Все остальные 20+ файлов (embedding, tools, triggers) используют `import { db } from "../shared/db.js"`.
- ⚠️ Это упрощает Phase 2: `db.getAll()` будет consistent с shared singleton, моки в тестах — через `vi.mock("../shared/db.js")` вместо мока `firebase-admin`.
- ⚠️ Механический рефакторинг: `this.db` → `db` по всему файлу, удалить `private db` property.

### Tasks

- [ ] **T0.1** — Migrate `SyncService` to shared `db`
  - File: `functions/src/services/sync.ts`
  - Changes:
    1. Add `import { db } from "../shared/db.js";`
    2. Remove `private db = admin.firestore();` (line 8)
    3. Replace all `this.db` → `db` throughout the class
    4. Remove `import * as admin from "firebase-admin";` if no longer used (check `admin.firestore.FieldValue.serverTimestamp()` in `sendNotification`)
  - ⚠️ `sendNotification` uses `admin.firestore.FieldValue.serverTimestamp()` — this still needs `admin` import. Keep `import * as admin from "firebase-admin"` but only for `FieldValue`.

- [ ] **T0.2** — Update tests
  - File: `functions/src/services/__tests__/sync.test.ts`
  - Simplify Firestore mock: replace `firebase-admin` mock with `vi.mock("../shared/db.js")` pattern (same as `embeddingSync.test.ts`)
  - All existing tests must pass without behavior change

### Verification

```bash
npx vitest run --project functions     # all existing tests pass
npm run check                          # lint + typecheck
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 0 → DONE

---

## Phase 1: Queue Infrastructure

**Goal:** Создать типы, константы, utility-функцию для записи видео в embedding queue, и синхронизировать `processOneVideo` dirty detection с queue writer.

### CRITICAL CONTEXT

- Queue path: `system/embeddingQueue/videos/{videoId}` — subcollection
- ⚠️ `system/embeddingQueue` parent doc может не существовать в Firestore — subcollection docs создаются без parent doc. Но для чистоты можно создать parent doc при первой записи (или не создавать — Firestore subcollections не требуют parent doc)
- ⚠️ Queue entry должна содержать channelPath (`userId`, `channelId`, `trendChannelId`) — embedding batch processor'у нужен путь для чтения video doc. Альтернатива — заново делать `discoverChannels()` — отклонена (лишние reads)
- ⚠️ `channelTitle` тоже нужен — используется в `processOneVideo` (записывается в `globalVideoEmbeddings/{videoId}.channelTitle`)
- ⚠️ Existing embedding types in `functions/src/embedding/types.ts` — SSOT. Новый interface `EmbeddingQueueEntry` добавляется туда же
- ⚠️ Dirty detection utility: pure function, без I/O. Принимает `previousData` (может быть `undefined` для нового видео) и `currentData`, возвращает `boolean`. Поля для сравнения: `title`, `tags` (массив — deep compare через `JSON.stringify`), `description`, `thumbnail`

### Tasks

- [ ] **T1.1** — Types и constants
  - File: `functions/src/embedding/types.ts`
  - Add interface `EmbeddingQueueEntry`:
    ```typescript
    export interface EmbeddingQueueEntry {
        videoId: string;
        youtubeChannelId: string;
        channelTitle: string;
        userId: string;
        channelId: string;
        trendChannelId: string;
        enqueuedAt: number;  // epoch ms
    }
    ```
  - Add constant:
    ```typescript
    /** Firestore path for embedding dirty queue */
    export const EMBEDDING_QUEUE_PATH = "system/embeddingQueue/videos";
    ```
  - ⚠️ НЕ добавлять content fields (title, tags, description) в queue entry — они читаются из video doc при обработке (свежие данные). Queue = только "какое видео обработать" + "где его найти"
  - **N2 fix (R2-F2):** Reuse `ChannelPath` в `SyncState.channelPaths`:
    1. Move `ChannelPath` interface from `embeddingSync.ts` to `types.ts` (SSOT)
    2. Re-export from `embeddingSync.ts`: `export type { ChannelPath } from "./types.js"` (backwards compat for `backfillEmbeddings.ts`)
    3. Update `SyncState.channelPaths` type: inline shape → `Record<string, ChannelPath>`
    4. Update `BackfillState.channelPaths` too (same shape)
    5. Files affected: `types.ts`, `embeddingSync.ts`, `scheduledEmbeddingSync.ts`, `backfillEmbeddings.ts`

- [ ] **T1.2** — Queue writer utility
  - Create: `functions/src/embedding/embeddingQueue.ts`
  - Functions:
    - `isContentChanged(previous: Record<string, unknown> | undefined, current: { title: string; tags: string[]; description: string; thumbnail: string }): boolean`
      - `previous === undefined` → return `true` (new video)
      - Compare 4 fields: `title`, `tags` (via `JSON.stringify` — order matters, YouTube API returns tags in consistent order), `description`, `thumbnail`
      - Any field differs → `true`
      - All same → `false`
      - ⚠️ `previous` typed as `Record<string, unknown>` because it comes from Firestore `doc.data()` — need safe access with fallback defaults
    - `enqueueVideoForEmbedding(batch: FirebaseFirestore.WriteBatch, entry: EmbeddingQueueEntry): void`
      - Adds a `batch.set()` operation for `system/embeddingQueue/videos/{entry.videoId}`
      - Uses `{ merge: true }` — idempotent (re-enqueue same videoId = overwrite, not duplicate)
      - ⚠️ Accepts `batch` parameter — caller adds to their existing batch for atomicity. Function does NOT commit
      - ⚠️ Uses `db.doc()` for path construction — import `db` from `../../shared/db.js`
  - ⚠️ `isContentChanged` is a pure function (no I/O). Separate from `enqueueVideoForEmbedding` (I/O via batch) — clean separation per project conventions
  - ⚠️ Import `EMBEDDING_QUEUE_PATH` from `./types.js`

- [ ] **T1.3** — Fix `processOneVideo` description check (N7 + R2-F1)
  - **R2-F1 blocker:** `EmbeddingDoc` **не хранит** `description`. Если просто добавить `existingDoc.description !== description` → `undefined !== "any string"` → всегда `true` → каждое видео re-embedded каждый sync (regression к full regeneration). Нужно два изменения:
  - **Step 1 — Add `description` to `EmbeddingDoc`:**
    - File: `functions/src/embedding/types.ts`
    ```typescript
    export interface EmbeddingDoc {
        // ... existing fields ...
        /** Stored for dirty detection (description changes trigger re-embedding) */
        description?: string;
    }
    ```
  - **Step 2 — Write `description` in `processOneVideo`:**
    - File: `functions/src/embedding/processOneVideo.ts`
    - Add `description` to the `docData` object that gets written to `globalVideoEmbeddings/{videoId}`:
    ```typescript
    const docData = {
        // ... existing fields ...
        description,  // ← ADD: store for dirty detection
    };
    ```
  - **Step 3 — Add `description` to `needsPackaging` check:**
    - File: `functions/src/embedding/processOneVideo.ts`
    ```typescript
    const needsPackaging = !existingDoc
        || (existingDoc.packagingEmbeddingVersion ?? 0) < CURRENT_PACKAGING_MODEL_VERSION
        || existingDoc.title !== title
        || existingDoc.description !== description   // ← ADD THIS
        || JSON.stringify(existingDoc.tags) !== JSON.stringify(tags);
    ```
  - **Step 3b — Add `thumbnailUrl` to `needsVisual` and `needsThumbnailDesc` checks:**
    - File: `functions/src/embedding/processOneVideo.ts`
    - Pre-existing bug: thumbnail URL change detected by `isContentChanged` → video queued → but `processOneVideo` checks only model version / null description → `alreadyCurrent` → stale visual embedding + thumbnail description
    - `thumbnailUrl` already stored in `EmbeddingDoc` — no migration needed (unlike `description`)
    ```typescript
    const needsVisual = !existingDoc
        || existingDoc.thumbnailUrl !== thumbnailUrl   // ← ADD
        || ((existingDoc.visualEmbeddingVersion ?? 0) < CURRENT_VISUAL_MODEL_VERSION
            && !existingDoc.thumbnailUnavailable);

    const needsThumbnailDesc = !existingDoc
        || existingDoc.thumbnailUrl !== thumbnailUrl   // ← ADD
        || (existingDoc.thumbnailDescription == null
            && !existingDoc.thumbnailUnavailable);
    ```
  - ⚠️ `description` уже доступна в `processOneVideo` (читается из video doc и передаётся в `generatePackagingEmbedding`)
  - ⚠️ Добавить тесты в `processOneVideo.test.ts`:
    - description changed, title/tags same → `needsPackaging = true`, returns `generated`
    - thumbnailUrl changed, model version same → `needsVisual = true` + `needsThumbnailDesc = true`, returns `generated`
  - **Step 4 — One-time migration script (backfill `description` into existing EmbeddingDocs):**
    - File: `functions/src/embedding/backfillEmbeddings.ts` (add new exported function `backfillDescriptions`)
    - Logic:
      1. `discoverChannels()` → get all channel paths
      2. For each channel: read all video docs from `trendChannels/{id}/videos/` → collect `{ videoId, description }`
      3. Batch-write `description` into `globalVideoEmbeddings/{videoId}` (merge, NOT overwrite) — only Firestore writes, zero Gemini/Vertex API calls
      4. Skip videos that already have `description` field (idempotent)
    - Expose as Cloud Function HTTP endpoint (same pattern as existing `backfillEmbeddings`)
    - ⚠️ **Run once after deploy, before first embedding sync.** Prevents false-positive `needsPackaging = true` from `undefined !== string`
    - ⚠️ Without this migration: every video re-embedded unnecessarily (budget drain, days to complete through $5/month limit)
    - ⚠️ With this migration: only videos with genuinely changed descriptions trigger re-embedding

- [ ] **T1.4** — Tests
  - Create: `functions/src/embedding/__tests__/embeddingQueue.test.ts`
  - Mock: `db` (Firestore admin) — same pattern as `embeddingSync.test.ts`
  - Cases for `isContentChanged`:
    - `previous === undefined` (new video) → returns `true`
    - Same title, tags, description, thumbnail → returns `false`
    - Title changed → returns `true`
    - Tags changed (different array) → returns `true`
    - Tags reordered (same elements, different order) → returns `true` (JSON.stringify order-sensitive — correct, YouTube API is consistent)
    - Description changed → returns `true`
    - Thumbnail changed → returns `true`
    - `viewCount` changed, content same → returns `false` (viewCount is NOT a content field)
    - Previous has missing fields (e.g., no `description` key) → treats as changed (undefined !== string)
  - Cases for `enqueueVideoForEmbedding`:
    - Adds `batch.set()` with correct path (`system/embeddingQueue/videos/{videoId}`)
    - Uses `{ merge: true }` option
    - Entry data matches `EmbeddingQueueEntry` shape
    - Does NOT call `batch.commit()` (caller's responsibility)

### Verification

```bash
npx vitest run --project functions     # backend tests pass (incl. new)
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 1 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 1

**Prompt:** "Review Phase 1 of Incremental Embedding Sync (queue infrastructure + processOneVideo fix). Read `docs/features/chat/tools/layer-4-competition/incremental-embedding-sync-tasks.md` for context. Check:
1. Does `EmbeddingQueueEntry` in `functions/src/embedding/types.ts` contain all fields needed by embedding batch processor? (`videoId`, `youtubeChannelId`, `channelTitle`, `userId`, `channelId`, `trendChannelId`, `enqueuedAt`)
2. Does `EmbeddingQueueEntry` correctly OMIT content fields (title, tags, description)? Content must be read from video doc at processing time for freshness.
3. Is `EMBEDDING_QUEUE_PATH` a constant in `types.ts` (not hardcoded in queue writer)?
4. Is `isContentChanged` a pure function with zero I/O? Does it correctly compare 4 fields: title, tags (JSON.stringify), description, thumbnail?
5. Does `isContentChanged` return `true` when `previous === undefined` (new video)?
6. Does `isContentChanged` ignore `viewCount`/`likeCount`/`commentCount` changes?
7. Does `enqueueVideoForEmbedding` accept a `WriteBatch` parameter (not create its own)?
8. Does `enqueueVideoForEmbedding` use `{ merge: true }` for idempotency?
9. **R2-F1 schema:** Is `description?: string` added to `EmbeddingDoc` interface in `types.ts`?
10. **R2-F1 write:** Is `description` written to `docData` in `processOneVideo` (stored in `globalVideoEmbeddings`)?
11. **N7 fix:** Does `processOneVideo.needsPackaging` now check `description` alongside `title` and `tags`?
12. **Thumbnail fix:** Do `needsVisual` and `needsThumbnailDesc` check `existingDoc.thumbnailUrl !== thumbnailUrl`?
13. **Filter alignment:** Do `isContentChanged` (4 fields) and `processOneVideo` checks (`needsPackaging` + `needsVisual` + `needsThumbnailDesc`) agree on all content fields?
11. Are tests comprehensive? (new video, unchanged, each field changed individually, viewCount-only change, missing previous fields, description-only change in processOneVideo)
12. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 2.

---

## Phase 2: Integrate Queue Writer into syncChannel()

**Goal:** Модифицировать `SyncService.syncChannel()` для записи изменённых/новых видео в embedding queue атомарно с video data update.

### CRITICAL CONTEXT

- ⚠️ `syncChannel()` in `functions/src/services/sync.ts` обрабатывает видео chunk'ами (Firestore batch limit 500). Внутри каждого chunk: `batch.set(videoRef, {...}, { merge: true })`. Queue write добавляется в ТОТ ЖЕ batch.
- ⚠️ Batch size: декларативная формула `(500 - 50 margin) / 2 ops = 225`. Каждое видео = до 2 ops (1 video write + 1 queue write в worst case). Safety margin 50 — buffer для будущих операций.
- ⚠️ Pre-read для dirty detection: перед batch нужно прочитать текущие video docs, чтобы сравнить content fields. Firestore `getAll()` для batch read: `db.getAll(...refs)` — один RPC call для всех docs в chunk. Возвращает массив `DocumentSnapshot[]`.
- ⚠️ `syncChannel` принимает `trendChannel: TrendChannel`, `userId: string`, `userChannelId: string` — все нужные данные для `EmbeddingQueueEntry` доступны.
- ⚠️ CDN probes for thumbnail (lines 71-89): thumbnail URL определяется ПЕРЕД записью. Dirty detection должна сравнивать финальный thumbnail URL (после probes) с предыдущим.
- ⚠️ Performance impact: добавляется 1 `db.getAll()` per chunk (batch read текущих docs) — это ~225 reads per chunk. Для канала с 500 видео = 3 chunk'а = 500 reads. Это новые reads, но заменяют ~5000 reads, которые сейчас делает embedding sync.
- ⚠️ Error resilience: `db.getAll()` обёрнут в `try/catch`. Если падает — video sync продолжает без queue writes. Queue enrichment = best-effort, video sync = critical path (Key Decision 8).
- ⚠️ `syncChannel` вызывается из двух мест: `scheduledTrendSnapshot` (daily cron) и `manualTrendSync` (user-triggered). Оба должны писать в queue — queue writer интегрируется в `SyncService`, не в callers.

### Tasks

- [ ] **T2.1** — Modify `SyncService.syncChannel()` to detect changes and enqueue
  - File: `functions/src/services/sync.ts`
  - Changes:
    1. Add imports at top:
       ```typescript
       import { isContentChanged, enqueueVideoForEmbedding } from "../embedding/embeddingQueue.js";
       import type { EmbeddingQueueEntry } from "../embedding/types.js";
       ```
       ⚠️ `EMBEDDING_QUEUE_PATH` НЕ импортировать — он используется внутри `enqueueVideoForEmbedding`, не в `sync.ts` напрямую (N5).
    2. **Declarative batch size** — заменить magic number на self-documenting формулу:
       ```typescript
       const FIRESTORE_BATCH_LIMIT = 500;
       const OPS_PER_VIDEO = 2;        // 1 video write + 1 potential queue write
       const BATCH_SAFETY_MARGIN = 50;  // buffer for future ops
       const batchSize = Math.floor((FIRESTORE_BATCH_LIMIT - BATCH_SAFETY_MARGIN) / OPS_PER_VIDEO);
       // = 225
       ```
       Читатель видит *почему* 225. Если добавится третья операция — меняется `OPS_PER_VIDEO = 3`, batch пересчитывается автоматически (C1).
    3. Inside the chunk loop, BEFORE creating the Firestore batch — pre-read existing docs **в try/catch** (C3):
       ```typescript
       let existingDocsMap = new Map<string, Record<string, unknown>>();
       try {
           if (videoRefs.length > 0) {
               const existingDocs = await db.getAll(...videoRefs);
               for (const snap of existingDocs) {
                   if (snap.exists) {
                       existingDocsMap.set(snap.id, snap.data() as Record<string, unknown>);
                   }
               }
           }
       } catch (err) {
           logger.warn("syncChannel:embeddingQueuePreReadFailed", { error: err, channel: trendChannel.id });
           // proceed without queue writes — embedding sync will catch up on next run
       }
       ```
       ⚠️ Если pre-read падает — video sync продолжает как раньше, queue writes пропускаются для этого chunk. Queue enrichment = best-effort.
    4. Inside `chunk.forEach()`, after computing final `thumbnail` from `thumbnailMap`:
       - Get `previousData` from the pre-read map: `existingDocsMap.get(v.id)`
       - Build `currentContent = { title: v.snippet.title, tags: v.snippet.tags || [], description: v.snippet.description || '', thumbnail: thumbnailMap.get(v.id) || '' }`
       - Call `isContentChanged(previousData, currentContent)`
       - If changed → call `enqueueVideoForEmbedding(batch, { videoId: v.id, youtubeChannelId: trendChannel.id, channelTitle: trendChannel.name, userId, channelId: userChannelId, trendChannelId: trendChannel.id, enqueuedAt: timestamp })`
       ⚠️ `channelTitle: trendChannel.name` — НЕ `v.snippet.channelTitle`. Alignment с `embeddingSyncBatch` который использует `cp.channelTitle` из `ChannelPath` (N1).
    5. The existing `batch.set(videoRef, {...}, { merge: true })` remains UNCHANGED — all videos still get stats updated.
  - ⚠️ `chunk.forEach()` callback currently does NOT have access to `userId`, `userChannelId` — these are in the outer scope of `syncChannel()`. This is fine — closure captures them.
  - ⚠️ `thumbnailMap.get(v.id)` is available inside the forEach — it's populated by CDN probes before the forEach loop.
  - ⚠️ `db.getAll()` returns `DocumentSnapshot[]` — some may not exist (`snap.exists === false`) for new videos. Map should only include existing docs.

- [ ] **T2.2** — Tests for sync integration
  - File: `functions/src/services/__tests__/sync.test.ts`
  - Add/modify test cases:
    - **New video** (not in Firestore): `isContentChanged` gets `undefined` → queue write added to batch
    - **Existing video, title changed**: queue write added to batch
    - **Existing video, only viewCount changed**: NO queue write (content unchanged)
    - **Existing video, tags changed**: queue write added
    - **Existing video, thumbnail changed** (CDN probe upgraded URL): queue write added
    - **Batch size verification**: confirm batch does not exceed 500 ops (225 videos max per chunk)
    - **Multiple chunks**: channel with >225 videos — verify chunks process correctly
    - **Pre-read failure**: `db.getAll()` throws → video sync completes, queue writes skipped (C3)
  - ⚠️ **Fix existing test** "uses multiple Firestore batches for >400 videos" (N9): update title, comment, fixture count to reflect new `batchSize` (225 instead of 400). E.g., 300 videos → 2 batches (225 + 75).
  - Mock targets: after Phase 0 migration, mock `db` via `vi.mock("../shared/db.js")` + mock `isContentChanged` and `enqueueVideoForEmbedding` from `../embedding/embeddingQueue.js`
  - ⚠️ Add `getAll` to the mock `db` instance:
    ```typescript
    const mockGetAll = vi.fn().mockResolvedValue([]);
    // inside mock db:
    getAll: (...refs: unknown[]) => mockGetAll(...refs),
    ```

### Verification

```bash
npx vitest run --project functions     # backend tests pass
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 2 → DONE
- [ ] Record test count

### Review Gate 2

**Prompt:** "Review Phase 2 of Incremental Embedding Sync (syncChannel integration). Read `functions/src/services/sync.ts` and `functions/src/embedding/embeddingQueue.ts`. Check:
1. Is `batchSize` computed via declarative formula (`(500 - margin) / ops`)? Is the math correct? Are constants named and self-documenting?
2. Does `syncChannel()` pre-read existing video docs via `db.getAll()` BEFORE the batch? Is this one RPC call per chunk (not per video)?
3. Is `db.getAll()` + dirty detection wrapped in `try/catch`? Does failure log warning and skip queue writes (not break video sync)?
4. Is dirty detection comparing the 4 correct fields: `title`, `tags`, `description`, `thumbnail`?
5. Is `enqueueVideoForEmbedding` called with the SAME `batch` instance as video writes? (atomicity guarantee)
6. Does the queue entry use `trendChannel.name` for `channelTitle` (NOT `v.snippet.channelTitle`)?
7. Is the existing `batch.set(videoRef, {...})` for video data UNCHANGED? (all videos still get stats updated regardless of content changes)
8. Does the code handle new videos (existingDoc doesn't exist → `isContentChanged(undefined, ...)` → true)?
9. Are CDN probe results (thumbnailMap) used in dirty detection? (comparing final thumbnail URL, not API-provided one)
10. Are tests verifying that `viewCount`-only changes do NOT trigger queue writes?
11. Is `EMBEDDING_QUEUE_PATH` NOT imported in `sync.ts`? (it's used inside `enqueueVideoForEmbedding`, not by caller)
12. Is the existing ">400 videos" test updated for new batchSize?
13. Is there a test for `db.getAll()` failure → video sync continues?
14. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 3.

---

## Phase 3: Switch Embedding Sync to Queue-Based Discovery

**Goal:** Заменить full-scan discovery в `scheduledEmbeddingSync` на чтение embedding queue. Адаптировать `embeddingSyncBatch` для работы с queue-sourced video list.

### CRITICAL CONTEXT

- ⚠️ Текущий flow: `scheduledEmbeddingSync` → `discoverChannels()` (collection group query) → для каждого канала: read ALL video docs → build `SyncState.videos[]` → write `system/syncState` → enqueue first batch. **Это то, что заменяется.**
- ⚠️ Новый flow: `scheduledEmbeddingSync` → read `system/embeddingQueue/videos` collection → build `SyncState.videos[]` from queue entries → write `system/syncState` (same format!) → enqueue first batch. **Batch processor (`embeddingSyncBatch`) почти не меняется** — он уже читает `SyncState.videos[]` и `SyncState.channelPaths`.
- ⚠️ `SyncState.channelPaths` заполняется из queue entries (каждая entry содержит `userId`, `channelId`, `trendChannelId`, `channelTitle`) — НЕ из `discoverChannels()`.
- ⚠️ `SyncState.coverageByChannel` — в текущей реализации `total` per channel заполняется launcher'ом (подсчёт video docs). При queue-based flow мы НЕ знаем total per channel без full scan. **Решение:** `finalize()` читает актуальный `videoCount` из `trendChannels/{id}` doc (Trends Sync записывает его на каждом синке — `sync.ts:176`). Один `db.getAll()` по уникальным channel paths из `SyncState.channelPaths` → свежий `total` для каждого канала. Нет stale, нет circular dependency.
- ⚠️ `scheduledEmbeddingSync` больше НЕ импортирует `discoverChannels` из `embeddingSync.ts`. Но `backfillEmbeddings.ts` и `embeddingSync.ts` (discoverChannels) остаются — они нужны для backfill/first-run fallback (Phase 4).
- ⚠️ Queue может содержать записи для видео с разных каналов одного YouTube channel (multiple users tracking same channel). `channelPaths` dedup: для одного `youtubeChannelId` хранить ОДИН path (первый встреченный) — как в `discoverChannels`.
- ⚠️ Canary log: текущий `if (videos.length > 12_000)` warning остаётся — queue может быть большой после первого sync с queue writer или при массовом контент-апдейте.
- ⚠️ Empty queue = nothing to do (log + return). Fallback на full scan — Phase 4.

### Tasks

- [ ] **T3.1** — Queue reader utility
  - File: `functions/src/embedding/embeddingQueue.ts` (extend existing file from Phase 1)
  - Add function:
    ```typescript
    export async function readEmbeddingQueue(): Promise<{
        videos: Array<{ videoId: string; youtubeChannelId: string }>;
        channelPaths: Record<string, ChannelPath>;
        queueSize: number;
    }>
    ```
  - Logic:
    1. `const snapshot = await db.collection(EMBEDDING_QUEUE_PATH).get()`
    2. Iterate docs, build:
       - `videos[]` — `{ videoId: doc.id, youtubeChannelId: entry.youtubeChannelId }`
       - `channelPaths` — keyed by `youtubeChannelId`, first path wins (dedup)
    3. Sort `videos` by `videoId` (deterministic, same as current sync)
    4. Return `{ videos, channelPaths, queueSize: snapshot.size }`
  - ⚠️ Import `ChannelPath` from `./embeddingSync.js` — reuse existing interface
  - ⚠️ Return type uses `ChannelPath` (same shape as `discoverChannels` output) for compatibility with `SyncState.channelPaths`

- [ ] **T3.2** — Modify `scheduledEmbeddingSync` to use queue
  - File: `functions/src/embedding/scheduledEmbeddingSync.ts`
  - Changes:
    1. Replace `import { discoverChannels } from "./embeddingSync.js"` with `import { readEmbeddingQueue } from "./embeddingQueue.js"`
       ⚠️ Этот import `discoverChannels` будет **возвращён в Phase 4** для fallback path (S3).
    2. Replace discovery section (lines 35-56) with:
       ```typescript
       const { videos, channelPaths, queueSize } = await readEmbeddingQueue();

       if (videos.length === 0) {
           logger.info("scheduledEmbeddingSync:emptyQueue");
           return;
       }
       ```
    3. Remove per-channel video collection loop (lines 43-56) — videos come from queue now
    4. `coverageByChannel` initialization: set `total: 0` for each channel (placeholder — finalize will read actual `videoCount` from trendChannels docs).
    5. Add `queueSize` to launch log: `logger.info("scheduledEmbeddingSync:launched", { queueSize, totalVideos: videos.length, ... })`
    6. Rest of function (canary log, syncState write, enqueue first batch) stays the same — `SyncState` format is unchanged
  - ⚠️ `videos.length` и `queueSize` могут отличаться — queue может иметь duplicates for same videoId from different users. But `readEmbeddingQueue` deduplicates by videoId (doc ID is unique). So they should be equal. Log both for debugging.

- [ ] **T3.3** — Fresh `coverageByChannel.total` from trendChannels docs
  - File: `functions/src/embedding/embeddingSyncBatch.ts`
  - Strategy (N4): `finalize()` читает актуальный `videoCount` из trendChannels docs — Trends Sync записывает его на каждом синке (`sync.ts:176`), поэтому значение всегда свежее.
  - Change in `finalize()` function:
    1. Collect unique channel paths from `finalState.channelPaths`
    2. Build refs: `db.doc(\`users/${cp.userId}/channels/${cp.channelId}/trendChannels/${cp.trendChannelId}\`)` for each channel
    3. `db.getAll(...refs)` — один RPC call
    4. Extract `videoCount` from each doc → use as `total` in `coverageStats`
    5. If doc doesn't exist or `videoCount` missing → fallback `total: 0`
  - ⚠️ `db.getAll()` wrapped in `try/catch` + empty array guard (R2-F3) — same pattern as T2.1. При ошибке → fallback `total: 0` (лучше записать 0 чем сломать finalize → stale syncState)
  - ⚠️ `finalize()` уже делает read of `system/embeddingBudget` — adding one `db.getAll()` is acceptable
  - ⚠️ Не circular dependency: finalize читает из `trendChannels` (другая коллекция), пишет в `embeddingStats`

- [ ] **T3.4** — Tests
  - Create/update: `functions/src/embedding/__tests__/embeddingQueue.test.ts` (extend from Phase 1)
  - Add cases for `readEmbeddingQueue`:
    - Queue with 3 entries for 2 channels → returns 3 videos, 2 channelPaths
    - Queue with entries from multiple users for same YouTube channel → channelPaths deduplicates (first wins)
    - Empty queue → returns `{ videos: [], channelPaths: {}, queueSize: 0 }`
    - Videos sorted by videoId (deterministic)
  - Update: `functions/src/embedding/__tests__/embeddingSyncBatch.test.ts`
    - Update existing tests if `finalize` behavior changed (coverage totals source)
  - Create/update: test for `scheduledEmbeddingSync` logic (if separate test file exists — otherwise add to embeddingSyncBatch tests)
    - Mock `readEmbeddingQueue` instead of `discoverChannels`
    - Empty queue → early return with info log
    - Non-empty queue → writes syncState with queue-sourced videos and channelPaths

### Verification

```bash
npx vitest run --project functions     # backend tests pass
npm run check                          # lint + typecheck + doc links
cd functions && npm run build          # compiles (import changes)
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 3 → DONE
- [ ] Record test count

### Review Gate 3

**Prompt:** "Review Phase 3 of Incremental Embedding Sync (queue-based discovery). Read `functions/src/embedding/scheduledEmbeddingSync.ts`, `functions/src/embedding/embeddingQueue.ts`, `functions/src/embedding/embeddingSyncBatch.ts`. Check:
1. Does `readEmbeddingQueue()` read from `system/embeddingQueue/videos` collection?
2. Does `readEmbeddingQueue()` deduplicate channelPaths by `youtubeChannelId` (first path wins)?
3. Does `readEmbeddingQueue()` sort videos by `videoId` (deterministic)?
4. Does `readEmbeddingQueue()` return type match what `SyncState` expects? (`videos[]` with `videoId` + `youtubeChannelId`, `channelPaths` as `Record<string, ChannelPath>`)
5. Is `scheduledEmbeddingSync` NO LONGER importing `discoverChannels`? Is it using `readEmbeddingQueue` instead?
6. Is the per-channel video collection loop REMOVED from `scheduledEmbeddingSync`? (no more reading all video docs from all channels)
7. Does `finalize()` in `embeddingSyncBatch` read `videoCount` from `trendChannels` docs via `db.getAll()`? Is this value used as `total` in coverageStats? No stale data, no circular dependency?
8. Is `SyncState` format UNCHANGED? (batch processor compatibility — `videos[]`, `channelPaths`, counters)
9. Does empty queue result in early return (not error)?
10. Does `cd functions && npm run build` compile without errors?
11. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 4.

---

## Phase 4: Queue Cleanup + Fallback Logic

**Goal:** Добавить cleanup обработанных entries из queue и fallback на full scan при первом запуске.

### CRITICAL CONTEXT

- ⚠️ Cleanup timing: **per-batch** (НЕ per-video). После обработки всех видео в batch, собрать успешные videoIds → удалить из queue одним `WriteBatch`. Failed videos (`status === "failed"`) остаются в queue для retry.
- ⚠️ Cleanup atomicity: cleanup НЕ нужно делать в том же batch, что и embedding write — embedding записывается в `globalVideoEmbeddings/{videoId}`, queue entry в `system/embeddingQueue/videos/{videoId}`. Это разные коллекции. Отдельный `WriteBatch` для cleanup.
- ⚠️ Resilience: если crash между обработкой и cleanup → видео остаются в queue → retry на следующем запуске → idempotent (`processOneVideo` вернёт `alreadyCurrent`). Batch delete per-chunk (100 videos) — acceptable trade-off.
- ⚠️ Fallback logic location: в `scheduledEmbeddingSync`, после `readEmbeddingQueue()` returns empty. Check `globalVideoEmbeddings` collection: если пуста → fall back to `discoverChannels()` + per-channel video reads (original full scan logic). Если не пуста → queue empty means all embeddings current → nothing to do.
- ⚠️ `globalVideoEmbeddings` emptiness check: `db.collection("globalVideoEmbeddings").limit(1).get()` → `snap.empty` → true means need full scan. One read, not count query.
- ⚠️ `backfillEmbeddings` endpoint NOT affected — it always does full scan via `discoverChannels()`. Queue is only for scheduled incremental sync.
- ⚠️ `discoverChannels` import: `scheduledEmbeddingSync` needs to RE-ADD conditional import of `discoverChannels` for fallback path. Or: keep import but only call it in fallback branch.

### Tasks

- [ ] **T4.1** — Queue cleanup in batch processor
  - File: `functions/src/embedding/embeddingSyncBatch.ts`
  - Changes in `processSyncBatch`:
    1. After processing all videos in batch, collect videoIds where `processOneVideo` returned `status === "generated"` or `status === "alreadyCurrent"` (NOT `"failed"`)
    2. Delete from queue in a Firestore WriteBatch:
       ```typescript
       const cleanupBatch = db.batch();
       for (const videoId of successfulVideoIds) {
           cleanupBatch.delete(db.doc(`${EMBEDDING_QUEUE_PATH}/${videoId}`));
       }
       if (successfulVideoIds.length > 0) {
           await cleanupBatch.commit();
       }
       ```
    3. Log cleanup count: `logger.info("embeddingSyncBatch:queueCleanup", { cleaned: successfulVideoIds.length, failed: failedVideoIds.length })`
  - ⚠️ Import `EMBEDDING_QUEUE_PATH` from `./types.js`
  - ⚠️ Cleanup is best-effort — if cleanup batch fails, videos stay in queue → retry next run → idempotent (processOneVideo will return `alreadyCurrent`)
  - ⚠️ Firestore WriteBatch limit = 500. Batch size = 100 videos (SYNC_BATCH_SIZE). 100 deletes < 500 limit → safe in single batch.

- [ ] **T4.2** — Fallback logic in launcher
  - File: `functions/src/embedding/scheduledEmbeddingSync.ts`
  - Changes:
    1. Keep import of `discoverChannels` from `./embeddingSync.js` (needed for fallback)
    2. After `readEmbeddingQueue()` returns empty:
       ```typescript
       if (videos.length === 0) {
           // Check if this is first run (no embeddings exist yet)
           const embeddingsCheck = await db.collection("globalVideoEmbeddings").limit(1).get();
           if (embeddingsCheck.empty) {
               logger.info("scheduledEmbeddingSync:fallbackFullScan", {
                   reason: "empty queue + empty globalVideoEmbeddings = first run",
               });
               // Fall back to full scan (original logic)
               // ... call discoverChannels() + per-channel video reads
           } else {
               logger.info("scheduledEmbeddingSync:emptyQueue", {
                   reason: "all embeddings current",
               });
               return;
           }
       }
       ```
    3. Extract the full-scan logic into a helper function `buildSyncStateFromFullScan()` to avoid duplicating the original discovery + video collection code:
       ```typescript
       async function buildSyncStateFromFullScan(): Promise<{
           videos: SyncState["videos"];
           channelPaths: SyncState["channelPaths"];
           coverageByChannel: SyncState["coverageByChannel"];
       } | null>
       ```
       This function contains the original logic (discoverChannels → per-channel video reads → build lists). Returns `null` if no channels/videos found.
    4. Main flow:
       - Try queue first → if non-empty, use queue data
       - If queue empty + embeddings empty → call `buildSyncStateFromFullScan()`
       - If queue empty + embeddings exist → nothing to do, return
  - ⚠️ `buildSyncStateFromFullScan` is a LOCAL function in `scheduledEmbeddingSync.ts` — not exported. It's the fallback path, not the normal path.
  - ⚠️ The fallback path ALSO needs to write videos into the queue (for future runs)? **NO** — the fallback is a one-time bootstrap. After this run, Trends Sync will start writing to the queue, and future embedding syncs will use it.

- [ ] **T4.3** — Tests
  - Update: `functions/src/embedding/__tests__/embeddingSyncBatch.test.ts`
    - Add case: successful videos cleaned from queue (batch.delete called with correct paths)
    - Add case: failed videos NOT cleaned from queue (remain for retry)
    - Add case: mix of successful + failed → only successful cleaned
    - Add case: cleanup batch failure → processing still succeeds (best-effort)
  - Update/create: test for scheduler fallback
    - Queue empty + `globalVideoEmbeddings` empty → falls back to full scan
    - Queue empty + `globalVideoEmbeddings` has docs → returns early (nothing to do)
    - Queue non-empty → uses queue data (no fallback check)

### Verification

```bash
npx vitest run --project functions     # backend tests pass
npm run check                          # lint + typecheck + doc links
cd functions && npm run build          # compiles
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 4 → DONE
- [ ] Record test count

### Review Gate 4

**Prompt:** "Review Phase 4 of Incremental Embedding Sync (cleanup + fallback). Read `functions/src/embedding/embeddingSyncBatch.ts` and `functions/src/embedding/scheduledEmbeddingSync.ts`. Check:
1. Does queue cleanup happen per-batch (after processing all videos in batch), NOT per-video and NOT in finalize?
2. Are only SUCCESSFUL videos (generated + alreadyCurrent) cleaned from queue? Failed videos remain?
3. Is cleanup using a separate `WriteBatch` (not the same as embedding writes)?
4. Is cleanup best-effort (wrapped in try/catch or fire-and-forget)?
5. Does the cleanup batch stay within 500 ops limit? (SYNC_BATCH_SIZE = 100 < 500)
6. Does fallback check `globalVideoEmbeddings` emptiness with `limit(1).get()` (not count query)?
7. Is fallback triggered ONLY when queue is empty AND globalVideoEmbeddings is empty?
8. Does the fallback path use `discoverChannels()` + per-channel video reads (same as original full scan)?
9. Is `buildSyncStateFromFullScan` a LOCAL function (not exported)?
10. Does the main flow prefer queue → fallback → nothing, in that order?
11. Is `backfillEmbeddings.ts` UNCHANGED? (backfill always does full scan, independent of queue)
12. Run `npx vitest run --project functions && npm run check && cd functions && npm run build`."

Fix all findings before moving to FINAL.

---

## FINAL: Double Review-Fix Cycle

### R1: Architecture Review

Spawn a review agent:

**Prompt:** "Architecture review of Incremental Embedding Sync. Read these files:
- `docs/features/chat/tools/layer-4-competition/incremental-embedding-sync-tasks.md` (Key Decisions)
- `functions/src/embedding/embeddingQueue.ts`
- `functions/src/embedding/types.ts` (new EmbeddingQueueEntry, EMBEDDING_QUEUE_PATH)
- `functions/src/services/sync.ts` (syncChannel changes)
- `functions/src/embedding/scheduledEmbeddingSync.ts` (queue-based launcher)
- `functions/src/embedding/embeddingSyncBatch.ts` (cleanup logic)

Check ALL:

1. **Queue writer purity:** `isContentChanged` is a pure function (no I/O, no side effects)? `enqueueVideoForEmbedding` only adds to batch (no commit)?
2. **Atomicity:** Queue writes happen in the SAME Firestore batch as video data writes in `syncChannel()`? Impossible to update video without queue entry (or vice versa)?
3. **Batch size safety:** `batchSize` in `syncChannel` computed via declarative formula with named constants? Worst case: N video writes + N queue writes + safety margin <= 500?
4. **Pre-read optimization:** `db.getAll()` used for batch read of existing docs (not N individual reads)? Wrapped in `try/catch` with graceful degradation?
5. **Content field correctness:** Only `title`, `tags`, `description`, `thumbnail` trigger queue entry — NOT `viewCount`, `likeCount`, `commentCount`?
6. **Queue → SyncState compatibility:** `readEmbeddingQueue` output maps correctly to `SyncState.videos[]` and `SyncState.channelPaths`? No type mismatches?
7. **Cleanup correctness:** Per-batch cleanup. Only `generated` + `alreadyCurrent` videos removed from queue, `failed` retained for retry?
8. **Fallback correctness:** First run (empty queue + empty embeddings) → full scan. Empty queue + embeddings exist → no-op. Non-empty queue → normal processing.
9. **Backfill independence:** `backfillEmbeddings.ts` is UNCHANGED and still uses `discoverChannels()` for full scan?
10. **Type SSOT:** `EmbeddingQueueEntry` and `EMBEDDING_QUEUE_PATH` are in `functions/src/embedding/types.ts` (not duplicated)?
11. **No dead code:** Is `discoverChannels()` still used (by backfill + fallback)? No orphaned imports?
12. **SRP adherence:** `embeddingQueue.ts` handles only queue read/write, `sync.ts` handles only dirty detection + queue write call, `scheduledEmbeddingSync.ts` handles only orchestration?
13. **Filter alignment (N7):** Do `isContentChanged` (4 fields) and `processOneVideo.needsPackaging` (title, tags, description, model version) agree on which content fields trigger re-embedding? No field checked by one but missed by the other?
14. **Shared `db` singleton:** Does `SyncService` use `import { db }` from shared module (not `admin.firestore()`)? Consistent with rest of codebase?
15. Run `npx vitest run --project functions && npm run check && cd functions && npm run build`."

Fix all R1 findings.

### R2: Production Readiness Review

Spawn a review agent:

**Prompt:** "Production readiness review of Incremental Embedding Sync. Check ALL:

1. **Performance:** Does the pre-read in `syncChannel()` (`db.getAll()`) add significant latency? How many additional reads per sync? Is this less than the reads saved by avoiding full scan in embedding sync?
2. **Race conditions:** What happens if Trends Sync writes to queue while embedding sync is reading it? (Answer: acceptable — queue entry may be missed this run, processed next run. Eventual consistency.)
3. **Queue growth:** What if embedding sync fails repeatedly and queue grows unbounded? Is there monitoring/alerting? (Canary log for large queue?)
4. **Error handling in syncChannel:** Is `db.getAll()` wrapped in `try/catch`? Does failure log warning and continue video sync without queue writes? (Key Decision 8)
5. **Cleanup resilience:** If cleanup batch fails, do videos get re-processed next run? Is this idempotent? (`processOneVideo` → `alreadyCurrent` for already-processed videos → yes, safe)
6. **Fallback edge case:** What if queue is empty but a few embeddings are stale (model version bump)? Fallback won't trigger (embeddings exist). Is this handled? (Answer: model version bumps use `backfillEmbeddings` endpoint — documented in Key Decisions)
7. **First deployment:** When this code first deploys, queue is empty and embeddings exist (from previous full scan). Will embedding sync just return? (Yes — correct behavior. Next Trends Sync writes to queue, next embedding sync processes it.)
8. **Observability:** Are all new log events structured? (emptyQueue, fallbackFullScan, queueCleanup). Can an operator trace the full flow from sync → queue → embedding?
9. **Backwards compatibility:** Does removing full scan from scheduled path affect anything? `backfillEmbeddings` still works? `processOneVideo` unchanged? `findSimilarVideos` unchanged?
10. **Firestore costs:** Estimate reads saved per run. Previous: ~5000+ (all videos). New: queue reads only (5-20 per day typical). `db.getAll()` in syncChannel: ~same reads as before (videos were already read by sync). Net savings?
11. **Test coverage:** Are all new code paths tested? (isContentChanged edge cases, enqueue, readQueue, cleanup, fallback)
12. Run `npx vitest run --project functions && npm run check && cd functions && npm run build`."

Fix all R2 findings.

### Final Verification

```bash
npx vitest run --project frontend     # frontend tests
npx vitest run --project functions    # backend tests
npm run check                         # lint + typecheck + doc links
cd functions && npm run build         # compiles
```

**MANDATORY: Update this file:**
- [ ] Update Phase Status table: FINAL → DONE
- [ ] Record final test count
- [ ] Update `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md`:
  - Add section about incremental embedding sync to "Embedding generation" section
  - Update architecture diagram if present
- [ ] Update related docs if affected:
  - `docs/features/chat/tools/layer-4-competition/embedding-infrastructure.md` — add queue architecture
