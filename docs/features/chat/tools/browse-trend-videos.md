# AI Tool: browseTrendVideos — Feature Doc

## Текущее состояние

**Реализовано.** Главный рабочий инструмент конкурентной аналитики. AI запрашивает видео конкурентов из Trends data с фильтрами (каналы, даты, performanceTier) и сортировкой (дата, просмотры, дельты). Per-channel percentile тиры вычисляются в runtime. View deltas (24h/7d/30d) обогащаются из trend snapshots. Hidden videos фильтруются. Zero YouTube API cost.

---

## Что это

Telescope Pattern Layer 4 — основной инструмент для исследования конкурентных видео. После `listTrendChannels` (ландшафт), LLM использует `browseTrendVideos` для конкретных вопросов: "что публиковали конкуренты на прошлой неделе?", "топ-видео канала X?", "какие видео быстрее всего растут?".

Ключевая особенность: **per-channel percentile** — каждое видео ранжируется относительно нормы своего канала (не cross-channel). Top 1% видео MrBeast и Top 1% видео маленького канала — оба попадут в фильтр `performanceTier: "Top 1%"`. Это позволяет находить хиты каждого конкурента, независимо от масштаба канала.

---

## User flow

1. LLM уже вызвал `listTrendChannels` → получил `channelId` и метаданные
2. Пользователь спрашивает: *"Что публиковали конкуренты на прошлой неделе?"*
3. LLM вызывает `browseTrendVideos({ dateRange: { from: "2026-03-01" }, sort: "views" })`
4. Handler: читает видео всех каналов → per-channel percentiles → фильтры → delta enrichment → ответ
5. LLM получает список видео с тирами и дельтами для анализа
6. Для визуального анализа обложек — `viewThumbnails(videoIds)` с ID из ответа

---

## Параметры

| Параметр | Тип | Default | Описание |
|----------|-----|---------|----------|
| `channelIds` | string[] | все | Фильтр по ID каналов (из `listTrendChannels`). Omit = все tracked |
| `dateRange` | `{ from?, to? }` | — | ISO 8601 date range фильтр |
| `performanceTier` | enum | — | `"Top 1%"` / `"Top 5%"` / `"Top 20%"` / `"Middle 60%"` / `"Bottom 20%"` |
| `sort` | enum | `"date"` | `"date"` / `"views"` / `"delta24h"` / `"delta7d"` / `"delta30d"` |
| `limit` | number | 50 | Max видео (1–200) |

---

## Что возвращает

```typescript
{
    videos: [{
        videoId: string,
        title: string,
        channelId: string,
        channelTitle: string,
        publishedAt: string,       // ISO 8601
        viewCount: number,
        viewDelta24h: number | null,
        viewDelta7d: number | null,
        viewDelta30d: number | null,
        tags: string[],
        thumbnailUrl: string,
        performanceTier: string,   // "Top 1%" | "Top 5%" | "Top 20%" | "Middle 60%" | "Bottom 20%"
    }],
    totalMatched: number,          // ALWAYS present — total before limit
    channels: [{
        channelId: string,
        title: string,
        matchedCount: number,      // videos matched per channel
    }],
    dataFreshness: [{
        channelId: string,
        channelTitle: string,
        lastSynced: string | null,
    }],
    _note?: string,                // present when delta sort falls back to views
}
```

### Token budget

Одно видео ≈ 125 tokens. Default 50 видео ≈ 6K tokens. Max 200 видео ≈ 25K tokens.

### Что получает LLM

| Вопрос | Ответ в JSON |
|--------|-------------|
| Что публиковали конкуренты? | `videos[]` — хронологический или по views |
| Сколько подходит под фильтры? | `totalMatched` (50 из 50 или 50 из 2000) |
| Какие хиты у каждого конкурента? | фильтр `performanceTier: "Top 1%"` — хиты per-channel |
| Что быстро растёт? | `sort: "delta7d"` — по приросту за неделю |
| Какой канал активнее? | `channels[].matchedCount` |
| Актуальны ли данные? | `dataFreshness[].lastSynced` |

---

## Delta sort fallback

Когда пользователь сортирует по дельтам (`delta24h`, `delta7d`, `delta30d`), но все значения null (каналы только что добавлены, snapshots ещё нет):

1. Handler определяет `allDeltasNull === true`
2. Fallback: сортировка по `viewCount` desc
3. Ответ содержит `_note: "Delta data unavailable — sorted by views instead"`
4. LLM знает, что сортировка не по дельтам, и может предупредить пользователя

При частичных nulls: видео с null-дельтами уходят в конец списка, сортируясь между собой по `viewCount`.

---

## Per-channel percentile

Percentile тиры вычисляются per-channel, не cross-channel:

1. Handler читает ВСЕ видео каждого канала
2. `assignPercentileGroups()` вызывается отдельно для каждого канала
3. Видео получает тир относительно нормы своего канала

При cross-channel запросе (все каналы), фильтр `performanceTier: "Top 1%"` вернёт Top 1% видео **каждого** канала — хиты у всех конкурентов, а не только у крупного.

Алгоритм: `shared/percentiles.ts` — SSOT для frontend и backend.

---

## Связанные фичи

- [Telescope Pattern Overview](./README.md) — Layer 4: Competition
- [listTrendChannels](./list-trend-channels.md) — prerequisite (channelIds)
- [getNicheSnapshot](./get-niche-snapshot.md) — агрегированный снимок ниши
- [viewThumbnails](./view-thumbnails.md) — визуальный анализ обложек результатов
- [Competitive Intelligence](../competitive-intelligence.md) — roadmap и архитектура

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/browseTrendVideos.ts` | Handler: per-channel percentiles, filters, delta enrichment |
| `functions/src/services/tools/utils/getHiddenVideoIds.ts` | Hidden video filter |
| `functions/src/services/trendSnapshotService.ts` | `getViewDeltas()` — view delta enrichment with `channelIdHints` |
| `shared/percentiles.ts` | SSOT percentile algorithm (`assignPercentileGroups`) |
| `functions/src/services/tools/definitions.ts` | Tool declaration (enum params) |
| `functions/src/services/tools/executor.ts` | Tool routing |

### Data path

```
Firestore: users/{userId}/channels/{channelId}/
  trendChannels/{trendChannelId}/videos/{videoId}
    Fields: title, thumbnail, tags, viewCount, publishedAt
  trendChannels/{trendChannelId}/snapshots/{timestamp}
    Fields: videoViews (for delta computation)
  hiddenVideos/{videoId}
    Fields: (doc existence = hidden)
```

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/browseTrendVideos.test.ts` | 14 (no channels error, default sort, channelIds filter, dateRange, performanceTier, invalid params, limit, hidden videos, totalMatched, dataFreshness, channels summary, delta sort fallback) |
