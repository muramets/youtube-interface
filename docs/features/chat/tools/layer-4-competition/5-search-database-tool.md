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

---

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### План проверки

| # | Сценарий | Что проверяет | Промпт-идея |
|---|----------|---------------|-------------|
| 1 | **Broad topic query** | Базовый happy path: relevanceScore range, enrichment (deltas, tiers), coverage, dataFreshness | "Какие видео у конкурентов про медитацию?" |
| 2 | **Narrow/specific query** | Качество семантического поиска на узкой теме | "Есть ли у конкурентов видео про jazz piano в дождливый день?" |
| 3 | **channelIds filter** | Фильтр по конкретному каналу — результаты только оттуда | "Что [конкретный канал] снимал про cooking?" |
| 4 | **Multi-word complex query** | Длинный описательный запрос, handling long text | "Relaxing videos with nature sounds, cabin in the forest, slow living aesthetic, no talking" |
| 5 | **searchDatabase vs findSimilarVideos** | Один topic через оба инструмента — overlap результатов? | "Найди видео конкурентов по теме [известного видео]" vs findSimilarVideos(videoId, packaging) |
| 6 | **Low relevance / no match** | Запрос про тему, которой нет в нише — graceful handling слабых результатов | "Есть ли у конкурентов видео про cryptocurrency?" |
| 7 | **Non-English query** | Модель передаёт query на EN или на языке пользователя? Качество embedding для non-EN | Русский промпт: "поищи видео про уютные вечера" |
| 8 | **Hidden video filtering** | Скрытые видео не попадают в результаты | Спрятать видео → искать по его теме → убедиться, что его нет |
| 9 | **Boundary: query = 3 chars** | MIN_QUERY_LENGTH validation на границе | Короткий запрос вроде "cat" или "AI" |
| 10 | **Model interpretation quality** | Группировка по каналам, trend detection, actionable рекомендации | "Какие тренды в нише по теме morning routine?" |

### Проверено в бою (2026-03-11)

Модели: `claude-haiku-4-5` (сценарии 1–7), `claude-sonnet-4-6` (сценарий 10). Все поля (viewDelta, performanceTier, coverage, dataFreshness) корректны во всех traces.

| # | Сценарий | Query | $ | Iter | Score | Spread | Ch | Found/Ret | Баг |
|---|----------|-------|---|------|-------|--------|----|-----------|-----|
| 1 | Broad topic | `"focus"` | .039 | 3 | .614–.59 | .024 | 1/19 | 60/50 | dataFreshness scope |
| 7 | Non-EN (RU) | `"музыка для спокойного вечера"` | .038 | 4 | .707–.681 | .026 | 5/19 | 30/20 | — |
| 2 | Narrow (EN) | `"jazz piano rainy day"` | .010 | 2 | .741–.692 | .049 | 9/19 | 30/20 | — |
| 6 | Out-of-domain | `"cryptocurrency"` | .026 | 2 | .517–.485 | .032 | 7/19 | 60/50 | — |
| 5 | vs findSimilar | `"jazz tones for elevated concentration"` | .008 | 2 | .799–.731 | .068 | 1/19 | 20/20 | — |
| 3 | channelIds | `"кафе cafe coffee shop"` | .037 | 3 | .606–.591 | .015 | 1/1* | 30/20 | prompt routing |
| 4 | Multi-word complex | `"relaxing nature sounds cabin forest slow living aesthetic"` | .042 | 3 | .716–.684 | .032 | 12/15 | 57/50 | ownership bug† |
| 10 | Model interpretation (Sonnet) | `"morning routine"` | .041 | 5 | .585–.548 | .037 | 8/15 | 60/50 | mention URL space‡ |

\* channelIds filter — searched only MONKEY BGM (1 channel)

### Паттерны

- **Конкретнее query → шире spread → больше каналов → лучшая дифференциация.** "focus" (0.024 spread, 1 канал) vs "jazz piano rainy day" (0.049, 9 каналов)
- **Порог релевантности ~0.55.** Реальные match'и > 0.59, мусор < 0.52. Threshold не введён — модель справляется с интерпретацией
- **Multilingual embeddings работают.** Русский query нашёл корейские/английские заголовки без перевода. Gemini embedding space кросс-язычный
- **50% overlap с findSimilarVideos.** Одна тема через оба инструмента — 10/20 общих результатов, но разное ранжирование. Score масштабы несопоставимы (searchDB: 0.73–0.80, findSimilar: 0.94–0.97). Инструменты комплементарны
- **Query dilution.** Многословный запрос = размытый embedding. "relaxing nature sounds cabin forest slow living" дал spread 0.032 (узкий) и доминирование "slow living" концепта (общего для ниши). Редкий концепт "cabin in the forest" — лишь 5 из 50 результатов. Это фундаментальное свойство vector search, не баг
- **Sonnet vs Haiku: качественный скачок.** Sonnet (сценарий 10) — 5 tool calls, 3× `mentionVideo`, структурированный анализ с группировкой по каналам. Haiku (сценарии 1–7) — 0 `mentionVideo` calls, hallucinated videoIds, смешение языков. Это не tool bug, а разница уровня модели. Для production: Sonnet+ обязателен для quality interpretation

### Ключевые наблюдения по traces

**#1 Broad topic "focus"** — все 50 результатов только SILEO (доминирует нишу по focus/concentration). Own videos попали в результаты из `globalVideoEmbeddings` → `mentionVideo` корректно пометил `ownership: "own-published"`. Мелкая неточность модели: назвала видео "Top 5%", в данных — "Top 1%"

**#7 Non-EN "спокойный вечер"** — большинство результатов Bottom 20% / Middle 60%. Упаковка "спокойный вечер" не генерирует хиты — tool честно это показал. Мелкая неточность модели: "7 видео Chill Pluck из топ-20", в данных — 10

**#6 Out-of-domain "cryptocurrency"** — все 50 результатов мусорные (score < 0.52). `findNearest` всегда возвращает результаты — cosine search ищет ближайших соседей, даже если далеко. Score ≈ 0.5 = baseline в 768d space. Модель корректно определила: "Нет видео о криптовалютах". Решение: threshold НЕ добавляем

**#5 vs findSimilarVideos** — searchDB включил reference video на #1 (корректно — нет concept'а reference). findSimilar исключает его by design. Разное ранжирование одних и тех же видео подтверждает: для полного анализа нужны оба инструмента

**#3 channelIds "MONKEY BGM кафе"** — 3 попытки. Попытка 1: модель вызвала `getChannelOverview("MONKEY BGM")` → ошибка (канал tracked, но модель пошла в YouTube API). Попытка 2: дописали caveat в конец промпт-правила → модель снова `getChannelOverview` (не дочитала). Попытка 3: перезаписали правило с decision-first структурой → модель корректно вызвала `listTrendChannels` → `searchDatabase`. Модель сформировала билингвальный query `"кафе cafe coffee shop"` — хороший приём. Spread 0.015 (самый узкий) объясним: 30 cafe-видео с похожими заголовками "CAFE&JAZZ"

**#4 Multi-word complex "relaxing nature sounds cabin forest"** — модель извлекла ключевые слова из natural language ("Is there any relaxing videos with..."), limit=50. Query dilution: "slow living" доминирует нишу → 45/50 результатов про slow living playlists. Лишь 5 видео содержат cabin/forest/cottage. Spread 0.032 подтверждает: все 50 результатов примерно одинаково далеки от размытого вектора. Модель корректно заключила: "The niche is dominated by playlist/ambient music rather than cinematic cabin videos". Обнаружен баг ownership (†)

**#10 Model interpretation "morning routine" (Sonnet)** — 3 traces: 2× Haiku (грязные), 1× Sonnet (чистый). Haiku: не вызывает `mentionVideo`, вставляет videoIds прямо в текст (hallucinated формат), мешает русский/английский. Sonnet: `listTrendChannels` → `searchDatabase` → 3× `mentionVideo` (все корректно вернули `competitor` после ownership fix). Интерпретация: группировка каналов по типу контента (playlists vs vlogs), trend detection ("ASMR Morning Routines", "Korean-style"), actionable рекомендации. Ownership fix подтверждён: все 4 `mentionVideo` calls → `"competitor"`. Обнаружен баг mention URL (‡)

### Найденные и исправленные баги

**dataFreshness scope** (исправлен 2026-03-11)
- **Симптом:** `searchDatabase` с query "focus" вернул `dataFreshness` с 1 каналом (SILEO), хотя searched 19 каналов. Модель не могла сообщить пользователю масштаб поиска
- **Причина:** `.filter(([id]) => resultChannelIds.has(id))` в обоих handlers (`searchDatabase.ts:164`, `findSimilarVideos.ts:418`) фильтровал dataFreshness до каналов, присутствующих в результатах
- **Фикс:** убран `.filter()` — dataFreshness теперь включает все searched каналы. Тест обновлён: `"includes dataFreshness for all searched channels"`
- **Урок:** когда все результаты из одного канала (broad query в доминируемой нише), потеря channel scope лишает модель возможности дать контекст ("искали среди 19 конкурентов")

**Prompt routing: channel name → channelId** (исправлен 2026-03-11)
- **Симптом:** при запросе "Что канал MONKEY BGM снимал про кафе?" модель вызывала `getChannelOverview("MONKEY BGM")` → ошибка "Channel not found". MONKEY BGM — tracked competitor, модель должна была использовать `listTrendChannels` для resolve'а channelId
- **Причина:** правило `AGENTIC_BEHAVIOR_RULES` в `prompts.ts` начиналось с "**Telescope pattern.** Always: `getChannelOverview` →..." — LLM видела "Always: getChannelOverview" и действовала
- **Fix #1 (FAILED):** дописали caveat в конец правила. Модель снова вызвала `getChannelOverview` — не дочитала до конца
- **Fix #2 (SUCCESS):** полная перезапись правила с decision-first структурой: "call `listTrendChannels` first" как дефолтное действие, Telescope как fallback
- **Файл:** `src/core/config/prompts.ts`, правило "Channel lookup" в `AGENTIC_BEHAVIOR_RULES`
- **Урок:** LLM читают правила как waterfall. Ставь дефолтное действие ПЕРВЫМ. Caveats и fallback'и — после. Никогда не дописывай исключение в конец правила, начинающегося с "Always"

**† Ownership bug** и **‡ Mention URL sanitization** — оба бага связаны с `mentionVideo`. Полное описание: [mention-video-tool.md](../utility/mention-video-tool.md#battle-testing)

### Ещё не проверено в бою

| Сценарий | Почему важно |
|---|---|
| **channelIds — несуществующие ID** | Пустой результат или ошибка? Graceful degradation |
| **Gemini API rate limit** | Каждый вызов = API call, нет кэша stored embeddings |
| **Concurrent calls** | Два searchDatabase параллельно — race conditions в embedding API? |
| **Query injection** | Prompt injection через query field — безопасность |
| **Over-fetch compensation** | 10+ hidden videos в top results — получим < limit? |

---

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
