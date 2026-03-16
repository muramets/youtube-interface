# Competitive Intelligence — Этапы 2+3 Tasks

## Overview

Добавить semantic search по видео конкурентов: text embeddings (packaging — тема, заголовок, теги) + visual embeddings (thumbnail — визуальное сходство обложек). Один инструмент `findSimilarVideos` с тремя режимами: `packaging`, `visual`, `both` (RRF merge).

Инфраструктура общая: глобальная коллекция `globalVideoEmbeddings`, `scheduledEmbeddingSync` (Cloud Scheduler), budget safeguard, batched vector search.

**Feature doc:** `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md` (архитектура, решения, schema, примеры ответов)
3. `docs/features/chat/tools/layer-4-competition/vertex-ai-setup.md` (Vertex AI setup для visual embeddings)
4. `functions/src/services/tools/definitions.ts` (существующие tool definitions — паттерн)
5. `functions/src/services/tools/executor.ts` (как регистрируются handlers)
6. `functions/src/services/tools/handlers/competition/browseTrendVideos.ts` (ближайший паттерн — Layer 4 handler с view deltas)
7. `functions/src/services/trendSnapshotService.ts` (getViewDeltas — переиспользуем для delta enrichment)

### Key Decisions (carry forward)

1. **`globalVideoEmbeddings` = global top-level Firestore collection.** Один doc per unique YouTube video ID. Content-addressable — shared между всеми пользователями. 50 пользователей × MrBeast = 1 embedding, не 50. Альтернативы (per-user, на video docs, external vector DB) отклонены — см. feature doc.
2. **`scheduledEmbeddingSync` полностью decoupled от `scheduledSync`.** Отдельный Cloud Scheduler (00:30 UTC, 30 мин после video sync). Падение не влияет на video sync. Свой timeout/memory.
3. **Два SDK, две модели auth.** Packaging + descriptions → `@google/genai` (API key, уже установлен). Visual → `@google-cloud/aiplatform` (Vertex AI, service account ADC, НЕ установлен).
4. **Budget safeguard = hard stop.** `system/embeddingBudget` Firestore doc. 100% = автостоп, 80% = warn. Monthly limit $5 (default). Atomic increment при каждом API call.
5. **Backfill через Cloud Task chain.** Паттерн render pipeline (`@google-cloud/tasks` уже в deps). Batch 100 → enqueue next batch. Idempotent, budget-aware.
6. **RRF merge для mode: both.** `k=60`, `union` (не intersection), `limit_per_search=100`, `final_limit=20`. Score: `Σ 1/(k + rank_i(d))`. Не зависит от масштаба similarity scores.
7. **View deltas runtime.** НЕ хранятся в embedding doc. Вычисляются через `trendSnapshotService.getViewDeltas()` после vector search — per-user snapshots.
8. **Packaging: 768d MRL** (`gemini-embedding-001`, `outputDimensionality: 768`). **Visual: 1408d** (`multimodalembedding@001`, Vertex AI, нативный output).
9. **Coverage metadata в ответе.** `{indexed, total}` per mode — LLM знает о неполном покрытии и может предупредить пользователя.
10. **Hidden videos фильтруются ПОСЛЕ vector search** (скрытие per-user, embedding doc глобальный). Тот же паттерн, что `browseTrendVideos`.
11. **Coverage stats cached в `system/embeddingStats`.** `embeddingSync` пишет per-channel counts (packaging, visual, total) как побочный продукт discovery — zero extra reads. `findSimilarVideos` читает 1 doc и суммирует по каналам пользователя. НЕ делать count query по `globalVideoEmbeddings`.

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes, независимый agent)
- **Parallel tasks** — независимые файлы внутри фазы

### Phase 1 parallelization plan
```
T1.1 (types) — SEQUENTIAL FIRST (foundation)
T1.2 + T1.3 (budgetTracker + security rules) — PARALLEL
T1.4 (tests) — SEQUENTIAL LAST
→ Review Gate 1: subagent
```

### Phase 2 parallelization plan
```
T2.1 + T2.2 (packagingEmbedding + thumbnailDescription) — PARALLEL
T2.3 (tests) — SEQUENTIAL LAST
→ Review Gate 2: subagent
```

### Phase 3 parallelization plan
```
T3.1 (embeddingSync core) — SEQUENTIAL FIRST (foundation)
T3.2 (scheduledEmbeddingSync) — after T3.1
T3.3 (observability) — after T3.1 (can parallel with T3.2)
T3.4 (export in index.ts) — after T3.2
T3.5 (tests) — SEQUENTIAL LAST
→ Review Gate 3: subagent
```

### Phase 4 parallelization plan
```
⚠️ HUMAN ACTION: verify Cloud Tasks queue exists
T4.1 (backfill function) — SEQUENTIAL
T4.2 (export in index.ts) — after T4.1
T4.3 (tests) — SEQUENTIAL LAST
→ Review Gate 4: subagent
```

### Phase 5 parallelization plan
```
⚠️ HUMAN ACTION: create Firestore packaging vector index (gcloud command)
T5.1 (vectorSearch.ts) — SEQUENTIAL FIRST
T5.2 (findSimilarVideos handler) — after T5.1
T5.3 (tool definition + executor) — after T5.2
T5.4 (frontend ToolCallSummary) — PARALLEL with T5.3
T5.5 (tests) — SEQUENTIAL LAST
→ Review Gate 5: subagent
```

### Phase 6 parallelization plan
```
⚠️ HUMAN ACTION: npm install @google-cloud/aiplatform + verify Vertex AI API enabled
T6.1 (visualEmbedding.ts) — SEQUENTIAL FIRST
T6.2 + T6.2b (embeddingSync + backfill) — PARALLEL (both depend on T6.1, independent of each other)
T6.3 (thumbnail download refactor) — after T6.1 (can parallel with T6.2/T6.2b)
T6.4 (tests) — SEQUENTIAL LAST
→ Review Gate 6: subagent
```

### Phase 7 parallelization plan
```
⚠️ HUMAN ACTION: create Firestore visual vector index (gcloud command)
T7.1 (mode: visual) — SEQUENTIAL FIRST
T7.2 (mode: both + RRF) — after T7.1
T7.3 (update tool definition) — after T7.2
T7.4 (tests) — SEQUENTIAL LAST
→ Review Gate 7: subagent
```

### Phase 8 parallelization plan
```
T8.1 + T8.2 + T8.3 (tool doc + feature doc + telescope) — PARALLEL subagents
→ Review Gate 8: subagent
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
| 1 | Infrastructure: types, budget tracker, security rules | DONE |
| 2 | Embedding generators: packaging + thumbnail description | DONE |
| 3 | Sync pipeline: embeddingSync + scheduledEmbeddingSync + observability | DONE |
| 4 | Backfill: Cloud Task chain для existing videos | DONE |
| 5 | Vector search + findSimilarVideos (mode: packaging) | DONE |
| 5.5 | Deploy + Backfill (4370 videos, 36 channels, ~20 min) | DONE |
| 6 | Visual embeddings: Vertex AI + visualEmbedding.ts | DONE |
| 6.5 | Re-deploy + Visual Backfill (4370 videos, 84 thumbnail download failures — 98.1% success) | DONE |
| 7 | Extend findSimilarVideos (mode: visual + both с RRF) | DONE |
| 8 | Documentation: tool doc, feature doc, telescope diagram | DONE |
| FINAL | Double review-fix cycle (R1: Architecture, R2: Production Readiness) | DONE |

## Current Test Count

- **Frontend: 284 tests (22 files)** — verified via `npx vitest run --project frontend` (2026-03-09)
- **Backend: 544 tests (39 files)** — verified via `npx vitest run --project functions` (2026-03-09, FINAL)
- **Total: 828 tests (61 files)** — all passing (verified FINAL 2026-03-09)
- ⚠️ Previous count (1218) was double-counted — `npm run test:run` runs both projects, old count attributed the combined total as "frontend" then added backend again. Use `--project frontend` / `--project functions` for accurate per-project counts.

---

## Phase 1: Infrastructure Foundation

**Goal:** Создать типы, budget tracker и security rules — фундамент для всех последующих фаз.

### Tasks

- [x] **T1.1** — Types и интерфейсы
  - Create: `functions/src/embedding/types.ts`
  - Interfaces:
    - `EmbeddingDoc` — полная структура документа в `globalVideoEmbeddings` (см. feature doc "Поля"):
      - `videoId`, `youtubeChannelId`, `channelTitle`, `title`, `tags`, `viewCount`, `publishedAt`, `thumbnailUrl`
      - `packagingEmbedding?: number[]` (768d), `packagingEmbeddingVersion?: number`
      - `thumbnailDescription?: string | null`
      - `visualEmbedding?: number[]` (1408d), `visualEmbeddingVersion?: number`
      - `failCount: number`, `updatedAt: number`
    - `EmbeddingBudget` — структура `system/embeddingBudget`:
      - `currentMonth: string` (YYYY-MM), `totalEstimatedCost: number`, `monthlyLimit: number`, `alertTriggered: boolean`
    - `EmbeddingSyncResult` — summary лога:
      - `discovered`, `alreadyCurrent`, `generated`, `failed`, `skippedBudget`, `durationMs`, `estimatedCost`
    - `EmbeddingStats` — структура `system/embeddingStats` (coverage cache):
      - `byChannel: Record<youtubeChannelId, { packaging: number; visual: number; total: number }>` — per-channel counts
      - `updatedAt: number` — timestamp последнего обновления
    - `BackfillState` — структура `system/backfillState` (created by batch 0, read by batches 1+):
      - `channelPaths: Record<string, { userId: string; channelId: string; trendChannelId: string }>` — YouTube channel ID → Firestore path
      - `videos: Array<{ videoId: string; youtubeChannelId: string }>` — sorted deterministic list
      - `totalVideos: number`, `createdAt: number`
    - `BackfillBatchResult` — summary batch:
      - `batch`, `batchGenerated`, `batchFailed`, `totalProcessed`, `totalRemaining`, `estimatedCost`
  - Constants:
    - `CURRENT_PACKAGING_MODEL_VERSION = 1`
    - `CURRENT_VISUAL_MODEL_VERSION = 1`
    - `DEFAULT_MONTHLY_BUDGET_LIMIT = 20.00`
    - `BUDGET_WARN_THRESHOLD = 0.80`
    - `BACKFILL_BATCH_SIZE = 100`
    - `EMBEDDING_DIMENSIONS = { packaging: 768, visual: 1408 } as const`
  - 0 I/O, 0 dependencies

- [x] **T1.2** — Budget tracker
  - Create: `functions/src/embedding/budgetTracker.ts`
  - Functions:
    - `checkBudget(): Promise<{ allowed: boolean; remaining: number; currentCost: number }>` — read `system/embeddingBudget`, check month rollover (если `currentMonth !== текущий месяц` → reset `totalEstimatedCost: 0, alertTriggered: false`), return status
    - `recordCost(amount: number): Promise<void>` — atomic `FieldValue.increment(amount)` на `totalEstimatedCost`. Check 80% threshold → `logger.warn("embeddingBudget:thresholdReached")` + set `alertTriggered: true`. Check 100% → `logger.error("embeddingBudget:limitReached")`
  - ⚠️ Month rollover: `checkBudget` сравнивает `currentMonth` в doc с `new Date().toISOString().slice(0, 7)`. При mismatch → `set({ currentMonth, totalEstimatedCost: 0, alertTriggered: false }, { merge: true })`. Race condition safe — merge idempotent, worst case = double reset (безопасно)
  - ⚠️ First run: doc может не существовать → `checkBudget` создаёт с defaults через `set({ merge: true })`
  - ⚠️ Admin SDK only: `import { db } from "../../shared/db.js"`

- [x] **T1.3** — Firestore security rules
  - File: `firestore.rules`
  - Add explicit deny rules for admin-only collections:
    ```
    // Embedding index — admin SDK only (Cloud Functions)
    match /globalVideoEmbeddings/{docId} {
      allow read, write: if false;
    }
    // Embedding budget — admin SDK only
    match /system/{docId} {
      allow read, write: if false;
    }
    ```
  - ⚠️ Default deny (`match /{document=**} { allow read, write: if false; }`) уже покрывает, но explicit rules = defence in depth + документация намерения
  - ⚠️ Правила НЕ нужно деплоить для работы в Cloud Functions (admin SDK bypass rules). Deploy нужен для client-side protection

- [x] **T1.4** — Tests для budget tracker
  - Create: `functions/src/embedding/__tests__/budgetTracker.test.ts`
  - Mock: `db` (Firestore admin)
  - Cases:
    - `checkBudget`: doc exists, within limit → `{ allowed: true, remaining: X }`
    - `checkBudget`: doc exists, over limit → `{ allowed: false, remaining: 0 }`
    - `checkBudget`: doc not exists → creates with defaults, returns allowed
    - `checkBudget`: month rollover → resets cost to 0
    - `recordCost`: normal → increments `totalEstimatedCost`
    - `recordCost`: crosses 80% → logs warn, sets `alertTriggered`
    - `recordCost`: crosses 100% → logs error

### Verification

```bash
npx vitest run --project functions     # backend tests pass (incl. new)
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 1 → DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 1

**Prompt:** "Review Phase 1 of competitive-intelligence Этапы 2+3 (infrastructure foundation). Read `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md` for full context. Check:
1. Does `functions/src/embedding/types.ts` match the `globalVideoEmbeddings` schema in feature doc? All fields present? Correct types (vector as `number[]`, not `Float32Array`)?
2. Are model version constants defined (`CURRENT_PACKAGING_MODEL_VERSION`, `CURRENT_VISUAL_MODEL_VERSION`)?
3. Does `budgetTracker.ts` handle month rollover correctly? (compare `currentMonth` string, reset on mismatch)
4. Does `budgetTracker.ts` handle first-run (doc not exists) gracefully? (create with defaults via `set merge`)
5. Is `recordCost` using `FieldValue.increment` (atomic, concurrent-safe)?
6. Are 80% warn and 100% error thresholds implemented with correct logger levels?
7. Are Firestore security rules added for `globalVideoEmbeddings` and `system` collections? (explicit `allow read, write: if false`)
8. Are all constants in `types.ts` and NOT hardcoded elsewhere?
9. Do tests cover all edge cases? (month rollover, first run, both thresholds, over-limit)
10. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 2.

---

## Phase 2: Embedding Generators

**Goal:** Создать функции генерации packaging embeddings (text → vector) и thumbnail descriptions (image → text).

### CRITICAL CONTEXT

- `@google/genai` уже установлен. Gemini client: `functions/src/services/gemini/client.ts` (`getClient(apiKey)` → cached `GoogleGenAI`)
- ⚠️ Embedding API в `@google/genai`: `client.models.embedContent({ model, contents, config: { outputDimensionality } })` — ⚠️ НОВАЯ API surface, не используется нигде в текущем codebase. Agent MUST верифицировать exact method signature и response shape по `@google/genai` SDK docs или типам перед реализацией (auto-complete в IDE или `node_modules/@google/genai`)
- ⚠️ Thumbnail description: Gemini 2.0 Flash с vision. Модель `gemini-2.0-flash`. Input: image URL → inline data (base64) или `fileData` (URL)
- ⚠️ API key: `GEMINI_API_KEY` из Secret Manager. Передаётся через `defineSecret` → `process.env`. Паттерн: `functions/src/chat/aiChat.ts`
- ⚠️ Thumbnail URL: `thumbnailUrl` в embedding doc. YouTube форматы: `maxresdefault.jpg` (1280×720, не всегда), `sddefault.jpg` (640×480, fallback), `mqdefault.jpg` (320×180, гарантирован). Fallback chain для download

### Tasks

- [x] **T2.1** — Packaging embedding generator
  - Create: `functions/src/embedding/packagingEmbedding.ts`
  - Function: `generatePackagingEmbedding(title: string, tags: string[], description: string, apiKey: string): Promise<number[] | null>`
  - Logic:
    1. Build input text: `"Title: ${title}\nTags: ${tags.join(', ')}\nDescription: ${description}"` — structured format для лучшего quality
    2. Get client: `const client = await getClient(apiKey)` — ⚠️ `getClient` is async (lazy `import()` inside), MUST await
    3. Call `await client.models.embedContent({ model: 'gemini-embedding-001', contents: inputText, config: { outputDimensionality: EMBEDDING_DIMENSIONS.packaging } })`
    4. Return embedding vector (768d array)
    5. On error → `logger.warn("packagingEmbedding:failed", { error })`, return `null`
  - ⚠️ `description` может быть очень длинным (>5000 chars). Gemini embedding model принимает до 2048 tokens input — обрезать description до ~3000 chars если превышает (title + tags всегда короткие)
  - ⚠️ Не кешировать `GoogleGenAI` instance внутри — переиспользовать `getClient(apiKey)` из `gemini/client.ts`. `getClient` возвращает `Promise<GoogleGenAI>` (async lazy init) — всегда `await`
  - Estimated cost: ~$0.00004 per call

- [x] **T2.2** — Thumbnail description generator
  - Create: `functions/src/embedding/thumbnailDescription.ts`
  - Function: `generateThumbnailDescription(thumbnailUrl: string, apiKey: string): Promise<string | null>`
  - Logic:
    1. Download thumbnail with fallback chain:
       - Try `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` (extract videoId from URL or pass separately)
       - If 404 → try `sddefault.jpg`
       - If 404 → try `mqdefault.jpg`
       - If all fail → return `null`
    2. Convert to base64
    3. Get client: `const client = await getClient(apiKey)` — ⚠️ async, MUST await (same as T2.1)
    4. Call Gemini 2.0 Flash with vision:
       ```
       model: 'gemini-2.0-flash'
       prompt: "Describe this YouTube video thumbnail in detail for similarity search. Focus on: visual composition, colors, text overlays, people/objects, emotional tone, style. Be specific and concise. Max 200 words."
       ```
    5. Return description string
    5. On error → `logger.warn("thumbnailDescription:failed", { thumbnailUrl, error })`, return `null`
  - ⚠️ Fallback chain: функция принимает `videoId` (не URL) для построения thumbnail URLs
  - ⚠️ Если видео удалено — все 3 URL вернут 404 → graceful `null`
  - ⚠️ HTTP download: использовать `axios` (уже в deps) с timeout 10s
  - ⚠️ Content-type validation: проверить что response — image (не HTML redirect)
  - Estimated cost: ~$0.0001 per call

- [x] **T2.3** — Tests для generators
  - Create: `functions/src/embedding/__tests__/packagingEmbedding.test.ts`
    - Mock: `getClient` from `gemini/client.ts`
    - Cases:
      - Normal input → returns 768d array
      - Long description (>3000 chars) → truncated, still works
      - Empty tags → still generates (title + description sufficient)
      - API error → returns null, logs warning
  - Create: `functions/src/embedding/__tests__/thumbnailDescription.test.ts`
    - Mock: `axios` для HTTP, `getClient` для Gemini
    - Cases:
      - `maxresdefault.jpg` available → uses it, returns description
      - `maxresdefault.jpg` 404, `sddefault.jpg` available → fallback works
      - All resolutions 404 → returns null
      - Non-image response (HTML redirect) → returns null
      - Gemini API error → returns null, logs warning

### Verification

```bash
npx vitest run --project functions     # backend tests pass
npm run check                          # lint + typecheck
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 2 → DONE
- [x] Record test count

### Review Gate 2

**Prompt:** "Review Phase 2 of competitive-intelligence Этапы 2+3 (embedding generators). Check:
1. Does `packagingEmbedding.ts` use `getClient(apiKey)` from `gemini/client.ts` (not creating own instance)?
2. Is `outputDimensionality: 768` passed to `embedContent` config (MRL, not full 2048)?
3. Does description truncation happen BEFORE API call (not relying on API to truncate)?
4. Does `thumbnailDescription.ts` implement full fallback chain (maxresdefault → sddefault → mqdefault)?
5. Is thumbnail download using `axios` with timeout? (not `fetch` without timeout)
6. Is content-type validated (reject HTML redirects)?
7. Do both functions return `null` on error (not throw)? Are errors logged with `logger.warn`?
8. Is the Gemini Flash Vision prompt specific enough for similarity search? (composition, colors, text, objects, style)
9. Are costs documented in code comments?
10. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 3.

---

## Phase 3: Sync Pipeline

**Goal:** Создать core sync logic и Cloud Scheduler entry point для daily embedding generation.

### CRITICAL CONTEXT

- Discovery: collection group query на `trendChannels` → unique YouTube channel IDs across ALL users
- ⚠️ Collection group query: `db.collectionGroup('trendChannels').get()` → iterate, extract unique `youtubeChannelId` (= doc ID). Для каждого unique канала нужен ОДИН user/channel path для чтения video docs
- ⚠️ `scheduledEmbeddingSync` = отдельная Cloud Function, отдельный Cloud Scheduler (00:30 UTC). Паттерн `onSchedule` structure: `functions/src/trends/scheduledSync.ts` (schedule, timeout, memory). Паттерн `defineSecret`: `functions/src/chat/aiChat.ts` (НЕ scheduledSync — он читает API key из Firestore per-user)
- ⚠️ Этап 2 генерирует ТОЛЬКО `packagingEmbedding` + `thumbnailDescription`. `visualEmbedding` добавляется в Phase 6
- ⚠️ API key: `GEMINI_API_KEY` через `defineSecret` → `process.env.GEMINI_API_KEY`. Паттерн: `functions/src/chat/aiChat.ts`. ⚠️ `scheduledSync.ts` использует другой подход (per-user key из Firestore) — НЕ копировать его паттерн для API key
- ⚠️ Timeout: `540` секунд (max Cloud Function). При 5-20 новых видео/день — укладывается с запасом
- ⚠️ Memory: `512MiB` (паттерн `scheduledSync.ts`). Можно увеличить если embedding generation требует больше

### Tasks

- [x] **T3.1** — Embedding sync core logic
  - Create: `functions/src/embedding/embeddingSync.ts`
  - Function: `syncEmbeddings(apiKey: string): Promise<EmbeddingSyncResult>`
  - Logic:
    1. **Discovery:** collection group query на `trendChannels` → build `Map<youtubeChannelId, { userId, channelId, trendChannelId }>`. ⚠️ Один YouTube channel может отслеживаться несколькими пользователями — сохраняем путь ПЕРВОГО встреченного (Map.set при !has). Все пользователи видят одни и те же видео для одного канала — контент идентичен, path нужен только для Firestore read access
    2. **Budget check:** `checkBudget()` → if not allowed, return early with `skippedBudget = discovered`
    3. **For each unique channel:** read video docs через путь первого пользователя: `users/${userId}/channels/${channelId}/trendChannels/${trendChannelId}/videos/`
    4. **For each video:** check `globalVideoEmbeddings/{videoId}`:
       - Doc не существует → create new
       - Doc exists, `packagingEmbeddingVersion < CURRENT_PACKAGING_MODEL_VERSION` → re-generate embedding
       - Doc exists, title/tags/description changed → re-generate embedding
       - Doc exists, version current → `merge` только `viewCount`, `title` если изменились (денормализация)
    5. **Generate (для new/outdated):** параллельно:
       ```
       ├─ generatePackagingEmbedding(title, tags, description, apiKey)
       └─ generateThumbnailDescription(videoId, apiKey)
       ```
    6. **Save:** `globalVideoEmbeddings/{videoId}` с `set({ ...fields }, { merge: true })`
    7. **Record cost:** `recordCost(estimatedCostForThisBatch)`
    8. **Error handling:** per-video `try/catch`. Increment `failCount` on error, reset to 0 on success. `failCount >= 3` → `logger.warn("embeddingSync:persistentFailure", { videoId })`
    9. **Write coverage stats:** после обработки всех каналов → `system/embeddingStats` с `set({ byChannel: { [channelId]: { packaging, visual, total } }, updatedAt: Date.now() })`. Counts: `packaging` = docs with non-null `packagingEmbedding`, `visual` = docs with non-null `visualEmbedding`, `total` = total video docs в channel. Побочный продукт discovery — zero extra Firestore reads
    10. **Return:** `EmbeddingSyncResult` summary
  - ⚠️ `description` field: в trend video docs может НЕ быть description (Firestore schema). Проверить наличие, использовать `''` если нет
  - ⚠️ Параллельность: обрабатывать videos sequential per channel (rate limit respect), channels можно параллелить (но осторожно — budget check per batch)
  - ⚠️ Cost estimation: packaging ~$0.00004 + description ~$0.0001 = ~$0.00014 per video
  - ⚠️ Coverage stats: `system/embeddingStats` — admin-only doc (уже protected security rules from T1.3). 1 write per sync run. `findSimilarVideos` (Phase 5) reads this instead of expensive count queries

- [x] **T3.2** — Cloud Scheduler entry point
  - Create: `functions/src/embedding/scheduledEmbeddingSync.ts`
  - Pattern: `functions/src/trends/scheduledSync.ts`
  - ```typescript
    export const scheduledEmbeddingSync = onSchedule({
      schedule: "30 0 * * *",  // 00:30 UTC, 30 min after video sync
      timeZone: "Etc/UTC",
      timeoutSeconds: 540,
      memory: "512MiB",
      secrets: [defineSecret("GEMINI_API_KEY")],
    }, async () => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) { logger.error("..."); return; }
      const result = await syncEmbeddings(apiKey);
      logger.info("embeddingSync:complete", result);
    });
    ```

- [x] **T3.3** — Observability (structured logs)
  - В `embeddingSync.ts`:
    - Summary log at end: `logger.info("embeddingSync:complete", { discovered, alreadyCurrent, generated, failed, skippedBudget, durationMs, estimatedCost })`
    - Anomaly warnings:
      - `discovered === 0` → `logger.warn("embeddingSync:noVideosFound")`
      - `failed / (generated + failed) > 0.10` → `logger.warn("embeddingSync:highFailureRate", { failRate })`
      - `failCount >= 3` per video → `logger.warn("embeddingSync:persistentFailure", { videoId })`
    - Budget warnings integrated from `budgetTracker.ts` (Phase 1)

- [x] **T3.4** — Export в `functions/src/index.ts`
  - Add: `export { scheduledEmbeddingSync } from "./embedding/scheduledEmbeddingSync.js";`
  - Section comment: `// ─── Embedding Sync ──────────────────────────────────────────────────`

- [x] **T3.5** — Tests для sync pipeline
  - Create: `functions/src/embedding/__tests__/embeddingSync.test.ts`
  - Mock: `db` (Firestore), `generatePackagingEmbedding`, `generateThumbnailDescription`, `checkBudget`, `recordCost`
  - Cases:
    - Discovery: finds 3 unique channels across 2 users → processes 3 channels (not 4)
    - New video (no embedding doc) → creates doc with embedding + description
    - Existing video, version outdated → re-generates embedding
    - Existing video, title changed → re-generates embedding
    - Existing video, version current, viewCount changed → merge only viewCount
    - Existing video, nothing changed → skipped (alreadyCurrent++)
    - Budget exhausted → returns early with `skippedBudget = discovered`
    - Single video API failure → other videos processed, `failCount` incremented
    - `failCount >= 3` → warning logged
    - Empty discovery (no trend channels) → `discovered: 0`, warning logged
    - High failure rate (>10%) → warning logged
    - Coverage stats written to `system/embeddingStats` → correct per-channel counts (packaging, visual, total)

### Verification

```bash
npx vitest run --project functions     # backend tests pass
npm run check                          # lint + typecheck
cd functions && npm run build          # compiles (new export)
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 3 → DONE
- [x] Record test count

### Review Gate 3

**Prompt:** "Review Phase 3 of competitive-intelligence Этапы 2+3 (sync pipeline). Read `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md` sections 'Embedding generation' and 'Observability'. Check:
1. Does `embeddingSync.ts` use collection group query for discovery? Does it deduplicate by `youtubeChannelId`?
2. Is budget checked BEFORE processing any videos? (early return if exhausted)
3. Does the sync correctly detect: new videos, outdated versions, changed title/tags, unchanged (skip)?
4. Are `packagingEmbedding` and `thumbnailDescription` generated in parallel (`Promise.all`)?
5. Is `recordCost` called after each successful generation (not at the end)?
6. Is per-video error handling via `try/catch`? Does `failCount` increment on error, reset on success?
7. Does `scheduledEmbeddingSync.ts` follow the pattern of `scheduledSync.ts`? (schedule, timeout, memory, secrets)
8. Is the export added to `index.ts` with section comment?
9. Are ALL observability logs from the feature doc implemented? (complete summary, noVideosFound, highFailureRate, persistentFailure)
10. Does sync write coverage stats to `system/embeddingStats`? Per-channel counts (packaging, visual, total)? Is this a side-effect of discovery (zero extra reads)?
11. Does `cd functions && npm run build` compile without errors?
12. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 4.

---

## Phase 4: Backfill

**Goal:** Cloud Task chain для генерации embeddings для existing ~8000 видео. Idempotent, budget-aware.

### CRITICAL CONTEXT

- Паттерн Cloud Tasks: `functions/src/render/startRender.ts` (`CloudTasksClient`, `tasksClient.createTask`)
- ⚠️ Cloud Functions timeout = 540s. Backfill 8000 videos при 120 RPM ≈ 67 минут. Одна функция не успеет → batch chain
- ⚠️ Каждый batch: 100 videos, ~5 минут → укладывается в timeout
- ⚠️ Cloud Task → HTTP call к Cloud Function. Auth: service account OAuth token
- ⚠️ Queue: может потребоваться создание отдельной Cloud Tasks queue (или переиспользование существующей)
- ⚠️ Запускается вручную (HTTP callable), не автоматически
- ⚠️ **Discovery optimization:** batch 0 делает discovery ОДИН РАЗ и сохраняет результат в `system/backfillState`. Последующие batches читают 1 doc вместо повторного discovery. Без этого: 80 batches × 8K reads = 640K reads (~$3.84). С этим: 8K reads (once) + 79 state reads + ~8K video doc reads (для description) = ~16K reads (~$0.10)
- ⚠️ **`description` не в EmbeddingDoc:** `generatePackagingEmbedding` нуждается в `description`, которая хранится только в trend video docs (`trendChannels/{id}/videos/{videoId}`), НЕ в `globalVideoEmbeddings`. Поэтому backfill batches 1+ читают video doc per video через channelPaths из backfillState

### 🧑‍💻 HUMAN ACTION REQUIRED — перед Phase 4

**Что сделать:** проверить, существует ли Cloud Tasks queue для embedding backfill.

```bash
# Посмотреть существующие queues
gcloud tasks queues list --location=us-central1

# Если нужна новая queue:
gcloud tasks queues create embedding-backfill --location=us-central1
```

Если queue уже существует от render pipeline — можно переиспользовать (разные task URLs).

---

### Tasks

- [x] **T4.1** — Backfill Cloud Function
  - Create: `functions/src/embedding/backfillEmbeddings.ts`
  - Callable HTTP function (не scheduled):
    ```typescript
    export const backfillEmbeddings = onRequest({
      timeoutSeconds: 540,
      memory: "512MiB",
      secrets: [defineSecret("GEMINI_API_KEY")],
    }, async (req, res) => { ... });
    ```
  - Input (from request body or Cloud Task payload): `{ offset: number }`
  - **Backfill state schema** (`system/backfillState`):
    ```typescript
    {
      channelPaths: Record<youtubeChannelId, { userId: string, channelId: string, trendChannelId: string }>,  // ~1KB
      videos: Array<{ videoId: string, youtubeChannelId: string }>,  // 8K × ~40 bytes ≈ 320KB
      totalVideos: number,
      createdAt: number
    }
    // Total: ~321KB — далеко от Firestore doc limit 1MB
    ```
  - Logic:
    **Batch 0 (offset === 0 или backfillState не существует):**
    1. **Discovery:** collection group query на `trendChannels` → build channelPaths (unique channels, first user path wins — same as embeddingSync T3.1)
    2. **Collect videos:** for each channel → read video docs → collect `{ videoId, youtubeChannelId }` для всех видео
    3. **Sort** by videoId (deterministic order)
    4. **Write `system/backfillState`:** channelPaths + sorted videos array + totalVideos + createdAt
    5. **Continue to processing** (below, same as batches 1+)

    **Batches 1+ (offset > 0):**
    1. **Read `system/backfillState`** (1 Firestore read, ~321KB)
    2. **Slice:** `state.videos.slice(offset, offset + BACKFILL_BATCH_SIZE)`
    3. **Budget check:** `checkBudget()` → if exhausted, log summary, return (do NOT enqueue next)
    4. **For each video in batch:**
       a. Check `globalVideoEmbeddings/{videoId}` → skip if current version exists (idempotent)
       b. Read video doc from trendChannel: `users/${cp.userId}/channels/${cp.channelId}/trendChannels/${cp.trendChannelId}/videos/${videoId}` (1 read — нужен для `description`, которая НЕ хранится в EmbeddingDoc)
       c. Generate: packaging embedding + thumbnail description (parallel per video via `Promise.all`)
       d. Save to `globalVideoEmbeddings/{videoId}`
    5. **Record cost** per batch
    6. **Log batch summary:** `logger.info("backfill:batchComplete", { batch: Math.floor(offset / BACKFILL_BATCH_SIZE), batchGenerated, batchFailed, totalProcessed: offset + batch.length, totalRemaining: state.totalVideos - offset - batch.length, estimatedCost })`
    7. **If more videos:** enqueue next batch via Cloud Task:
        ```typescript
        const tasksClient = new CloudTasksClient();
        await tasksClient.createTask({
          parent: queuePath,
          task: {
            httpRequest: {
              httpMethod: "POST",
              url: backfillFunctionUrl,
              body: Buffer.from(JSON.stringify({ offset: offset + BACKFILL_BATCH_SIZE })).toString("base64"),
              headers: { "Content-Type": "application/json" },
              oauthToken: { serviceAccountEmail },
            },
          },
        });
        ```
    8. **If no more videos:** delete `system/backfillState` (cleanup) → `logger.info("backfill:complete", { totalProcessed, totalFailed, totalCost, durationMs })`
  - ⚠️ Idempotent: skip videos with `packagingEmbeddingVersion === CURRENT_PACKAGING_MODEL_VERSION` + `thumbnailDescription !== null`
  - ⚠️ Concurrency: `pLimit(5)` — 5 видео обрабатываются параллельно в batch (inline limiter, zero deps). Packaging + description для одного видео — параллельно (`Promise.all([packaging, description])`). ~5x ускорение vs sequential. Paid tier Gemini API (1000-1500 RPM) укладывается с запасом
  - ⚠️ Queue path: configurable via env var or hardcoded `embedding-backfill`
  - ⚠️ Function URL: construct from project ID + region + function name
  - ⚠️ Cleanup: `system/backfillState` удаляется после последнего batch. Если backfill прерван — state остаётся, можно restart с `{ offset: 0 }` (batch 0 пересоздаст state) или с `{ offset: lastSuccessful }` (resume)
  - ⚠️ Reads budget: batch 0 = ~8K reads (discovery). Batches 1-79 = 1 (state) + 100 (video docs) + ≤100 (embedding checks) = ~201 reads each. Total ≈ 16K reads vs 640K без state optimization

- [x] **T4.2** — Export в `functions/src/index.ts`
  - Add: `export { backfillEmbeddings } from "./embedding/backfillEmbeddings.js";`

- [x] **T4.3** — Tests для backfill
  - Create: `functions/src/embedding/__tests__/backfillEmbeddings.test.ts`
  - Mock: `db`, generators, `budgetTracker`, `CloudTasksClient`
  - Cases:
    - **Batch 0 (discovery):**
      - Offset 0, no backfillState → discovery runs, state written with channelPaths + videos, first batch processed
      - State doc size reasonable (videoIds + channelPaths < 1MB)
    - **Batch 1+ (from state):**
      - Reads backfillState (not re-discovers), slices correctly by offset
      - Reads video doc from trendChannel via channelPaths (for `description`)
      - Normal batch (100 videos, 20 need embedding) → generates 20, skips 80
      - Idempotent: all 100 already have current version → generates 0
    - **Chain control:**
      - Budget exhausted mid-batch → stops, logs summary, does NOT enqueue next, does NOT delete state
      - More videos remaining → enqueues Cloud Task with correct offset
      - Last batch (< 100 remaining) → does NOT enqueue next, deletes `system/backfillState`, logs `backfill:complete`
    - **Error handling:**
      - API failure on one video → continues with next, logs per-video error
      - Batch summary log includes correct counts
    - **Resume:**
      - backfillState exists + offset provided → resumes from offset (no re-discovery)

### Verification

```bash
npx vitest run --project functions     # backend tests pass
npm run check                          # lint + typecheck
cd functions && npm run build          # compiles (new export)
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 4 → DONE
- [x] Record test count

### Review Gate 4

**Prompt:** "Review Phase 4 of competitive-intelligence Этапы 2+3 (backfill). Check:
1. **State optimization:** Does batch 0 write `system/backfillState` with channelPaths + videos array? Do batches 1+ read from state (not re-discover)?
2. **Description reads:** Does each batch read video doc from trendChannel via channelPaths to get `description` for packaging embedding? (description NOT in EmbeddingDoc)
3. **Idempotent:** skips videos with current `packagingEmbeddingVersion` + non-null `thumbnailDescription`?
4. **Budget:** checked at START of each batch? (not just once at start of chain)
5. **Rate limits:** sequential between videos, parallel packaging+description within video?
6. **Cloud Task enqueue:** OAuth token, correct URL, correct offset in payload?
7. **Chain termination:** last batch deletes `system/backfillState` + logs `backfill:complete`? Budget exhaustion does NOT delete state (allows resume)?
8. **Resume:** if backfillState exists and offset > 0, skips discovery and resumes from state?
9. Is `BACKFILL_BATCH_SIZE` used from constants (not hardcoded 100)?
10. Are batch summary logs matching the schema in feature doc?
11. Is the function exported as `onRequest` (not `onSchedule`)? — callable manually
12. **Reads budget:** verify total reads ≈ 16K (not 640K). Batch 0 = ~8K, batches 1+ = ~201 each.
13. Does `cd functions && npm run build` compile without errors?
14. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 5.

---

## Phase 5: Vector Search + findSimilarVideos (mode: packaging)

**Goal:** Batched vector search helper + tool handler для поиска по text similarity.

### CRITICAL CONTEXT

- ⚠️ Firestore `findNearest()` доступен в `firebase-admin` v12+ (текущая: v13.6.0 ✓)
- ⚠️ Vector index ДОЛЖЕН быть создан до запуска `findNearest`. Без индекса — Firestore вернёт ошибку
- ⚠️ Pre-filter: `where("youtubeChannelId", "in", channelIds)` + `findNearest` = composite vector index
- ⚠️ Firestore `in` limit = 30. При >30 каналах → batch queries, merge by distance
- ⚠️ Query vector для своего видео: генерируется на лету через `generatePackagingEmbedding`. Для конкурентного — читается из `globalVideoEmbeddings`
- ⚠️ Hidden videos: фильтруются ПОСЛЕ vector search (global collection, скрытие per-user)
- ⚠️ View deltas: обогащаются ПОСЛЕ vector search через `trendSnapshotService.getViewDeltas()`

### ✅ HUMAN ACTION COMPLETED — перед Phase 5

~~**Что сделать:** создать Firestore composite vector index для packaging embedding.~~

**Done (2026-03-09).** Index `CICAgJiUpoMK` created, status: READY.

```bash
gcloud firestore indexes composite create \
  --collection-group=globalVideoEmbeddings \
  --query-scope=COLLECTION \
  --field-config=order=ASCENDING,field-path=youtubeChannelId \
  --field-config field-path=packagingEmbedding,vector-config='{"dimension":"768","flat":"{}"}' \
  --database='(default)'
```

---

### Tasks

- [x] **T5.1** — Vector search helper
  - Create: `functions/src/embedding/vectorSearch.ts`
  - Function: `findNearestVideos(params: { queryVector: number[]; field: 'packagingEmbedding' | 'visualEmbedding'; youtubeChannelIds: string[]; limit: number; }): Promise<Array<{ videoId: string; distance: number; data: EmbeddingDoc }>>`
  - Logic:
    1. Batch `youtubeChannelIds` into chunks of 30 (Firestore `in` limit)
    2. For each batch — parallel:
       ```typescript
       db.collection('globalVideoEmbeddings')
         .where('youtubeChannelId', 'in', batchIds)
         .findNearest(field, queryVector, {
           limit: limit * 3,  // over-fetch for quality merge
           distanceMeasure: 'COSINE',
         })
       ```
    3. Merge all results → sort by distance ascending → take top `limit`
    4. Return `[{ videoId: doc.id, distance, data: doc.data() }]`
  - ⚠️ `limit * 3` per batch: over-fetch гарантирует качественный merge
  - ⚠️ Distance metric: `COSINE` — Firestore поддерживает `EUCLIDEAN`, `COSINE`, `DOT_PRODUCT`. Cosine = standard для text/image embeddings
  - ⚠️ Null embeddings: videos без embedding (null) не участвуют в `findNearest` — Firestore пропускает их автоматически

- [x] **T5.2** — findSimilarVideos handler (mode: packaging)
  - Create: `functions/src/services/tools/handlers/competition/findSimilarVideos.ts`
  - Input: `{ videoId: string, mode?: 'packaging', limit?: number }`
  - ⚠️ mode default = `'packaging'` (Этап 2). `'visual'` и `'both'` добавляются в Phase 7
  - Logic:
    1. **Resolve query vector:**
       - Check `globalVideoEmbeddings/{videoId}` → if exists + has `packagingEmbedding` → use it (competitor video, ~50ms)
       - If not → load video from user's Firestore (own video): `videos/{videoId}` or `trendChannels/*/videos/{videoId}` → generate embedding on-the-fly via `generatePackagingEmbedding` (~500ms)
       - If video not found anywhere → `{ error: "Video not found: {videoId}" }`
    2. **Get user's trend channel IDs:** read `trendChannels/` → extract YouTube channel IDs
    3. **Vector search:** `findNearestVideos({ queryVector, field: 'packagingEmbedding', youtubeChannelIds, limit: (limit || 20) })`
    4. **Filter out:** query video itself (same videoId), hidden videos (via `getHiddenVideoIds`)
    5. **Enrich view deltas:** `getViewDeltas(userId, channelId, resultVideoIds, channelIdHints)` → attach `viewDelta24h`, `viewDelta7d`, `viewDelta30d`
    6. **Compute coverage:** read `system/embeddingStats` (1 Firestore read) → sum `byChannel[channelId].packaging` and `byChannel[channelId].total` for user's channels → `{ indexed: sumPackaging, total: sumTotal }`. Stats written by `embeddingSync` (Phase 3 T3.1 step 9) — побочный продукт discovery, zero extra cost
    7. **Compute shared tags:** intersection of query video tags with each result's tags
    8. **Assign performance tier:** `assignPercentileGroups` per channel (same as `browseTrendVideos`)
    9. **Build response:**
       ```json
       {
         "referenceVideo": { "videoId", "title", "tags" },
         "mode": "packaging",
         "similar": [{ "videoId", "title", "channelTitle", "similarityScore", "publishedAt", "viewCount", "viewDelta24h/7d/30d", "performanceTier", "sharedTags" }],
         "totalFound": <total before limit>,
         "coverage": { "indexed": N, "total": M },
         "dataFreshness": [...]
       }
       ```
  - ⚠️ `similarityScore`: convert from Firestore `distance` (cosine distance ∈ [0, 2]) to similarity (1 - distance/2 ∈ [0, 1]). Или `1 - distance` если Firestore возвращает cosine distance ∈ [0, 1]. Проверить конкретную реализацию `findNearest` distance semantics
  - ⚠️ `performanceTier`: per-channel, не global. Для каждого канала в результатах — отдельный `assignPercentileGroups`
  - ⚠️ `totalFound`: количество результатов ДО limit (но после filter hidden)
  - ⚠️ Coverage: read from `system/embeddingStats` cache (1 doc read, written by `embeddingSync`). НЕ делать count query по `globalVideoEmbeddings` — дорого. Если `embeddingStats` doc не существует (sync не запускался) → `coverage: null` в ответе (LLM поймёт)

- [x] **T5.3** — Tool definition + executor registration
  - File: `functions/src/services/tools/definitions.ts`
    - Add `FIND_SIMILAR_VIDEOS` to `TOOL_NAMES`
    - Create `ToolDefinition` with description:
      ```
      "Find competitor videos similar to a given video by topic/packaging (title, tags, description).
       Returns ranked results with similarity scores, performance data, and view growth metrics.
       Use after browseTrendVideos or getMultipleVideoDetails when user asks about similar content, competitive overlap, or topic trends.
       Pass videoId from any previous tool result."
      ```
    - `parametersJsonSchema`:
      - `videoId`: string (required)
      - `mode`: enum `["packaging"]` (default, will expand in future)
      - `limit`: number (default 20, max 50)
    - Add to `TOOL_DECLARATIONS` array
  - File: `functions/src/services/tools/executor.ts`
    - Import handler, add to `HANDLERS` map

- [x] **T5.4** — Frontend ToolCallSummary
  - File: `src/features/Chat/utils/toolCallGrouping.ts`
    - `extractVideoIdsForTool()`: add case for `findSimilarVideos` → extract from `result.similar[].videoId`
    - `isExpandable()`: add case
    - `getGroupLabel()`: add display label
  - File: `src/features/Chat/components/ToolCallSummary.tsx`
    - Add summary rendering for `findSimilarVideos` (show mode, result count, top match)

- [x] **T5.5** — Tests
  - Create: `functions/src/embedding/__tests__/vectorSearch.test.ts`
    - Mock: `db`
    - Cases:
      - Normal search (5 channels, 20 results) → sorted by distance
      - >30 channels → batched into 2 queries, merged correctly
      - Empty results → returns `[]`
      - 1 channel → single query (no batching)
  - Create: `functions/src/services/tools/handlers/competition/__tests__/findSimilarVideos.test.ts`
    - Mock: `db`, `findNearestVideos`, `generatePackagingEmbedding`, `getViewDeltas`, `getHiddenVideoIds`
    - Cases:
      - Competitor video (exists in globalVideoEmbeddings) → uses stored embedding
      - Own video (not in globalVideoEmbeddings) → generates on-the-fly
      - Video not found → error response
      - Hidden videos filtered from results
      - Self-reference filtered (query videoId not in results)
      - View deltas enriched (some null, some present)
      - Performance tier assigned per channel
      - Shared tags computed correctly
      - Coverage metadata present
      - dataFreshness present
      - limit respected

### Verification

```bash
npm run test:run                       # frontend tests pass
npx vitest run --project functions     # backend tests pass
npm run check                          # lint + typecheck + doc links
cd functions && npm run build          # compiles
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 5 → DONE
- [x] Record test count

### Review Gate 5

**Prompt:** "Review Phase 5 of competitive-intelligence Этапы 2+3 (vector search + findSimilarVideos packaging). Read feature doc sections 'Embedding storage', 'Channel scoping', 'Query vector'. Check:
1. Does `vectorSearch.ts` batch channels into chunks of 30? Is merge by distance correct (ascending = most similar first)?
2. Is `limit * 3` used for over-fetch per batch?
3. Does `findSimilarVideos` handle BOTH competitor video (read embedding) and own video (generate on-the-fly)?
4. Is the query video itself filtered from results?
5. Are hidden videos filtered AFTER vector search?
6. Are view deltas enriched via `getViewDeltas` with `channelIdHints`?
7. Is `performanceTier` per-channel (not global)?
8. Does `similarityScore` correctly convert from Firestore distance to similarity [0, 1]?
9. Is `coverage` metadata present with `{indexed, total}`?
10. Is tool description clear for LLM? Does it reference when to call (after browseTrendVideos)?
11. Is frontend ToolCallSummary updated?
12. Run all tests + `cd functions && npm run build`."

Fix all findings before moving to Phase 5.5.

---

## Phase 5.5: Deploy + Backfill

**Goal:** Задеплоить Cloud Functions и запустить backfill для существующих ~8000 видео.

### 🧑‍💻 HUMAN ACTION — все шаги ручные

**Предпосылки:**
- Phase 5 завершена (findSimilarVideos может использовать embeddings сразу)
- Firestore vector indexes созданы и активны (packaging — Phase 5, visual — Phase 7)

**Шаг 1: Deploy**
```bash
cd functions
npm run deploy
```
Это задеплоит ВСЕ новые функции: `scheduledEmbeddingSync`, `backfillEmbeddings`, `findSimilarVideos` handler (через aiChat).

**Шаг 2: Получить URL backfill функции**
```bash
firebase functions:list
```
Или в Firebase Console → Functions → найти `backfillEmbeddings` → скопировать URL.

**Шаг 3: Запустить backfill**
```bash
curl -X POST <BACKFILL_FUNCTION_URL> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -d '{"offset": 0}'
```
⚠️ Нужен identity token для auth (Cloud Functions gen2 требует аутентификацию).

**Шаг 4: Мониторинг**
```bash
firebase functions:log --only backfillEmbeddings
```
Логи покажут: `backfill:batchComplete` для каждого batch, `backfill:complete` когда закончится.

**Ожидания:**
- ~80 batch'ей × ~1-2 минуты ≈ 1.5-2.5 часа (concurrent `pLimit(5)`, Cloud Tasks chain)
- Стоимость: ~$1.12 за 8000 видео (concurrency не влияет на цену — same API calls)
- Budget safeguard: остановится при $5/месяц

**Если прервётся:**
- Перезапуск с того же offset: `{"offset": <last_successful_offset>}` (из логов)
- Или с нуля: `{"offset": 0}` (idempotent, пересоздаст state, пропустит уже обработанные)

### Phase Status update

После успешного завершения backfill — отметить Phase 5.5 → DONE в таблице.

---

## Phase 6: Visual Embeddings (Этап 3)

**Goal:** Добавить visual embedding generation через Vertex AI для thumbnail image similarity.

### CRITICAL CONTEXT

- ⚠️ `@google-cloud/aiplatform` ещё НЕ установлен. Нужен `npm install` перед этой фазой
- ⚠️ Vertex AI auth: service account ADC (не API key). В Cloud Functions — автоматически. Локально — `gcloud auth application-default login`
- ⚠️ IAM role `Vertex AI User` — уже выдана (подтверждено пользователем)
- ⚠️ `multimodalembedding@001` принимает base64-encoded bytes (не HTTP URL). Pipeline: download thumbnail → base64 → send to Vertex
- ⚠️ Thumbnail download: переиспользовать fallback chain из `thumbnailDescription.ts` (Phase 2)
- ⚠️ Region: `us-central1` (рекомендованный, максимальные квоты)
- ⚠️ Rate limit: 120-600 RPM. Backfill уважает rate limits (sequential processing в batch)

### 🧑‍💻 HUMAN ACTION REQUIRED — перед Phase 6

**Шаг 1:** Установить Vertex AI SDK:
```bash
cd functions
npm install @google-cloud/aiplatform
```

**Шаг 2:** Убедиться, что Vertex AI API включён:
```bash
gcloud services list --enabled | grep aiplatform
```
Если не в списке:
```bash
gcloud services enable aiplatform.googleapis.com
```

**Шаг 3:** Для локальной разработки (опционально):
```bash
gcloud auth application-default login
```

---

### Tasks

- [x] **T6.1** — Visual embedding generator
  - Create: `functions/src/embedding/visualEmbedding.ts`
  - Function: `generateVisualEmbedding(videoId: string): Promise<number[] | null>`
  - Logic:
    1. Download thumbnail with fallback chain (reuse logic from `thumbnailDescription.ts` — extract into shared helper `downloadThumbnail(videoId): Promise<Buffer | null>`)
    2. Convert to base64: `buffer.toString('base64')`
    3. Call Vertex AI:
       ```typescript
       import { PredictionServiceClient } from '@google-cloud/aiplatform';
       const client = new PredictionServiceClient({
         apiEndpoint: 'us-central1-aiplatform.googleapis.com',
       });
       const endpoint = `projects/${projectId}/locations/us-central1/publishers/google/models/multimodalembedding@001`;
       const [response] = await client.predict({
         endpoint,
         instances: [{ image: { bytesBase64Encoded: base64 } }],
       });
       return response.predictions[0].imageEmbedding; // 1408d
       ```
    4. On error → `logger.warn("visualEmbedding:failed", { videoId, error })`, return `null`
  - ⚠️ Project ID: `process.env.GCLOUD_PROJECT` или `process.env.GCP_PROJECT` (в Cloud Functions — автоматически)
  - ⚠️ Auth: ADC автоматическая, НЕ нужен API key
  - ⚠️ Cached client: `PredictionServiceClient` — создать один раз (module-level lazy init, паттерн `gemini/client.ts`)
  - Estimated cost: $0.0001 per image

- [x] **T6.2** — Update embeddingSync для visual
  - File: `functions/src/embedding/embeddingSync.ts`
  - Добавить в sync logic (step 4-5):
    - Check `visualEmbeddingVersion < CURRENT_VISUAL_MODEL_VERSION` → generate visual embedding
    - Параллелизация в step 5 (3 операции):
      ```
      ├─ generatePackagingEmbedding(title, tags, description, apiKey)
      ├─ generateThumbnailDescription(videoId, apiKey)
      └─ generateVisualEmbedding(videoId)  // NEW
      ```
    - Save: add `visualEmbedding`, `visualEmbeddingVersion` to doc
    - Cost estimation update: +$0.0001 per video for visual
  - ⚠️ Visual embedding optional: если Vertex AI недоступен → `visualEmbedding: null`. Packaging + description всё равно генерируются. Partial failure не блокирует sync
  - Update `EmbeddingSyncResult` в types если нужно (добавить breakdown по типу embedding)

- [x] **T6.2b** — Update backfill для visual
  - File: `functions/src/embedding/backfillEmbeddings.ts`
  - Добавить visual embedding generation в batch processing (аналогично T6.2 для sync):
    - Idempotency check: skip if `visualEmbeddingVersion === CURRENT_VISUAL_MODEL_VERSION`
    - Параллелизация per video: `Promise.all([packaging, description, visual])` (3 операции)
    - Cost estimation update: +$0.0001 per video
  - ⚠️ Backfill может запускаться ДО того, как все thumbnails доступны — `visualEmbedding: null` допустимо, `scheduledEmbeddingSync` подхватит при следующем запуске

- [x] **T6.3** — Refactor thumbnail download to shared helper
  - Extract from `thumbnailDescription.ts`: `downloadThumbnail(videoId: string): Promise<{ buffer: Buffer; resolution: string } | null>`
  - Create: `functions/src/embedding/thumbnailDownload.ts`
  - Reuse in both `thumbnailDescription.ts` и `visualEmbedding.ts`
  - ⚠️ SRP: download + fallback chain = one file. Consumers decide what to do with buffer (base64 for Vertex, inline for Gemini)

- [x] **T6.4** — Tests
  - Create: `functions/src/embedding/__tests__/visualEmbedding.test.ts`
    - Mock: `PredictionServiceClient`, `downloadThumbnail`
    - Cases:
      - Normal: thumbnail downloaded → base64 → Vertex AI → returns 1408d array
      - Thumbnail unavailable (all 404) → returns null
      - Vertex AI API error → returns null, logs warning
      - Correct endpoint format (project/location/publisher/model)
  - Create: `functions/src/embedding/__tests__/thumbnailDownload.test.ts`
    - Mock: `axios`
    - Cases:
      - maxresdefault available → returns buffer + resolution
      - maxres 404, sddefault available → fallback
      - All 404 → returns null
      - Non-image content type → returns null
  - Update: `functions/src/embedding/__tests__/embeddingSync.test.ts`
    - Add case: visual embedding generated alongside packaging
    - Add case: visual embedding fails, packaging succeeds → partial save
  - Update: `functions/src/embedding/__tests__/backfillEmbeddings.test.ts`
    - Add case: backfill generates visual embedding alongside packaging + description
    - Add case: video already has current visual version → skip visual (idempotent)
    - Add case: visual generation fails → packaging + description still saved, visual = null

### Verification

```bash
npx vitest run --project functions     # backend tests pass
npm run check                          # lint + typecheck
cd functions && npm run build          # compiles (new dependency)
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 6 → DONE
- [x] Record test count (531 backend, 815 total)

### Review Gate 6

**Prompt:** "Review Phase 6 of competitive-intelligence Этапы 2+3 (visual embeddings). Read `docs/features/chat/tools/layer-4-competition/vertex-ai-setup.md`. Check:
1. Does `visualEmbedding.ts` use `PredictionServiceClient` with correct `apiEndpoint` (us-central1)?
2. Is the endpoint path correct? `projects/${projectId}/locations/us-central1/publishers/google/models/multimodalembedding@001`
3. Is thumbnail downloaded as Buffer → base64 (not passed as URL)?
4. Is `PredictionServiceClient` cached (module-level lazy init)?
5. Does `downloadThumbnail` implement full fallback chain (maxres → sd → mq)?
6. Is `downloadThumbnail` extracted as shared helper (used by both `thumbnailDescription` and `visualEmbedding`)?
7. Does `embeddingSync` generate visual embedding in parallel with packaging + description?
8. Is visual embedding failure handled independently (packaging still saves if visual fails)?
9. Is `backfillEmbeddings` updated to include visual generation? (T6.2b — separate task from embeddingSync update)
10. Is backfill idempotent for visual? (skips if `visualEmbeddingVersion === CURRENT_VISUAL_MODEL_VERSION`)
11. Are backfill tests updated? (visual alongside packaging, visual skip, visual failure → partial save)
12. Does `cd functions && npm run build` compile? (new `@google-cloud/aiplatform` dependency)
13. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 6.5.

---

## Phase 6.5: Re-deploy + Visual Backfill

**Goal:** Задеплоить обновлённые Cloud Functions (с visual embedding support) и запустить backfill для генерации visual embeddings у ~8000 существующих видео.

### CRITICAL CONTEXT

- ⚠️ Phase 5.5 уже сгенерила `packagingEmbedding` + `thumbnailDescription` для всех видео. Visual embeddings = единственное, чего не хватает
- ⚠️ Backfill idempotent: проверяет `visualEmbeddingVersion === CURRENT_VISUAL_MODEL_VERSION`. Видео с текущим packaging version — пропускаются (packaging + description НЕ перегенерируются). Генерится только `visualEmbedding`
- ⚠️ `scheduledEmbeddingSync` (daily 00:30 UTC) подхватит visual для НОВЫХ видео автоматически, но ~8000 существующих требуют явного backfill
- ⚠️ Стоимость visual backfill: ~$0.0001 × 8000 = ~$0.80 (только visual, packaging/description пропускаются)
- ⚠️ Время: ~80 batch'ей × ~3 минуты (быстрее Phase 5.5 — только 1 API call per video вместо 2)

### 🧑‍💻 HUMAN ACTION — все шаги ручные

**Предпосылки:**
- Phase 6 завершена (backfill код обновлён для visual embeddings — T6.2b)
- `@google-cloud/aiplatform` установлен
- Vertex AI API включён
- IAM role `Vertex AI User` выдана

**Шаг 1: Re-deploy**
```bash
cd functions
npm run deploy
```
Это задеплоит обновлённые функции: `backfillEmbeddings` (теперь с visual), `scheduledEmbeddingSync` (теперь с visual).

**Шаг 2: Запустить visual backfill**
```bash
curl -X POST <BACKFILL_FUNCTION_URL> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -d '{"offset": 0}'
```
⚠️ Backfill пересоздаст `system/backfillState` (batch 0 discovery), но для каждого видео:
- `packagingEmbeddingVersion === CURRENT` → skip packaging (уже есть)
- `thumbnailDescription !== null` → skip description (уже есть)
- `visualEmbeddingVersion < CURRENT` → generate visual embedding ✓

**Шаг 3: Мониторинг**
```bash
firebase functions:log --only backfillEmbeddings
```
Ожидания: `batchGenerated` будет показывать только visual generations. `batchSkipped` будет высоким (packaging/description уже есть).

**Шаг 4: Verify coverage**
После завершения — проверить `system/embeddingStats` в Firebase Console:
- `byChannel[channelId].visual` должен быть ≈ `byChannel[channelId].packaging` для каждого канала

**Если прервётся:**
- Тот же паттерн, что Phase 5.5: resume с `{"offset": <last_offset>}` или restart с `{"offset": 0}` (idempotent)

### Phase Status update

После успешного завершения visual backfill — отметить Phase 6.5 → DONE в таблице.

---

## Phase 7: Extend findSimilarVideos (mode: visual + both)

**Goal:** Добавить mode: visual (image similarity) и mode: both (RRF merge packaging + visual).

### CRITICAL CONTEXT

- ⚠️ RRF (Reciprocal Rank Fusion): `score(d) = Σ 1/(k + rank_i(d))`. `k=60`, union. Если doc в обоих списках: `1/(60+rank_packaging) + 1/(60+rank_visual)`. Если в одном: `1/(60+rank_i) + 0`
- ⚠️ `limit_per_search = 100` (each vector search returns top-100 before merge)
- ⚠️ `final_limit = 20` (default)
- ⚠️ Query vector для mode: visual (своё видео): download thumbnail → base64 → call `generateVisualEmbedding`
- ⚠️ Query vector для mode: both (своё видео): оба вызова параллельно (`Promise.all`)
- ⚠️ Coverage metadata: separate counts per mode for `both` — `{ packaging: {indexed, total}, visual: {indexed, total} }`
- ⚠️ `thumbnailDescription` в ответе: присутствует для visual и both modes (AI может объяснить ПОЧЕМУ обложки похожи)

### ✅ HUMAN ACTION COMPLETED — перед Phase 7

**Что было сделано:** создан Firestore composite vector index для visual embedding.

```bash
gcloud firestore indexes composite create \
  --collection-group=globalVideoEmbeddings \
  --query-scope=COLLECTION \
  --field-config=order=ASCENDING,field-path=youtubeChannelId \
  --field-config field-path=visualEmbedding,vector-config='{"dimension":"1408","flat":"{}"}' \
  --database='(default)'
```

Index ID: `CICAgJim14AK` — created 2026-03-09.

---

### Tasks

- [x] **T7.1** — mode: visual
  - File: `functions/src/services/tools/handlers/competition/findSimilarVideos.ts`
  - Добавить ветку `mode === 'visual'`:
    1. Resolve query vector:
       - Competitor video → read `visualEmbedding` from `globalVideoEmbeddings/{videoId}`
       - Own video → download thumbnail → `generateVisualEmbedding(videoId)`
       - If `visualEmbedding` null (competitor video without visual embedding) → `{ error: "Visual embedding not available for this video" }`
    2. Vector search: `findNearestVideos({ queryVector, field: 'visualEmbedding', ... })`
    3. Same post-processing: hidden filter, view deltas, performance tier
    4. Add `thumbnailDescription` to each result (read from embedding doc)
    5. Coverage: `{ indexed: count with non-null visualEmbedding, total }`
  - ⚠️ `thumbnailDescription` может быть null для некоторых видео — включать `null` в ответ, LLM разберётся

- [x] **T7.2** — mode: both (RRF merge)
  - File: `functions/src/services/tools/handlers/competition/findSimilarVideos.ts`
  - Create helper: `rrfMerge(packagingResults, visualResults, k, finalLimit)`
  - Добавить ветку `mode === 'both'`:
    1. Resolve BOTH query vectors (параллельно):
       ```typescript
       const [packagingVector, visualVector] = await Promise.all([
         resolvePackagingVector(videoId, ...),
         resolveVisualVector(videoId, ...),
       ]);
       ```
    2. Two parallel vector searches:
       ```typescript
       const [packagingResults, visualResults] = await Promise.all([
         findNearestVideos({ queryVector: packagingVector, field: 'packagingEmbedding', limit: 100, ... }),
         findNearestVideos({ queryVector: visualVector, field: 'visualEmbedding', limit: 100, ... }),
       ]);
       ```
    3. RRF merge:
       ```typescript
       function rrfMerge(lists: Array<Array<{videoId, ...}>>, k = 60, finalLimit = 20) {
         const scores = new Map<string, { score: number; data: any }>();
         for (const list of lists) {
           list.forEach((item, index) => {
             const rank = index + 1;  // 1-indexed per original RRF paper (Cormack et al. 2009)
             const existing = scores.get(item.videoId);
             const rrfScore = 1 / (k + rank);
             if (existing) {
               existing.score += rrfScore;
             } else {
               scores.set(item.videoId, { score: rrfScore, data: item });
             }
           });
         }
         return [...scores.entries()]
           .sort((a, b) => b[1].score - a[1].score)
           .slice(0, finalLimit)
           .map(([videoId, { score, data }]) => ({ ...data, rrfScore: score }));
       }
       ```
    4. Post-processing: hidden filter, view deltas, performance tier, thumbnailDescription
    5. Coverage from `system/embeddingStats` cache: `{ packaging: {indexed: sumPackaging, total: sumTotal}, visual: {indexed: sumVisual, total: sumTotal} }` — same 1-read pattern as mode: packaging (Phase 5 T5.2)
  - ⚠️ Edge case: один из vectors null (e.g., video без visual embedding) → fallback to single-mode search, add `_note` explaining

- [x] **T7.3** — Update tool definition
  - File: `functions/src/services/tools/definitions.ts`
  - Update `findSimilarVideos` definition:
    - `mode`: enum → `["packaging", "visual", "both"]`
    - Description update: mention visual search and combined search
    - Add guidance: "Use `packaging` for topic similarity, `visual` for thumbnail/visual style similarity, `both` for comprehensive match. `both` uses Reciprocal Rank Fusion to combine results."

- [x] **T7.4** — Tests
  - Update: `functions/src/services/tools/handlers/competition/__tests__/findSimilarVideos.test.ts`
    - Cases for mode: visual:
      - Competitor video with visualEmbedding → visual search results
      - Competitor video without visualEmbedding → error
      - Own video → generates visual embedding on-the-fly
      - thumbnailDescription included in results
      - Visual coverage metadata
    - Cases for mode: both:
      - Both vectors available → two searches → RRF merge
      - Video in both packaging AND visual results → higher RRF score
      - Video in only one result → lower RRF score (but still included — union)
      - One vector unavailable → fallback to single mode + `_note`
      - Coverage metadata has both packaging and visual counts
  - Create: `functions/src/embedding/__tests__/rrfMerge.test.ts` (if extracted as utility)
    - Cases:
      - Two lists, overlap → correct RRF scores
      - Two lists, no overlap → union, each gets single-list score
      - Empty list → empty result
      - k parameter affects ranking
      - finalLimit respected

### Verification

```bash
npm run test:run                       # frontend tests pass
npx vitest run --project functions     # backend tests pass
npm run check                          # lint + typecheck
cd functions && npm run build          # compiles
```

**Session handoff notes (2026-03-09):**
- T7.1–T7.4 code is DONE: handler refactored (`lookupVideo` + `getPackagingVector`/`getVisualVector`), `rrfMerge.ts` created, definitions updated, tests written (20 handler + 8 RRF = 28 new tests)
- `npm run check` passes (lint + typecheck + doc links)
- `cd functions && npm run build` passes
- Backend tests pass: 544 (39 files) — verified via `npx vitest run --project functions`
- **Remaining:** run full `npm run test:run` (frontend + backend), verify no regressions. Then run Review Gate 7 subagent
- **Also:** dynamic import fix for `@google-cloud/aiplatform` in `visualEmbedding.ts` (cold start fix) — needs re-deploy
- **Also:** Phase 6.5 visual backfill was running during session — check `system/embeddingStats` for completion, then mark 6.5 → DONE

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 7 → DONE (after Review Gate)
- [x] Record test count: 828 total (284 frontend + 544 backend)

### Review Gate 7

**Prompt:** "Review Phase 7 of competitive-intelligence Этапы 2+3 (visual + both modes). Read feature doc sections 'findSimilarVideos (mode: visual / both)' and 'RRF'. Check:
1. Does mode: visual resolve query vector correctly (competitor = read, own = generate)?
2. Does mode: visual handle missing `visualEmbedding` (null) gracefully?
3. Is `thumbnailDescription` included in visual/both results?
4. Is RRF implementation correct? Formula: `score(d) = Σ 1/(k + rank_i(d))`, `k=60`, union semantics
5. Does mode: both run packaging + visual searches in parallel?
6. Does mode: both handle edge case where one vector is unavailable? (fallback to single mode + `_note`)
7. Is coverage metadata correct for `both` mode? (`{ packaging: {...}, visual: {...} }`)
8. Is tool definition updated with all 3 modes and guidance?
9. Are RRF merge tests thorough? (overlap, no overlap, empty, k parameter, finalLimit)
10. Run all tests + `cd functions && npm run build`."

Fix all findings before moving to Phase 8.

---

## Phase 8: Documentation

**Goal:** Tool doc для `findSimilarVideos`, обновление feature doc, telescope diagram.

### Tasks

- [x] **T8.1** — Tool doc
  - Created: `docs/features/chat/tools/layer-4-competition/4-find-similar-videos-tool.md`
  - Structure (follow pattern of existing tool docs in `docs/features/chat/tools/`):
    - What it does, when LLM should call
    - Input/output schema for each mode (packaging, visual, both)
    - Example responses (from feature doc)
    - Coverage metadata explanation
    - RRF merge explanation (for mode: both)
    - Token budget estimates
    - Dependencies (browseTrendVideos for videoId, globalVideoEmbeddings for data)

- [x] **T8.2** — Update feature doc
  - File: `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md`
  - Move `← YOU ARE HERE` marker past Этап 3
  - Update "Текущее состояние": describe all 3 stages as done
  - Mark Этап 2 and Этап 3 checklists as `[x]`
  - Update Technical Implementation section:
    - Add files created in Этапы 2-3
    - Update telescope pattern diagram (add `findSimilarVideos`)
  - Update `vertex-ai-setup.md` checklist (mark IAM as done)

- [x] **T8.3** — Update telescope diagram
  - File: `docs/features/chat/tools/README.md`
  - Add `findSimilarVideos` to Layer 4 line:
    ```
    Layer 4: Competition → listTrendChannels, browseTrendVideos, getNicheSnapshot, findSimilarVideos
    ```

### Verification

```bash
npm run check    # doc link checker validates new/updated files
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 8 → DONE

### Review Gate 8

**Prompt:** "Review Phase 8 of competitive-intelligence Этапы 2+3 (documentation). Check:
1. Does `find-similar-videos.md` follow the pattern of existing tool docs?
2. Are example responses consistent with actual handler output format?
3. Is feature doc `competitive-intelligence.md` updated with current state?
4. Are all Этап 2 and Этап 3 checklist items marked `[x]`?
5. Is `← YOU ARE HERE` marker moved past Этап 3?
6. Is telescope diagram updated in `docs/features/chat/tools/README.md`?
7. Is Technical Implementation section updated with new file paths?
8. Run `npm run check` (doc link checker)."

Fix all findings before FINAL.

---

## FINAL: Double Review-Fix Cycle

### R1: Architecture Review

Spawn a review agent:

**Prompt:** "Architecture review of competitive-intelligence Этапы 2+3 (embedding infrastructure + findSimilarVideos). Read `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md` for full context. Check ALL:

1. **Embedding generation purity**: `packagingEmbedding.ts`, `thumbnailDescription.ts`, `visualEmbedding.ts` — each has single responsibility? No cross-dependencies between generators?
2. **Two SDK isolation**: `@google/genai` used for packaging+descriptions, `@google-cloud/aiplatform` ONLY for visual. No mixing?
3. **Budget tracker atomicity**: `FieldValue.increment` used (not read-modify-write)? Month rollover race-safe?
4. **Sync pipeline decoupling**: `scheduledEmbeddingSync` has NO imports from `trends/scheduledSync`. Completely independent entry point?
5. **Backfill idempotency**: re-running backfill on same data = 0 new embeddings generated?
6. **Vector search correctness**: `findNearestVideos` batches >30 channels correctly? Merge by distance preserves global ranking?
7. **RRF implementation**: k=60, union semantics, correct formula? Does NOT depend on scale of similarity scores?
8. **Hidden video filtering**: happens AFTER vector search (not in pre-filter)?
9. **View deltas**: runtime enrichment via `trendSnapshotService`, NOT stored in embedding doc?
10. **Coverage metadata**: accurately reflects indexed vs total for user's channels?
11. **Query vector resolution**: competitor (read from doc) vs own (generate on-the-fly) correctly handled for ALL 3 modes?
12. **Firestore security rules**: `globalVideoEmbeddings` and `system` collections have explicit deny for client-side?
13. **Type source of truth**: all types in `functions/src/embedding/types.ts`, no duplicates?
14. **Constants**: model versions, dimensions, budget limits — all from `types.ts`, no hardcoded values?
15. Run `npm run test:run && npx vitest run --project functions && npm run check && cd functions && npm run build`."

Fix all R1 findings.

### R2: Production Readiness Review

Spawn a review agent:

**Prompt:** "Production readiness review of competitive-intelligence Этапы 2+3. Check ALL:

1. **Error handling**: do ALL generators return null on error (not throw)? Does sync continue after per-video failure?
2. **Budget safeguard**: is $5/month limit enforced? Does backfill stop mid-chain if budget exhausted? Can sync and backfill race on budget? (both check before proceeding — safe)
3. **Rate limits**: is processing sequential within batch (respecting RPM)? Is there any unbounded parallelism?
4. **Cold start**: first `findSimilarVideos` call — any heavy init (PredictionServiceClient, GoogleGenAI)? Are clients cached?
5. **Token budget**: findSimilarVideos with 20 results + view deltas + thumbnailDescriptions — total response size within LLM context? Estimate token count.
6. **Observability**: are ALL structured logs from feature doc implemented? (embeddingSync:complete, backfill:batchComplete, budget thresholds, persistent failures)
7. **Partial embeddings**: does findSimilarVideos work correctly when only 50% of videos have embeddings? Does coverage metadata accurately reflect this?
8. **Backfill resilience**: if batch fails mid-way, does Cloud Task retry work? Is the retry idempotent?
9. **Security**: Firestore rules deny client access to globalVideoEmbeddings and system? Admin SDK bypasses correctly?
10. **Backwards compatibility**: existing tools (listTrendChannels, browseTrendVideos, getNicheSnapshot) unaffected? No regressions?
11. **Cleanup**: are there any orphaned files, TODO comments, or debug logs left?
12. **Docs**: does `npm run check` pass? Are all doc references valid? Is feature doc accurate?
13. Run all test suites one final time: `npm run test:run && npx vitest run --project functions && npm run check && cd functions && npm run build`."

Fix all R2 findings.

### Final Verification

```bash
npm run test:run                       # frontend
npx vitest run --project functions     # backend
npm run check                          # lint + typecheck + doc links
cd functions && npm run build          # compiles
```

**MANDATORY: Update this file:**
- [x] Update Phase Status table: FINAL → DONE
- [x] Record final test count: 828 (284 frontend + 544 backend, 61 files)
- [x] Update `docs/features/chat/tools/layer-4-competition/competitive-intelligence.md`:
  - Move `← YOU ARE HERE` marker to final position
  - Ensure "Текущее состояние" reflects all 3 stages complete
- [x] Update related docs if affected:
  - `docs/features/chat/README.md` — checked, Stage 6 references already present
  - `docs/backlog.md` — no applicable items

### R1 Results (2026-03-09)
- **14/15 PASS, 1 FAIL (fixed)**
- FAIL: `COST_PER_VIDEO` duplicated in `embeddingSync.ts` and `backfillEmbeddings.ts` → moved to `types.ts` as SSOT

### R2 Results (2026-03-09)
- **13/13 PASS**
- All checks passed: error handling, budget safeguard, rate limits, cold start, token budget, observability, partial embeddings, backfill resilience, security, backwards compatibility, cleanup, docs, test suites
