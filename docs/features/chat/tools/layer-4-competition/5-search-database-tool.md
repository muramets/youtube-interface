# AI Tool: searchDatabase — Feature Doc

## Текущее состояние

**Реализовано.** Free-text семантический поиск по всей базе видео конкурентов. `generateQueryEmbedding` с `taskType: RETRIEVAL_QUERY` → cosine vector search по `globalVideoEmbeddings` → enrichment (view deltas, performance tiers, coverage).

---

## Что это

Telescope Pattern Layer 4 — свободный текстовый поиск по всей базе видео конкурентов. Когда пользователь спрашивает "какие видео в нише про SEO?", AI вызывает `searchDatabase({ query: "SEO" })` и получает семантически релевантные видео.

**Ключевое отличие от `findSimilarVideos`:**
- `findSimilarVideos` — "найди похожее на **это** видео" (вход: videoId)
- `searchDatabase` — "найди видео **про это**" (вход: текст)

Механизм похож: текст → 768d вектор → cosine search по `globalVideoEmbeddings`. Но embedding генерируется принципиально иначе — через отдельную функцию `generateQueryEmbedding` с `taskType: RETRIEVAL_QUERY` (см. раздел "Query vs Document Embedding").

---

## User flow

1. Пользователь: *"Какие видео в нише про путешествия в Исландию?"*
2. LLM вызывает `searchDatabase({ query: "Iceland travel vlog adventure" })`
3. Handler: query → embedding → vector search → filter hidden → enrich (deltas, tiers)
4. LLM получает ранжированный список и анализирует: кто снимает про Исландию? как перформят? есть ли тренд?

### Продвинутые сценарии

- *"Есть ли у конкурентов видео про AI?"* → `searchDatabase({ query: "artificial intelligence AI tools" })`
- *"Что MrBeast снимал про еду?"* → `searchDatabase({ query: "food challenge eating", channelIds: ["UCX6OQ3DkcsbYNE6H8uQQuVA"] })`
- *"Тренд на shorts в нише?"* → `searchDatabase({ query: "YouTube shorts vertical video" })`

---

## Параметры

| Параметр | Тип | Default | Описание |
|----------|-----|---------|----------|
| `query` | string | — | **Required.** Free-text search query (min 3 characters) |
| `channelIds` | string[] | all tracked | YouTube channel IDs (`UC...`) to search within. If omitted, searches all user's trend channels. Note: trendChannel Firestore doc ID === YouTube Channel ID (set at creation from `channels.list` response `item.id`) |
| `limit` | number | 20 | Max results (1–50) |

### Почему минимум фильтров

Vector search и жёсткие post-filters плохо сочетаются: если из top-50 по релевантности только 3 попадают в date range — результат обеднён. `channelIds` — единственный фильтр, применяемый **до** vector search (на уровне Firestore `findNearest`). Фильтрацию по дате, перформансу и т.д. LLM делает самостоятельно из обогащённых результатов.

---

## Что возвращает

```typescript
{
    query: string,                     // Echo: исходный запрос
    results: [{
        videoId: string,
        title: string,
        channelId: string,
        channelTitle: string,
        relevanceScore: number,        // 0–1, выше = релевантнее (1 - cosine_distance)
        publishedAt: string,
        viewCount: number,
        viewDelta24h: number | null,
        viewDelta7d: number | null,
        viewDelta30d: number | null,
        performanceTier: string,       // "Top 1%", "Top 5%", etc.
    }],
    totalFound: number,                // After hidden filter, before limit truncation
    coverage: { indexed: number, total: number },  // packaging embeddings only
    dataFreshness: [{ channelId, channelTitle, lastSynced }],
}
```

**Отличия от `findSimilarVideos`:**
- `query` вместо `referenceVideo` (нет исходного видео)
- `relevanceScore` вместо `similarityScore` (семантически точнее)
- Нет `sharedTags` (у текстового запроса нет тегов)
- Нет `mode` / `_note` (только packaging mode — visual бессмысленен для текста)

### Edge cases

| Ситуация | Поведение |
|----------|----------|
| Query < 3 символов | `{ error: "Query too short. Please provide at least 3 characters." }` |
| Нет trend каналов | `{ error: "No trend channels tracked. Add channels in Trends first." }` |
| Gemini API key missing | `{ error: "Gemini API key not configured." }` |
| Embedding generation fails | `{ error: "Failed to generate query embedding. Try again later." }` |
| channelIds не найдены | Ищет только среди существующих; если ни один не найден — пустой результат |
| 10+ hidden videos в top results | Результат может содержать < limit видео. Over-fetch (`limit + 10`) компенсирует типичный случай, но не гарантирует точно `limit` результатов |
| Gemini API rate limit | Each call = 1 Gemini embedding request. Unlike `findSimilarVideos` (stored embeddings for competitors), `searchDatabase` always hits the API. Under heavy use (rapid-fire queries + concurrent daily sync), RPM limits may trigger. Handler returns error, user retries |

---

## Token budget

| Компонент | ~Tokens |
|-----------|---------|
| Каждый результат | ~70 |
| 20 результатов | ~1,400 |
| Metadata (query, coverage, dataFreshness) | ~150 |
| **Total (20 results)** | **~1,550** |

Легче `findSimilarVideos` — нет `sharedTags`, `thumbnailDescription`, `referenceVideo.tags`.

---

## Стоимость

| Компонент | Стоимость | Когда |
|-----------|-----------|-------|
| Gemini embedding API | ~$0.00004 | Каждый вызов (query → 768d vector) |
| Firestore reads | ~30 reads per batch | Каждый вызов (vector search) |
| Budget tracking | Не требуется | $0.00004/запрос × даже 1000 запросов/день = $0.04/день — пренебрежимо |

---

## Query vs Document Embedding

### Проблема

Документы в `globalVideoEmbeddings` сгенерированы через `generatePackagingEmbedding` с форматом:
```
Title: My Epic Iceland Trip
Tags: iceland, travel, vlog, adventure
Description: In this video I explore...
```

Если для поискового запроса использовать ту же функцию (`generatePackagingEmbedding("Iceland travel", [], "")`), input будет:
```
Title: Iceland travel
Tags:
Description:
```

Пустые `Tags:` и `Description:` — не нейтральная информация, а шум, который сдвигает вектор в неожиданные регионы embedding space.

### Решение: `generateQueryEmbedding`

Gemini Embedding API поддерживает параметр `taskType`:
- **`RETRIEVAL_DOCUMENT`** — "я даю полную карточку, запомни содержание"
- **`RETRIEVAL_QUERY`** — "я даю поисковый запрос, пойми что человек ИЩЕТ"

Для `searchDatabase` создаётся отдельная функция `generateQueryEmbedding(query, apiKey)`:
- Принимает чистый текст без обёрток `Title:` / `Tags:` / `Description:`
- Отправляет в Gemini с `taskType: RETRIEVAL_QUERY`
- Возвращает 768d вектор, оптимизированный для поиска по документам

### Принятое решение: не менять существующие embeddings

**Не добавляем** `taskType: RETRIEVAL_DOCUMENT` в `generatePackagingEmbedding`. Причины:

1. **Два инструмента — два use case.** `searchDatabase` = query ↔ document (асимметричная пара). `findSimilarVideos` = document ↔ document (симметричная задача). Если перегенерировать все embeddings с `RETRIEVAL_DOCUMENT`, `findSimilarVideos` может деградировать — embedding space оптимизирован для query ↔ document, а не document ↔ document.

2. **Дефолтный режим Gemini — приемлемый компромисс.** Без `taskType` модель генерирует "универсальный" embedding. Не идеален ни для retrieval, ни для similarity, но работает для обоих.

3. **`RETRIEVAL_QUERY` на стороне запроса — главный win.** 80% улучшения качества без риска для существующего функционала.

4. **Re-embedding = breaking change.** 4370 видео, бамп `packagingEmbeddingVersion`, full resync, тестирование качества `findSimilarVideos`.

---

## Зависимости

- **Prerequisite data:** `globalVideoEmbeddings` collection (daily sync заполняет)
- **Prerequisite infra:** `generateQueryEmbedding` (Gemini API, `taskType: RETRIEVAL_QUERY`), `findNearestVideos` (Firestore vector search)
- **Enrichment:** `trendSnapshotService.getViewDeltas()`, `shared/percentiles.ts`

---

## Связанные фичи

- [Telescope Pattern Overview](../README.md) — Layer 4: Competition
- [findSimilarVideos](./4-find-similar-videos-tool.md) — "брат-близнец": video-to-video similarity вместо text-to-video
- [browseTrendVideos](./2-browse-trend-videos-tool.md) — альтернатива: structured filters (дата, перформанс) вместо семантики
- [getNicheSnapshot](./3-get-niche-snapshot-tool.md) — window snapshot + aggregates
- [Competitive Intelligence](./competitive-intelligence.md) — roadmap и архитектура

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/searchDatabase.ts` | Handler: query embedding → vector search → enrichment |
| `functions/src/embedding/queryEmbedding.ts` | `generateQueryEmbedding(query, apiKey)` — text → 768d vector с `taskType: RETRIEVAL_QUERY`. Uses `getClient` from `services/gemini/client.ts` (singleton SDK instance, same as `packagingEmbedding.ts`) |
| `functions/src/services/tools/definitions.ts` | Tool declaration (query + channelIds + limit) |
| `functions/src/services/tools/executor.ts` | Registration in HANDLERS map |

### Тесты

| Файл | Tests |
|------|-------|
| `functions/src/embedding/__tests__/queryEmbedding.test.ts` | 7 tests — taskType, raw text, empty response, API error |
| `functions/src/services/tools/handlers/__tests__/searchDatabase.test.ts` | 24 tests — validation, happy path, hidden filter, channelIds, limits, coverage, deltas, tiers |

### Переиспользуемый код

| Файл | Что переиспользуется |
|------|---------------------|
| `functions/src/embedding/vectorSearch.ts` | `findNearestVideos()` — cosine search по Firestore |
| `functions/src/services/trendSnapshotService.ts` | `getViewDeltas()` — delta enrichment |
| `shared/percentiles.ts` | `assignPercentileGroups()` — performance tiers |
| `functions/src/services/tools/utils/getHiddenVideoIds.ts` | Hidden video filter |
| `functions/src/services/tools/utils/normalizeLastUpdated.ts` | Timestamp normalization |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_LIMIT` | 20 | Default result count |
| `MAX_LIMIT` | 50 | Maximum result count |
| `MIN_QUERY_LENGTH` | 3 | Minimum query length |

### Data path

```
Firestore (READ):
  globalVideoEmbeddings/{youtubeVideoId}
    Vector search: packagingEmbedding (768d) + cosine distance

  system/embeddingStats
    Coverage: byChannel.{channelId}.{packaging, total}

  users/{userId}/channels/{channelId}/
    trendChannels/{trendChannelId}                    — channel metadata
    trendChannels/{trendChannelId}/snapshots/          — view delta source
    hiddenVideos/{videoId}                             — filter

External API (WRITE: none, READ):
  Gemini embedding API — 1 call per search ($0.00004)
```

### Поток выполнения handler

```
1. Parse args (query, channelIds?, limit?)
2. Validate query length ≥ 3
3. Get trend channel IDs (channelIds arg OR all user's channels)
4. reportProgress("Generating query embedding...")
5. generateQueryEmbedding(query, apiKey) → 768d vector (taskType: RETRIEVAL_QUERY)
6. reportProgress("Searching database...")
7. findNearestVideos({ queryVector, "packagingEmbedding", youtubeChannelIds, limit + 10 })
      ↑ over-fetch +10 to compensate for hidden video removal in step 8
8. getHiddenVideoIds() → filter out hidden videos
9. Truncate to limit
      ↑ totalFound = count AFTER step 8, BEFORE step 9
10. getViewDeltas() → enrich with 24h/7d/30d
11. assignPercentileGroups() → per-channel performance tiers
12. Read system/embeddingStats → coverage
13. Return { query, results, totalFound, coverage, dataFreshness }
```
