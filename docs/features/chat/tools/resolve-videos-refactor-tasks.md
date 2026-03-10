# Video Resolver Refactor — Tasks

## Overview

Рефакторинг `resolveVideosByIds` и связанных handlers, чтобы LLM tools имели доступ ко **всем слоям** видео-данных в Firebase. Сейчас resolver ищет только в 2 из 3 user-scoped коллекций — конкурентские видео из Trends невидимы для `mentionVideo`, `getMultipleVideoDetails`, `viewThumbnails`.

Побочная цель: выровнять архитектуру batch-reads по кодовой базе (паттерн `db.getAll()` вместо `Promise.all([doc.get()])`).

**Feature docs:**
- `docs/features/chat/tools/utility/mention-video-tool.md`
- `docs/features/chat/tools/layer-2-detail/1-get-multiple-video-details-tool.md`
- `docs/features/chat/tools/layer-2-detail/2-view-thumbnails-tool.md`

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. **Этот файл** (статус + чеклисты)
2. `functions/src/services/tools/utils/resolveVideos.ts` (текущий resolver, 2 шага)
3. `functions/src/services/tools/handlers/getNicheSnapshot.ts` строки 66-98 (reference: как правильно искать в trendChannels через `db.getAll()`)
4. `functions/src/services/tools/handlers/findSimilarVideos.ts` строки 56-112 (reference: `lookupVideo` — 3-layer cascade)
5. `functions/src/services/tools/definitions.ts` (tool definitions для LLM)
6. `functions/src/services/tools/executor.ts` (handler registry)

### Key Decisions (carry forward)

1. **`db.getAll()` — единственный паттерн для multi-doc reads.** Один network round-trip вместо N параллельных. `getNicheSnapshot` строки 86-89 — reference implementation. `Promise.all([doc.get() × N])` — антипаттерн, заменять на `db.getAll(...refs)` везде.

2. **Resolver автономен — никаких hints от callers.** Elite Lens #1 (Deterministic vs magic): resolver сам знает где искать. LLM не должен "помнить" channelId из предыдущих вызовов. Tool definitions не загрязняются Firestore-путями. Auto-discovery: resolver сам читает `basePath/trendChannels`, callers не передают channel IDs.

3. **`globalVideoEmbeddings` — НЕ источник данных для resolver.** Коллекция специализирована для vector search. Даже если содержит денормализованные поля (title, tags) — это не authoritative source. Единственный новый источник: `trendChannels/*/videos/`.

4. **Порядок шагов resolver'а — cheapest first:**
   ```
   Шаг 1: videos/ + cached_external_videos/  → direct doc lookup (существующий)
   Шаг 2: publishedVideoId reverse lookup     → query (существующий)
   Шаг 3: trendChannels/*/videos/             → db.getAll() (НОВЫЙ)
   ```
   Шаг 3 срабатывает ТОЛЬКО для IDs, не найденных в Шагах 1-2.

5. **Шаг 3 — auto-discovery + getAll.** Один read `basePath/trendChannels` (список каналов) → `db.getAll(...refs)` для всех missing × channels за один round-trip. Кешировать список каналов внутри одного вызова resolver'а.

6. **Нормализация данных в resolver.** `trendChannels` использует те же поля (`thumbnail`, `title`, `tags`, `viewCount`, `publishedAt`). Единственное дополнение: `channelId` из пути документа (parent trendChannel ID). Consumers не меняют field access.

7. **`findSimilarVideos.lookupVideo()` остаётся отдельным.** Его задача — найти video + извлечь embeddings. Это НЕ та же задача что resolver (который возвращает metadata). Не объединять.

8. **`skipExternal: true` пропускает ВСЕ внешние источники.** Семантика: "только video_grid". Step 1 пропускает `cached_external_videos` (существующее поведение). Step 3 пропускает `trendChannels` (новое). Callers с `skipExternal` (`analyzeSuggestedTraffic`, `analyzeTrafficSources`) защищены автоматически — не нужно менять их код. Это semantic option ("мне нужны только свои видео"), а не mechanical option ("пропусти конкретную коллекцию").

9. **Step 3 — graceful degradation.** Если `trendChannels` collection read или `getAll` падает → `try/catch`, `console.warn`, вернуть результат Steps 1-2. Steps 1-2 — core data (ошибка пробрасывается). Step 3 — enrichment (ошибка глотается). Caller получит `missingIds` для ненайденных видео — это стандартный flow, который все callers уже обрабатывают.

10. **Step 3 — batching getAll refs.** `db.getAll()` принимает до 500 refs. При 50 каналах × 20 missing IDs = 1000 refs — превышение лимита. Batching: `GETALL_BATCH_SIZE = 500`, чанкировать refs как в Step 1 (`DOC_BATCH_SIZE = 100`). На практике после Steps 1-2 обычно 1-5 missing IDs, но resolver — generic utility, assumptions не допускаются.

## Agent Orchestration Strategy

- **Main context = executor + orchestrator.** Выполняет все фазы последовательно.
- **Subagents** — только для review gates (R1, R2).

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| P1 | Extend resolver + tests | TODO |
| P2 | Update consumers (mentionVideo, getMultipleVideoDetails, viewThumbnails) | TODO |
| P3 | Batch-read alignment (findSimilarVideos, browseTrendVideos) | TODO |
| FINAL | Double review | TODO |

## Current Test Count

**360 frontend (25 files) + 684 backend (47 files) = 1044 total (72 files)**

---

## Consumer Impact Analysis

Полный аудит всех 13 LLM tools — какие затронуты рефакторингом, какие нет.

### Затронуты (P2: consumer logic changes)

| Handler | Resolver? | Что менять |
|---------|-----------|------------|
| `mentionVideo` | ✅ | `source: "trend_channel"` → `ownership: "competitor"` |
| `getMultipleVideoDetails` | ✅ | Новый CollectionSource, `formatVideoData` для `trend_channel` |
| `viewThumbnails` | ✅ | Расширить `resolveVideoIdsByTitle()` на trendChannels |

### Затронуты (P3: getAll alignment only)

| Handler | Что менять |
|---------|------------|
| `findSimilarVideos` | `Promise.all([doc.get()])` → `db.getAll()` в `lookupVideo()` |
| `browseTrendVideos` | `Promise.all([doc.get()])` → `db.getAll()` для channel doc reads |

### НЕ затронуты

| Handler | Resolver? | Почему не менять |
|---------|-----------|------------------|
| `browseChannelVideos` | ✅ | Step 3 = бонус (меньше YT API calls). `ownChannelSync` фильтрует по `video_grid` — корректно исключает `trend_channel`. Output (title, viewCount, thumbnail) работает с любым source |
| `getNicheSnapshot` | ✅ (fallback) | Свой trendChannels lookup (строки 66-98) до resolver'а. Resolver вызывается последним для own videos. Worst case: двойной scan trendChannels для несуществующего видео (1 лишний read, edge case) |
| `analyzeSuggestedTraffic` | ✅ `skipExternal` | `skipExternal: true` пропустит Step 3 (Key Decision #8). Traffic subcollection только у own videos |
| `analyzeTrafficSources` | ✅ `skipExternal` | Аналогично `analyzeSuggestedTraffic` |
| `searchDatabase` | ❌ | Не использует resolver. Vector search через `globalVideoEmbeddings` |
| `listTrendChannels` | ❌ | Один collection read метаданных |
| `getChannelOverview` | ❌ | YouTube API only |
| `getVideoComments` | ❌ | YouTube API only |

---

## P1: Extend resolver with trendChannels lookup

**Goal:** `resolveVideosByIds` находит видео во всех 3 слоях пользовательских данных.

### Critical Context
- `basePath` = `users/{uid}/channels/{chId}` — передаётся первым аргументом
- `trendChannels` — subcollection под тем же basePath: `basePath/trendChannels/{tcId}/videos/{videoId}`
- `db.getAll()` принимает до 500 document refs. Batching обязателен (Key Decision #10)
- `ResolvedVideo.source` — enum, расширяется новым значением `"trend_channel"`
- Step 3 — graceful degradation: `try/catch` + `console.warn` (Key Decision #9)
- `skipExternal: true` пропускает Step 3 целиком (Key Decision #8)

### Tasks

- [ ] **T1.1** Добавить source тип `"trend_channel"` в `ResolvedVideo.source`
  - Файл: `functions/src/services/tools/utils/resolveVideos.ts` строка 29
  - Изменить: `source: "video_grid" | "external_cache" | "trend_channel"`

- [ ] **T1.2** Реализовать `resolveFromTrendChannels()` — новый internal helper
  - Файл: `functions/src/services/tools/utils/resolveVideos.ts`
  - Логика:
    1. `db.collection(basePath/trendChannels).get()` → массив channel IDs
    2. Для каждого missingId × каждого channelId → собрать `db.doc()` refs
    3. Batching: если refs.length > `GETALL_BATCH_SIZE` (500) → чанкировать
    4. `db.getAll(...refs)` — один batch call per chunk
    5. Маппинг найденных → `resolved.set(videoId, { ..., source: "trend_channel" })`
    6. Добавить `channelId` из пути (parent trendChannel ID) в `data`
  - ⚠️ Если один videoId найден в нескольких каналах — брать первый (break after first hit per videoId)
  - ⚠️ Кешировать trendChannelIds: один collection read на весь вызов resolver'а
  - ⚠️ Обернуть в `try/catch`: при failure → `console.warn("[resolveVideos] Step 3 failed:", err)`, return без изменений в `resolved`

- [ ] **T1.3** Интегрировать Step 3 в main `resolveVideosByIds()`
  - Файл: `functions/src/services/tools/utils/resolveVideos.ts` строки 91-96
  - Вставить после existing Step 2, до финального `missingIds` вычисления
  - Guard 1: `skipExternal` → skip Step 3 целиком
  - Guard 2: `missingAfterStep2.length === 0` → skip Step 3
  - Логировать: `[resolveVideos] Step 3: N checked → M found in trendChannels`

- [ ] **T1.4** Тесты для Step 3
  - Файл: `functions/src/services/tools/utils/__tests__/resolveVideos.test.ts`
  - Новая describe секция: `"resolveVideosByIds — trendChannels lookup (Step 3)"`
  - Кейсы:
    - Video найден в trendChannels после промаха Steps 1-2
    - Video НЕ найден нигде → остаётся в missingIds
    - Приоритет: video_grid > external_cache > trend_channel (не перезаписывать если уже найден)
    - Пустые trendChannels (0 каналов) → skip Step 3 без ошибок
    - `skipExternal: true` → Step 3 не вызывается
    - Добавление `channelId` в data из пути
    - Batch: 3 missing IDs × 2 channels = 6 refs в одном getAll
    - Graceful degradation: trendChannels read throws → возвращает результат Steps 1-2, без crash
  - ⚠️ Mock: `db.collection().get()` для trendChannels list + `db.getAll()` для video refs. Текущий mock (строка 8-16) нужно расширить: `db.collection()` сейчас возвращает фиксированный объект — нужно различать вызовы по path (videos/ vs trendChannels/)

### Parallelization

```
T1.1 — SEQUENTIAL FIRST (foundation: type change)
T1.2 + T1.3 — SEQUENTIAL (impl depends on T1.1, T1.3 depends on T1.2)
T1.4 — SEQUENTIAL LAST (tests for the above)
```

### Verification

```bash
npx vitest run functions/src/services/tools/utils/__tests__/resolveVideos.test.ts
npm run typecheck
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks
- [ ] Update Phase Status table (P1 → DONE)
- [ ] Record test count

---

## P2: Update consumers

**Goal:** `mentionVideo`, `getMultipleVideoDetails`, `viewThumbnails` корректно обрабатывают `source: "trend_channel"`.

### Critical Context
- Consumers используют `entry.source` для определения ownership
- `"trend_channel"` = конкурентское видео → ownership `"competitor"` / `"external"`
- `getMultipleVideoDetails` имеет YouTube API fallback для missing IDs — после фикса resolver'а, fallback срабатывает реже (только для видео не из trendChannels и не из cache)
- `viewThumbnails` имеет `resolveVideoIdsByTitle()` — title search тоже нужно расширить на trendChannels

### Tasks

- [ ] **T2.1** `mentionVideo` — обработать `source: "trend_channel"`
  - Файл: `functions/src/services/tools/handlers/mentionVideo.ts`
  - Изменить: `ownership` для `trend_channel` source → `"competitor"`
  - `channelTitle` — уже есть в `data` (нормализован resolver'ом в T1.2)
  - Thumbnail fallback: `data.thumbnail` || YouTube CDN URL (как сейчас)

- [ ] **T2.2** `getMultipleVideoDetails` — обработать `source: "trend_channel"`
  - Файл: `functions/src/services/tools/handlers/getMultipleVideoDetails.ts`
  - `CollectionSource` type (строка 126): добавить `"competitor"`
  - Маппинг в цикле (строка 39): `entry.source === "trend_channel"` → `collectionSource = "competitor"`
  - `formatVideoData` (строка 128): `"competitor"` → `ownership: "external"`, включить `channelId` из data
  - YouTube API fallback: без изменений — срабатывает для оставшихся `notFoundIds` (которых теперь меньше)

- [ ] **T2.3** `viewThumbnails` — расширить `resolveVideoIdsByTitle()`
  - Файл: `functions/src/services/tools/handlers/viewThumbnails.ts` строки 22-47
  - Добавить 3-й параллельный query: для каждого title → query каждый trendChannel
  - Паттерн: `db.collection(basePath/trendChannels).get()` → для каждого channel × каждого title → `.where("title", "==", title).limit(1).get()`
  - Приоритет: videos/ > cached_external_videos/ > trendChannels/
  - ⚠️ Trade-off: N channels × M titles queries. Для 10 каналов × 5 titles = 50 queries. Приемлемо — title search редкий path (в 95% случаев LLM уже имеет video ID из предыдущего tool call). Зафиксировать trade-off комментарием в коде, не добавлять safeguard cap

- [ ] **T2.4** Тесты consumers
  - Файлы: создать или расширить тесты для каждого consumer
  - `mentionVideo`: тест — competitor video resolved via trendChannels → `ownership: "competitor"`, `channelTitle` присутствует
  - `getMultipleVideoDetails`: тест — competitor video resolved из trendChannels → ownership `"external"`, YouTube API fallback НЕ вызывается для этого ID
  - `viewThumbnails`: тест — title resolved из trendChannels когда videos/ и cached_external/ не нашли

### Parallelization

```
T2.1 + T2.2 + T2.3 — PARALLEL (независимые handlers)
T2.4 — SEQUENTIAL LAST (тесты после всех impl)
```

### Verification

```bash
npx vitest run --project functions
npm run typecheck
npm run lint
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks
- [ ] Update Phase Status table (P2 → DONE)
- [ ] Record test count

---

## P3: Batch-read alignment

**Goal:** Привести все handlers к единому паттерну `db.getAll()` для multi-doc reads.

### Critical Context
- `db.getAll(...refs)` — один network round-trip, Firestore billing = N reads, latency = 1 call
- `Promise.all([doc.get() × N])` — N network round-trips, Firestore billing = N reads, latency = max(N calls)
- Разница в latency: ~50ms (getAll) vs ~200ms (Promise.all) при 10 refs
- `getNicheSnapshot` строки 86-89 — reference implementation

### Tasks

- [ ] **T3.1** `findSimilarVideos.lookupVideo()` — заменить Promise.all на db.getAll
  - Файл: `functions/src/services/tools/handlers/findSimilarVideos.ts` строки 89-96
  - Сейчас:
    ```typescript
    const checks = await Promise.all(
        trendSnap.docs.map((ch) =>
            db.doc(`${basePath}/trendChannels/${ch.id}/videos/${videoId}`).get()
        )
    );
    ```
  - После:
    ```typescript
    const refs = trendSnap.docs.map((ch) =>
        db.doc(`${basePath}/trendChannels/${ch.id}/videos/${videoId}`)
    );
    const checks = await db.getAll(...refs);
    ```
  - ⚠️ Семантика идентична — `getAll` возвращает snaps в том же порядке что refs

- [ ] **T3.2** `browseTrendVideos` — batch channel doc reads
  - Файл: `functions/src/services/tools/handlers/browseTrendVideos.ts` строки 98-101
  - Сейчас: `Promise.all(channelIds.map(id => trendChannelsRef.doc(id).get()))` → filter exists
  - После: `db.getAll(...channelIds.map(id => trendChannelsRef.doc(id)))` → filter exists
  - Минорная оптимизация (обычно 2-5 channels), но выравнивает паттерн

- [ ] **T3.3** Тесты — убедиться что существующие тесты проходят
  - Никаких новых тестов не нужно — поведение не меняется, только latency
  - Если mock'и завязаны на `doc().get()` pattern → обновить mock'и для `getAll`

### Parallelization

```
T3.1 + T3.2 — PARALLEL (независимые handlers)
T3.3 — SEQUENTIAL LAST (проверка)
```

### Verification

```bash
npx vitest run --project functions
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks
- [ ] Update Phase Status table (P3 → DONE)
- [ ] Record test count

---

## FINAL: Double Review

### R1: Architecture Review

Промпт для review agent:

> Проверь рефакторинг video resolver'а. Прочитай файлы:
> 1. `functions/src/services/tools/utils/resolveVideos.ts`
> 2. `functions/src/services/tools/handlers/mentionVideo.ts`
> 3. `functions/src/services/tools/handlers/getMultipleVideoDetails.ts`
> 4. `functions/src/services/tools/handlers/viewThumbnails.ts`
> 5. `functions/src/services/tools/handlers/findSimilarVideos.ts` (lookupVideo)
> 6. `functions/src/services/tools/handlers/browseTrendVideos.ts`
> 7. `functions/src/services/tools/utils/__tests__/resolveVideos.test.ts`
>
> Проверить:
> 1. **Cascading order**: Steps 1 → 2 → 3 в resolver'е идут от cheapest к most expensive?
> 2. **No duplicate reads**: trendChannels collection читается максимум 1 раз за вызов resolve?
> 3. **getAll pattern**: все multi-doc reads используют `db.getAll()`, НЕ `Promise.all([doc.get()])`?
> 4. **Data normalization**: `channelId` добавляется в data для trend_channel source?
> 5. **Source priority**: video_grid > external_cache > trend_channel — не перезаписывается?
> 6. **Consumer ownership**: `mentionVideo` и `getMultipleVideoDetails` корректно определяют ownership для `trend_channel`?
> 7. **Title search**: `viewThumbnails` ищет titles в trendChannels?
> 8. **Empty state**: 0 trendChannels → resolver работает без ошибок?
> 9. **skipExternal**: Step 3 пропускается при `skipExternal: true`?
> 10. **Graceful degradation**: Step 3 failure → warning + Steps 1-2 results returned?
> 11. **getAll batching**: refs > 500 → chunked?
> 12. **Test coverage**: все новые кейсы покрыты (включая graceful degradation и skipExternal)?

Fix all findings before proceeding to R2.

### R2: Production Readiness Review

Промпт для review agent:

> Production readiness check для resolve-videos рефакторинга:
> 1. `npm run check` проходит без ошибок?
> 2. `npx vitest run --project frontend` — все тесты pass?
> 3. `npx vitest run --project functions` — все тесты pass?
> 4. Нет `console.log` дебаг-остатков (только `console.log` с `[resolveVideos]` prefix)?
> 5. Нет `any` типов в новом коде?
> 6. `getAll()` refs count < 500 per batch во всех realistic scenarios?
> 7. Нет breaking changes для существующих callers `resolveVideosByIds`?
> 8. `browseChannelVideos` — ownChannelSync корректно при `trend_channel` source?
> 9. `getNicheSnapshot` — нет двойного scan trendChannels для существующих видео?
> 10. `analyzeSuggestedTraffic` / `analyzeTrafficSources` — `skipExternal` блокирует Step 3?
> 11. Feature docs обновлены?

Fix all findings.

### MANDATORY: Update this file after FINAL
- [ ] Mark R1 + R2 complete
- [ ] Update Phase Status table (FINAL → DONE)
- [ ] Record final test count
- [ ] Move this file to `docs/archive/tasks/chat/` after completion
