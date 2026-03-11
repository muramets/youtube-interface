# AI Tool: findSimilarVideos — Feature Doc

## Текущее состояние

**Реализовано.** AI вызывает `findSimilarVideos` для поиска видео конкурентов, похожих на указанное видео. Три режима: `packaging` (текстовое сходство по заголовку, тегам, описанию), `visual` (визуальное сходство обложек), `both` (комбинированный через Reciprocal Rank Fusion). Результаты обогащены view deltas, performance tier, shared tags. Coverage metadata показывает процент проиндексированных видео.

---

## Что это

Telescope Pattern Layer 4 — инструмент семантического поиска. Когда пользователь спрашивает "найди у конкурентов видео, похожие на моё", AI вызывает `findSimilarVideos` и получает ранжированный список похожих видео из всех отслеживаемых каналов.

**Принцип: три уровня сходства.**
- `packaging` — "о чём видео?" (тема, теги, описание). Использует text embeddings (`gemini-embedding-001`, 768d)
- `visual` — "как выглядит обложка?" (цвета, композиция, стиль). Использует image embeddings (`multimodalembedding@001`, 1408d)
- `both` — "похоже и по теме, И по обложке?" — RRF merge двух поисков

---

## User flow

1. Пользователь: *"Найди у конкурентов видео, похожие на моё 'My Iceland Adventure'"*
2. LLM вызывает `findSimilarVideos({ videoId: "abc123", mode: "packaging" })`
3. Handler: lookup видео → resolve embedding → vector search → filter hidden → enrich (deltas, tiers, tags)
4. LLM получает ранжированный список и интерпретирует: кто делал похожее? как перформили? какие теги общие?

### Продвинутые сценарии

- *"Моя обложка похожа на что-то у конкурентов?"* → `mode: "visual"`
- *"Комплексное сравнение — и по теме, и по визуалу"* → `mode: "both"` (RRF merge)
- *"Какие результаты у видео с похожими обложками?"* → `mode: "visual"` (thumbnailDescription в ответе объясняет ПОЧЕМУ похожи)

---

## Параметры

| Параметр | Тип | Default | Описание |
|----------|-----|---------|----------|
| `videoId` | string | — | **Required.** Video ID (своё или конкурента) |
| `mode` | string | `"packaging"` | `"packaging"`, `"visual"`, `"both"` |
| `limit` | number | 20 | Макс. результатов (1–50) |

---

## Что возвращает

### mode: packaging

```typescript
{
    referenceVideo: {
        videoId: string,
        title: string,
        tags: string[],
    },
    mode: "packaging",
    similar: [{
        videoId: string,
        title: string,
        channelId: string,
        channelTitle: string,
        similarityScore: number,       // 0–1, выше = ближе
        publishedAt: string,
        viewCount: number,
        viewDelta24h: number | null,
        viewDelta7d: number | null,
        viewDelta30d: number | null,
        performanceTier: string,       // "Top 1%", "Top 5%", etc.
        sharedTags: string[],
    }],
    totalFound: number,
    coverage: { indexed: number, total: number },
    dataFreshness: [{ channelId, channelTitle, lastSynced }],
}
```

### mode: visual

Тот же формат, но:
- `similarityScore` вместо `rrfScore`
- `thumbnailDescription: string | null` — текстовое описание обложки (AI может объяснить визуальное сходство)
- `coverage: { indexed, total }` — по visual embeddings

### mode: both (RRF merge)

- `rrfScore: number` вместо `similarityScore` (RRF score, не cosine distance)
- `thumbnailDescription: string | null` в каждом результате
- `coverage: { packaging: { indexed, total }, visual: { indexed, total } }` — dual structure

### Edge cases

| Ситуация | Поведение |
|----------|----------|
| Video не найден | `{ error: "Video not found: {id}" }` |
| Нет trend каналов | `{ error: "No trend channels tracked..." }` |
| Competitor без visual embedding | `{ error: "Visual embedding not available..." }` |
| `mode: both`, один вектор недоступен | Fallback на доступный mode + `_note` с объяснением |
| `mode: both`, оба вектора недоступны | Error |
| Custom video без `publishedVideoId` (с обложкой) | Visual embedding генерируется из Firebase Storage thumbnail |
| Custom video без `publishedVideoId` и без обложки | `{ error: "No thumbnail available..." }` |

---

## RRF Merge (mode: both)

Reciprocal Rank Fusion ([Cormack et al. 2009](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)) объединяет два ранжированных списка без зависимости от масштаба similarity scores:

```
score(d) = Σ 1/(k + rank_i(d))
```

- `k = 60` (стандартное значение, балансирует top-heavy vs uniform weighting)
- Каждый поиск возвращает top-100 (`LIMIT_PER_SEARCH = 100`)
- Union semantics: документ в одном ИЛИ обоих списках включается в результат
- Если документ в обоих: `1/(60 + rank_packaging) + 1/(60 + rank_visual)` → выше score
- Если документ только в одном: `1/(60 + rank_i)` → ниже score, но не исключается
- Финальный `limit` (default 20) применяется после merge

**Почему RRF, а не weighted average:** cosine similarity из разных embedding spaces (768d text vs 1408d image) имеет разный масштаб. RRF работает с рангами, а не с абсолютными scores — математически корректнее.

---

## Query vector resolution

| Источник видео | packaging | visual |
|---------------|-----------|--------|
| **Competitor** (в `globalVideoEmbeddings`) | Read stored `packagingEmbedding` | Read stored `visualEmbedding` |
| **Own video** (в `videos/`, с `publishedVideoId`) | Generate on-the-fly (`generatePackagingEmbedding`) | Generate on-the-fly via YouTube thumbnail |
| **Own video** (custom-*, без `publishedVideoId`) | Generate on-the-fly (`generatePackagingEmbedding`) | Generate on-the-fly via Firebase Storage thumbnail |
| **Trend video** (не в embeddings, но в `trendChannels/`) | Generate on-the-fly | Generate on-the-fly |

Для own/trend видео embedding генерируется при каждом вызове (~200ms). Для competitor видео — мгновенный read из Firestore.

---

## Coverage metadata

Handler читает `system/embeddingStats` (1 Firestore read) для отображения coverage:

- **Single mode:** `{ indexed: 4200, total: 4370 }` — "96% видео проиндексировано"
- **Both mode:** `{ packaging: { indexed: 4370, total: 4370 }, visual: { indexed: 4286, total: 4370 } }` — раздельные counts

LLM может использовать coverage для calibration: "результаты покрывают 96% видео конкурентов, 4% без visual embedding (битые обложки)".

---

## Token budget

| Компонент | ~Tokens |
|-----------|---------|
| Каждый результат (packaging mode) | ~80 |
| Каждый результат (visual/both — с thumbnailDescription) | ~120 |
| 20 результатов (packaging) | ~1,600 |
| 20 результатов (visual/both) | ~2,400 |
| Metadata (referenceVideo, coverage, dataFreshness) | ~200 |
| **Total (20 results, both mode)** | **~2,600** |

Укладывается в бюджет LLM context window с большим запасом.

---

## Зависимости

- **Prerequisite data:** `listTrendChannels` / `browseTrendVideos` для получения videoId конкурента
- **Prerequisite infra:** `globalVideoEmbeddings` collection, `scheduledEmbeddingSync` (daily 00:30 UTC)
- **Enrichment:** `trendSnapshotService.getViewDeltas()` для view deltas, `shared/percentiles.ts` для performance tiers

---

## Связанные фичи

- [Telescope Pattern Overview](../README.md) — Layer 4: Competition
- [listTrendChannels](./1-list-trend-channels-tool.md) — entry point (landscape)
- [browseTrendVideos](./2-browse-trend-videos-tool.md) — filter + percentile (получить videoId)
- [getNicheSnapshot](./3-get-niche-snapshot-tool.md) — window snapshot + aggregates
- [viewThumbnails](../layer-2-detail/2-view-thumbnails-tool.md) — визуальный анализ обложек
- [Competitive Intelligence](./competitive-intelligence.md) — roadmap и архитектура

---

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### Проверено в бою (2026-03-11)

Все traces: модель `claude-haiku-4-5`. Все поля (similarityScore/rrfScore, viewDelta, performanceTier, coverage, dataFreshness, sharedTags, thumbnailDescription) корректны во всех traces. Self-match exclusion работает во всех traces.

| # | Mode | Video source | $ | Iter | Score | Found/Ret | Ch | Баг |
|---|------|-------------|---|------|-------|-----------|-----|-----|
| 1 | visual | competitor stored | — | 2 | .683–.582 | 39/30 | 10 | — |
| 2 | visual | own (publishedVideoId) | .027 | 2 | .776–.67 | 29/20 | 6 | — |
| 3 | packaging | competitor stored | .025 | 2 | .960–.835 | 29/20 | 1 | prompt: videoId extraction |
| 4 | both (RRF) | competitor stored | .046 | 3 | .032–.023* | 24/15 | — | prompt: videoId extraction |
| 5 | visual | competitor (same session) | — | — | .755–.639 | 29/20 | — | viewThumbnails string→array |
| 6 | — | pre-VectorValue fix | — | — | — | — | — | VectorValue bug (fallback to searchDB) |
| 7 | visual | custom draft (Firebase Storage) | .046 | 3 | .846–.611 | 30/20 | 6 | — |
| 8 | both (RRF) | custom (publishedVideoId) | .055 | 3 | .016–.014* | 29/20 | — | Cloud Function OOM |

\* rrfScore, не similarityScore — другая шкала (rank-based, не cosine)

### Ключевые наблюдения по traces

**#1 Visual competitor** — результаты из 10 каналов. Модель использовала `thumbnailDescription` для объяснения визуальных различий, группировала по tier'ам (survivors / steady / dead). Подтверждает: VectorValue bug fix работает

**#2 Visual own video** — own videos попадают в результаты (handler исключает только reference video, не канал). Модель корректно не упомянула их как "конкурентов"

**#3 Packaging competitor** — все 20 результатов с одного канала (Little Thing копирует теги между видео → embedding'и почти идентичны, similarity 0.96). Корректное поведение, не баг. До промпт-фикса: Haiku не связывала videoId из context с tool → 0 tool calls

**#4 Both mode (RRF)** — visual search нашёл 3 видео с лебедями из ~2000 (reference = лебеди на озере). Остальные — match по стилю (composition, palette), не по объектам. Это by design: `multimodalembedding@001` — высокоуровневые фичи, не object detection. Packaging доминирует в RRF: shared tags 17/17, packaging ~0.96 >> visual ~0.73

**#7 Firebase Storage thumbnail** — полный путь для custom draft без publishedVideoId: Firebase Storage URL → download → on-the-fly embedding. Топ-1 = видео с собственного канала (similarity 0.846) — модель корректно отметила

**#8 Both mode + custom** — SILEO `AuMzK2nQsZQ` вышел #1 благодаря packaging boost (в visual-only его не было, cosine 0.46). RRF merge компенсировал слабость visual через packaging — ради этого и делали `both` mode

**#6 Graceful degradation** — до VectorValue fix оба mode'а падали. Модель восстановилась через `searchDatabase` + `viewThumbnails`. Ответы качественные, но без `thumbnailDescription`

### Найденные и исправленные баги

**VectorValue bug** (исправлен 2026-03-11)
- **Симптом:** `findSimilarVideos` с competitor videoId (stored embedding path) всегда возвращал "Visual embedding not available" — даже когда embedding существует в Firestore
- **Причина:** после миграции на `FieldValue.vector()` (2026-03-10) Firestore возвращает vector-поля как `VectorValue` объекты, а не `number[]`. `VectorValue` не имеет `.length` → проверка `embeddingDoc?.visualEmbedding?.length` возвращала `undefined` → handler падал в error path. Затронуты оба режима: visual и packaging для competitor videos
- **Фикс:** `vectorToArray()` helper нормализует `VectorValue → number[]` на границе чтения из Firestore (`lookupVideo()`). Тесты обновлены: `mockVector()` helper возвращает объекты без `.length` (как настоящий VectorValue), вместо plain `number[]`
- **Урок:** unit-тесты мокали Firestore с `number[]`, production возвращал `VectorValue` — mock fidelity gap. `as unknown as number[]` каст в `processOneVideo.ts` скрыл несоответствие типов

**viewThumbnails string-to-array bug** (исправлен 2026-03-11)
- **Симптом:** Haiku передал `videoIds: "CI4f48bh-KA"` (строка) вместо `["CI4f48bh-KA"]` (массив) → handler вернул `"At least one of videoIds or titles is required"`
- **Причина:** `Array.isArray("string")` = `false` → валидация на строке 83 отклоняла запрос
- **Фикс:** defensive string-to-array coercion для `videoIds` и `titles` на входе handler'а
- **Урок:** маленькие модели (Haiku) inconsistently передают параметры — тот же Haiku в том же разговоре для другого вызова `viewThumbnails` передал массив корректно

**Prompt gap: Video ID extraction** (исправлен 2026-03-11)
- **Симптом:** Haiku не извлекал videoId из `[id: ...]` аннотации в context, спрашивал у пользователя. 0 tool calls на первой итерации
- **Причина:** rule #8 в ANTI_HALLUCINATION_RULES был привязан к конкретным инструментам (mentionVideo/getMultipleVideoDetails). `findSimilarVideos` не покрывался
- **Фикс:** rule #8 обобщён: "Video lookup workflow" → "Video ID extraction". Теперь покрывает ВСЕ tools, которым нужен videoId. Добавлен guardrail: "Never ask the user for a videoId that is already visible in the context". Из Tool Strategy убрано дублирующее "with the videoId from attached context"

**Cloud Function OOM** (исправлен 2026-03-11)
- **Симптом:** `findSimilarVideos` с `mode: "both"` на custom video → пустой ответ модели. В логах: `Memory limit of 512 MiB exceeded with 535 MiB used`
- **Причина:** `both` mode генерирует packaging (Gemini SDK) и visual (Vertex AI SDK, ~50MB lazy import) embedding **параллельно** (`Promise.all`). Одновременная загрузка двух AI SDK + буферы → превышение 512 MiB лимита. `visual` mode работал (один SDK), `both` — OOM
- **Фикс:** `aiChat` Cloud Function memory: `512MiB` → `1GiB`

### Ещё не проверено в бою

| Сценарий | Почему важно |
|---|---|
| **Custom видео без `publishedVideoId` и без thumbnail** | Edge case: нет ни YouTube ID, ни обложки — graceful error |
| **0 похожих результатов** | Пустой `similar[]` — как модель обработает? |
| **Error paths** | Недоступный thumbnail, нет embeddings в collection, budget exceeded |

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/findSimilarVideos.ts` | Handler: lookup, vector resolve, search, RRF merge, enrichment |
| `functions/src/embedding/vectorSearch.ts` | `findNearestVideos()` — batched pre-filter + findNearest + merge |
| `functions/src/embedding/rrfMerge.ts` | `rrfMerge()` — Reciprocal Rank Fusion (pure utility) |
| `functions/src/embedding/packagingEmbedding.ts` | Text embedding generation (gemini-embedding-001, 768d) |
| `functions/src/embedding/visualEmbedding.ts` | Image embedding generation (multimodalembedding@001, Vertex AI, 1408d) |
| `functions/src/embedding/thumbnailDescription.ts` | Thumbnail description generation (Gemini Flash Vision) |
| `functions/src/embedding/types.ts` | `EmbeddingDoc`, `EmbeddingStats`, constants |
| `functions/src/embedding/budgetTracker.ts` | Global budget safeguard ($5/month) |
| `functions/src/services/tools/definitions.ts` | Tool declaration (3 modes) |
| `functions/src/services/tools/executor.ts` | Tool routing |
| `shared/percentiles.ts` | SSOT percentile algorithm |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_LIMIT` | 20 | Default result count |
| `MAX_LIMIT` | 50 | Maximum result count |
| `RRF_K` | 60 | RRF smoothing parameter |
| `LIMIT_PER_SEARCH` | 100 | Results per vector search in `both` mode |

### Data path

```
Firestore:
  globalVideoEmbeddings/{youtubeVideoId}
    Fields: packagingEmbedding(768d), visualEmbedding(1408d),
            thumbnailDescription, title, tags, channelTitle,
            youtubeChannelId, publishedAt, viewCount

  system/embeddingStats
    Fields: byChannel.{channelId}.{packaging, visual, total}

  users/{userId}/channels/{channelId}/
    trendChannels/{trendChannelId}/videos/{videoId}
    trendChannels/{trendChannelId}/snapshots/{timestamp}
    hiddenVideos/{videoId}
```

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/findSimilarVideos.test.ts` | 20 (packaging: competitor/own/not found/hidden filter/shared tags/view deltas/performance tiers/coverage; visual: competitor/no embedding/own/thumbnailDescription/coverage; both: RRF merge/packaging fallback/visual fallback/both unavailable/parallel search/coverage) |
| `functions/src/embedding/__tests__/rrfMerge.test.ts` | 8 (overlap scoring, no overlap union, empty lists, finalLimit, k parameter, single list, data preservation, score semantics) |
