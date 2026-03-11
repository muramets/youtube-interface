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

**Visual mode + competitor stored embedding**
- "видео с такой упаковкой ещё живы в нише?" (competitor video, Ophelia Wilde, 6.4M views)
- Модель: `claude-haiku-4-5`, 2 итерации
- Путь: stored embedding в `globalVideoEmbeddings` → vector search → 39 found, 30 returned (limit: 30)
- **Все поля корректны:** similarityScore (0.683–0.582), thumbnailDescription (30/30, 497–887 chars), viewDelta24h/7d/30d (null для <30-day видео — корректно), performanceTier (Top 1% → Bottom 20%), sharedTags, coverage (2035/2091 = 97.3%), dataFreshness (10 каналов, все <24ч)
- Self-match exclusion: reference video `8HPGVCeURlY` не в результатах ✅
- Cross-channel: результаты из 10 разных каналов (Ophelia Wilde, Little Joys, slow living, a quiet day., и др.)
- **Качество интерпретации модели:** tier-based группировка (survivors / steady / dead), использовала `thumbnailDescription` для объяснения визуальных различий ("through a window frame", "specific visual markers"), actionable выводы ("seasonal variants, specific use-case positioning, consistent upload batches")
- **Подтверждает:** VectorValue bug fix работает — stored embedding path для competitor videos полностью функционален

**Visual mode + custom videoId (own video)**
- "публиковали ли конкуренты видео с похожим визуалом?"
- Модель: `claude-haiku-4-5`, стоимость: $0.027, 2 итерации
- Путь: `custom-1771657399131` → `publishedVideoId: vOXxPmlJzBk` → thumbnail download → on-the-fly visual embedding (1408d) → vector search → 29 found, 20 returned
- **Все поля корректны:** similarityScore (0.776–0.67), thumbnailDescription (20/20), viewDelta24h/7d/30d (null для <30-day видео — корректно), performanceTier, sharedTags, coverage (2035/2091 = 97.3%), dataFreshness (6 каналов)
- Self-match exclusion: reference video `vOXxPmlJzBk` не в результатах ✅
- Модель построила качественный конкурентный анализ на основе данных, использовала `thumbnailDescription` для синтеза визуальных паттернов ниши
- **Наблюдение:** результаты включают другие видео с канала пользователя (slow life mode) — handler исключает только конкретное reference-видео, не весь канал. Модель корректно не упомянула их как "конкурентов"

**Packaging mode + competitor stored embedding**
- "найди конкурентов с похожей темой по заголовку и тегам" (competitor video, Little Thing, 221K views)
- Модель: `claude-haiku-4-5`, стоимость: $0.025, 2 итерации
- Путь: stored `packagingEmbedding` (768d) в `globalVideoEmbeddings` → vector search → 29 found, 20 returned
- **Все поля корректны:** similarityScore (0.960–0.835), sharedTags (до 17 из 18 — корректное пересечение), viewDelta24h/7d/30d, performanceTier (Top 5% → Bottom 20%), coverage (2090/2091 = 99.95%)
- Self-match exclusion: reference video `zutRuZtXa2I` не в результатах ✅
- **Наблюдение:** все 20 результатов с одного канала (Little Thing) — потому что reference video оттуда же, а автор копирует теги между видео → embedding'и очень близкие. Это корректное поведение, не баг
- **Качество интерпретации модели:** определила seasonal pattern, momentum analysis, вывод "niche appears to be Little Thing's territory"
- **Предыстория:** тот же промпт ранее приводил к 0 tool calls (Haiku не связывала видео из context с tool). Потребовалось два промпт-фикса: (1) добавить `[id: videoId]` в per-message label (`formatContextLabel`), (2) добавить explicit tool routing rule в `AGENTIC_BEHAVIOR_RULES`

**Both mode (RRF merge) + competitor stored embedding**
- "Найди похожие видео конкурентов. Сделай полное сравнение — и по теме, и по визуалу обложки" (competitor video, Little Thing, CI4f48bh-KA, 221K views, thumbnail: лебеди на озере)
- Модель: `claude-haiku-4-5`, стоимость: $0.046, 3 итерации (1-я — failed: не нашёл videoId, 2-я — tool calls, 3-я — viewThumbnails + ответ)
- Путь: stored embedding → dual vector search (packaging 768d + visual 1408d) → RRF merge k=60 → 24 found, 15 returned (limit: 15)
- **Все поля корректны:** `rrfScore` (0.0315–0.0230, НЕ `similarityScore` — корректно для RRF), `thumbnailDescription` (15/15), viewDelta24h/7d/30d, performanceTier, sharedTags
- **Dual coverage корректна:** `{ packaging: { indexed: 2090, total: 2091 }, visual: { indexed: 2035, total: 2091 } }` — два отдельных объекта ✅
- Self-match exclusion: reference video `CI4f48bh-KA` не в результатах ✅
- **Наблюдение:** результаты сильно overlap'ятся с visual-only из-за характера ниши (все каналы используют один визуальный стиль — impressionistic painting, pastel tones, cursive text). В RRF packaging доминирует — Little Thing копирует одинаковые теги между видео (17/17 shared), packaging similarity ~0.96 >> visual ~0.73
- **Наблюдение (visual embeddings):** reference video — лебеди на озере. Visual search нашёл 3 видео с лебедями из ~2000 (ghLLpCNCl54: 0.734, _HZ1e_ekVvY: 0.662, 1_vDNs6QZaE: 0.639). Остальные результаты — match по СТИЛЮ (composition, palette, mood), не по конкретным объектам. Это by design: `multimodalembedding@001` захватывает высокоуровневые визуальные фичи, не object detection
- **Prompt issue (Haiku):** первая итерация — 0 tool calls, Haiku сказал "I don't have the video ID". VideoId присутствовал и в persistent context `[id: CI4f48bh-KA]`, и в per-message label. Промпт-фикс: rule #8 в ANTI_HALLUCINATION_RULES обобщён с "Video lookup workflow" (только mentionVideo) на "Video ID extraction" (все tools). Добавлен guardrail: "Never ask the user for a videoId that is already visible in the context"

**Visual mode + competitor stored embedding (same session, same video)**
- "поищи у конкурентов похожее видео ТОЛЬКО ПО ВИЗУАЛУ" (CI4f48bh-KA)
- Путь: stored `visualEmbedding` (1408d) → vector search → 29 found, 20 returned
- **Все поля корректны:** `similarityScore` (0.755–0.639, НЕ `rrfScore` — корректно для single mode), thumbnailDescription (20/20), coverage single structure `{ indexed: 2035, total: 2091 }`
- **Найден баг viewThumbnails:** Haiku передал `videoIds: "CI4f48bh-KA"` (строка) вместо `["CI4f48bh-KA"]` (массив) → `Array.isArray()` = false → ошибка. Исправлено: string-to-array coercion в handler

**Graceful degradation (searchDatabase fallback)**
- Те же запросы, но до VectorValue fix: `findSimilarVideos` visual → ошибка, packaging → ошибка
- Модель восстановилась через `searchDatabase` (text-based semantic search) + `viewThumbnails` + `mentionVideo`
- Ответы качественные, но без `thumbnailDescription` — модель не могла объяснить визуальное сходство

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

**Visual mode + custom video без publishedVideoId (Firebase Storage thumbnail)**
- "есть ли у конкурентов видео с похожим визуалом?" (custom draft, jazz mode, "Your Next Viral Music Playlist")
- Модель: `claude-haiku-4-5`, стоимость: $0.046, 3 итерации
- Путь: `custom-1773228155367` → no publishedVideoId → Firebase Storage thumbnail URL → download → on-the-fly visual embedding (1408d) → vector search → 30 found, 20 returned
- **Все поля корректны:** similarityScore (0.846–0.611), thumbnailDescription (20/20), viewDelta24h/7d/30d, performanceTier, coverage (2164/2192 = 98.7%), dataFreshness (6 каналов)
- Self-match exclusion: reference video `custom-1773228155367` не в результатах ✅
- **Наблюдение:** топ-1 результат — `WalzXg2qG9M` с собственного канала (similarity 0.846). Handler исключает только reference video, не весь канал. Модель корректно отметила его как "ваш же канал", не как конкурента
- **Качество интерпретации:** определила визуальный мейнстрим ниши ("modern architecture + nature + mystical atmosphere"), доминанта JazzVintage92, actionable совет ("improve typography or find unique angle")
- **Подтверждает:** Firebase Storage thumbnail path полностью функционален для custom draft видео

**Both mode + custom video с publishedVideoId (RRF merge)**
- "есть ли у конкурентов похожие по упаковке и визуалу видео?" (custom published, jazz mode, "meditative jazz for overthinkers")
- Модель: `claude-haiku-4-5`, стоимость: $0.055, 3 итерации (listTrendChannels → findSimilarVideos both → viewThumbnails)
- Путь: `custom-1772111723778` → publishedVideoId `WalzXg2qG9M` → parallel: packaging embedding (Gemini) + YouTube thumbnail → visual embedding (Vertex AI) → dual vector search → RRF merge k=60 → 29 found, 20 returned
- **Все поля корректны:** `rrfScore` (0.01613–0.01408, НЕ similarityScore — корректно для RRF), thumbnailDescription (20/20), viewDelta24h/7d/30d, performanceTier, dual coverage (packaging 2191/2192, visual 2164/2192)
- Self-match exclusion: `custom-1772111723778` и `WalzXg2qG9M` не в результатах ✅
- **Ключевой результат:** SILEO `AuMzK2nQsZQ` ("meditative jazz for overthinkers", 505K views) — **#1 в both mode** благодаря packaging boost. В visual-only search этого видео не было (cosine similarity 0.46). RRF merge компенсировал слабость visual embedding через packaging similarity
- **Качество интерпретации:** Haiku определила SILEO как "доминирующего конкурента" с 5+ видео идентичной упаковки, дала actionable рекомендации по дифференциации

### Найденные и исправленные баги (both mode)

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
