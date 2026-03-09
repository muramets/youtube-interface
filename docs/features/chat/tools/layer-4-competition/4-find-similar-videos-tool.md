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
| **Own video** (в `videos/`) | Generate on-the-fly (`generatePackagingEmbedding`) | Generate on-the-fly (`generateVisualEmbedding`) |
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
