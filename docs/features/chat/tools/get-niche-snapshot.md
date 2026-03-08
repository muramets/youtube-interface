# AI Tool: getNicheSnapshot — Feature Doc

## Текущее состояние

**Реализовано.** AI вызывает `getNicheSnapshot` для получения снимка конкурентной активности вокруг конкретной даты. Возвращает все видео конкурентов в окне ±N дней, сгруппированные по каналу, с pre-computed агрегатами (общие теги, средние просмотры, топ performers). Per-channel percentile на ПОЛНОМ наборе видео канала, но в окно попадают только релевантные. Zero YouTube API cost.

---

## Что это

Telescope Pattern Layer 4 — инструмент контекстуализации. Когда пользователь спрашивает "что происходило в нише, когда я выпустил видео X?", AI вызывает `getNicheSnapshot` и получает полную картину: что публиковали конкуренты в том же периоде, какие темы были горячими, кто перформил лучше.

**Принцип: data + computation, не interpretation.** Тул возвращает структурированные данные и pre-computed агрегаты (подсчёты, средние, сортировки). Интерпретация остаётся за LLM.

---

## User flow

1. Пользователь спрашивает: *"Что происходило в нише, когда я выпустил 'My Iceland Adventure'?"*
2. LLM вызывает `getNicheSnapshot({ date: "2026-02-20" })` (если publishedAt известен из контекста)
   — или `getNicheSnapshot({ videoId: "abc123", channelId: "UCxyz" })` (если нужно резолвить дату)
3. Handler: определяет окно ±7 дней → читает все каналы → per-channel percentiles → window filter → delta enrichment → aggregates
4. LLM получает снимок и сам интерпретирует: конкуренты были активнее обычного? темы пересекались? как перформ пользователя на фоне ниши?

---

## Параметры

| Параметр | Тип | Default | Описание |
|----------|-----|---------|----------|
| `date` | string | — | ISO 8601 reference date. **Preferred** — zero extra reads |
| `videoId` | string | — | Video ID как reference point. Fallback — tool резолвит publishedAt |
| `channelId` | string | — | Channel ID видео (оптимизация: 1 read вместо N при videoId lookup) |
| `windowDays` | number | 7 | Half-window в днях (7 = ±7 дней = 14 дней total) |

Хотя бы один из `date` или `videoId` обязателен.

### Input priority

1. **`date`** (primary) — zero extra reads. LLM знает publishedAt из предыдущего контекста
2. **`videoId` + `channelId`** — 1 doc read (direct lookup по known path)
3. **`videoId` only** — scan all trend channels via `db.getAll()`, fallback to own videos via `resolveVideosByIds`

LLM description явно указывает: "prefer `date` when publishedAt is known from context".

---

## Что возвращает

```typescript
{
    referencePoint: {
        date: string,              // YYYY-MM-DD
        videoId?: string,          // present when resolved from videoId
        videoTitle?: string,       // present when resolved from videoId
    },
    window: {
        from: string,              // YYYY-MM-DD
        to: string,                // YYYY-MM-DD
    },
    competitorActivity: [{
        channelId: string,
        channelTitle: string,
        videosPublished: number,
        videos: [{
            videoId: string,
            title: string,
            viewCount: number,
            viewDelta24h: number | null,
            viewDelta7d: number | null,
            viewDelta30d: number | null,
            publishedAt: string,
            tags: string[],
            performanceTier: string,
        }],
        avgViews: number,          // average viewCount within window for this channel
        topPerformer: {
            videoId: string,
            title: string,
            viewCount: number,
        },
    }],
    aggregates: {
        totalVideosInWindow: number,
        commonTags: [{ tag: string, count: number }],  // top 20, sorted desc
        avgViewsInWindow: number,
        topByViews: [{             // top 5 by viewCount
            videoId: string,
            title: string,
            channelTitle: string,
            viewCount: number,
        }],
    },
    dataFreshness: [{
        channelId: string,
        channelTitle: string,
        lastSynced: string | number,
    }],
}
```

### Что получает LLM

| Вопрос | Ответ в JSON |
|--------|-------------|
| Сколько видео вышло в окне? | `aggregates.totalVideosInWindow` |
| Кто был активнее всех? | `competitorActivity[].videosPublished` |
| Какие темы были горячими? | `aggregates.commonTags` — частотность тегов across каналов |
| Кто был топ? | `aggregates.topByViews` — 5 лучших видео в окне |
| Каждый канал по отдельности | `competitorActivity[].videos` + `avgViews` + `topPerformer` |
| Растут ли видео в окне? | `videos[].viewDelta7d` — YouTube-wide view growth |

---

## Percentile на полном наборе, window для ответа

Критически важная деталь: `performanceTier` вычисляется на **полном** наборе видео канала (все 800), а не только на видео в окне. Это даёт корректную оценку — Top 1% означает "один из лучших за всю историю канала", а не "лучший из 3 видео за неделю".

Hidden videos включаются в percentile calculation (для корректности распределения), но исключаются из window results.

---

## VideoId resolution (inverted priority)

Когда входной параметр — `videoId` (не `date`), handler ищет видео в порядке:

1. **Trend channels** (Layer 4 first) — если `channelId` передан, single doc read; иначе scan всех trend channels через `db.getAll()`
2. **Own videos** (fallback) — `resolveVideosByIds()` — direct + reverse lookup в `videos/` и `cached_external_videos/`

Инвертированный порядок (trend channels first): если пользователь спрашивает про видео конкурента, оно с большей вероятностью в trend data. Own videos — fallback для собственных видео пользователя.

---

## Связанные фичи

- [Telescope Pattern Overview](./README.md) — Layer 4: Competition
- [listTrendChannels](./list-trend-channels.md) — prerequisite (landscape)
- [browseTrendVideos](./browse-trend-videos.md) — детальный поиск видео с фильтрами
- [viewThumbnails](./view-thumbnails.md) — визуальный анализ обложек
- [Competitive Intelligence](../competitive-intelligence.md) — roadmap и архитектура

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/getNicheSnapshot.ts` | Handler: date resolution, window, per-channel percentiles, aggregates |
| `functions/src/services/tools/utils/getHiddenVideoIds.ts` | Hidden video filter |
| `functions/src/services/tools/utils/resolveVideos.ts` | Own video resolution (fallback path) |
| `functions/src/services/trendSnapshotService.ts` | `getViewDeltas()` — view delta enrichment with `channelIdHints` |
| `shared/percentiles.ts` | SSOT percentile algorithm |
| `functions/src/services/tools/definitions.ts` | Tool declaration |
| `functions/src/services/tools/executor.ts` | Tool routing |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_WINDOW_DAYS` | 7 | Half-window size (±7 days = 14 days total) |

### Data path

```
Firestore: users/{userId}/channels/{channelId}/
  trendChannels/{trendChannelId}/videos/{videoId}
    Fields: title, thumbnail, tags, viewCount, publishedAt
  trendChannels/{trendChannelId}/snapshots/{timestamp}
    Fields: videoViews (for delta computation)
  videos/{docId} + cached_external_videos/{videoId}
    (fallback for own video resolution)
  hiddenVideos/{videoId}
    Fields: (doc existence = hidden)
```

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/getNicheSnapshot.test.ts` | 14 (no date/videoId error, invalid date, date path, videoId+channelId, videoId-only scan, fallback resolveVideosByIds, videoId not found, custom windowDays, default windowDays, hidden video filtering, empty window, commonTags, dataFreshness, aggregates) |
