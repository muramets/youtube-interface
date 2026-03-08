# AI Tool: analyzeTrafficSources — Feature Doc

## Текущее состояние

**Реализовано.** Telescope Pattern Layer 3 — gateway. AI вызывает `analyzeTrafficSources`, получает per-source breakdown (Browse, Suggested, Search, External) с timeline и pre-computed deltas. Если Suggested traffic доминирует — LLM переходит к drill-down через `analyzeSuggestedTraffic`.

**Snapshot count denormalization:** `trafficSourceSnapshotCount` записывается на документ видео при каждом create/delete снэпшота и при входе в Traffic Sources таб (lazy sync). Tool description указывает LLM проверять это поле в `getMultipleVideoDetails` перед вызовом.

---

## Что это

Gateway-тул для анализа трафика. Отвечает на вопрос *"Откуда приходит трафик к видео?"* — агрегированная разбивка по источникам (Suggested videos, Browse features, YouTube search, External, etc.) с динамикой по снэпшотам.

### Отличие от analyzeSuggestedTraffic

| | **analyzeTrafficSources** (этот тул) | **analyzeSuggestedTraffic** |
|---|---|---|
| **Вопрос** | Откуда приходит трафик? | Рядом с какими видео YouTube рекомендует моё? |
| **Данные** | Агрегированные метрики по источникам | Конкретные видео (с video ID) |
| **Строк в CSV** | ~6-8 (Suggested, Browse, Search...) | 50-500 (каждое видео отдельно) |
| **Firestore doc** | `trafficSource/main` | `traffic/main` |
| **Роль** | Gateway — общая картина | Drill-down — если Suggested доминирует |

---

## User flow

1. Пользователь: *"Откуда приходит трафик к моему видео?"*
2. LLM проверяет `trafficSourceSnapshotCount` из `getMultipleVideoDetails` → > 0
3. LLM вызывает `analyzeTrafficSources(videoId)`
4. Handler: Firestore → Cloud Storage → parse → timeline → JSON
5. LLM видит: *"80% — Suggested, 12% — Browse, 5% — Search"*
6. Если Suggested доминирует → LLM вызывает `analyzeSuggestedTraffic` для drill-down

---

## Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `videoId` | string (required) | ID видео для анализа |

---

## Что возвращает

```typescript
{
    sourceVideo: { videoId, title },
    snapshotTimeline: [{ date, label, totalSources }],
    sources: [{
        source: string,              // "Suggested videos", "Browse features", etc.
        views: number,
        impressions: number,
        ctr: number,
        avgViewDuration: string,
        watchTimeHours: number,
        timeline: [{
            date, label,
            views, impressions, ctr, avgViewDuration, watchTimeHours,
            deltaViews, deltaImpressions,  // pre-computed vs previous snapshot
        }],
    }],
    totalTimeline?: [{               // aggregate totals per snapshot
        date, label,
        views, impressions, ctr, watchTimeHours,
        deltaViews, deltaImpressions,
    }],
}
```

---

## Связанные фичи

- [Telescope Pattern Overview](../README.md) — архитектура tool chain
- [analyzeSuggestedTraffic](./2-analyze-suggested-traffic-tool.md) — drill-down после этого gateway
- [getMultipleVideoDetails](../layer-2-detail/1-get-multiple-video-details-tool.md) — `trafficSourceSnapshotCount` для pre-check
- [Traffic Sources UI](../../../video-details/traffic-sources.md) — откуда берутся CSV

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/analyzeTrafficSources.ts` | Handler: resolveVideosByIds → Cloud Storage → parse → timeline → JSON |
| `functions/src/services/tools/utils/resolveVideos.ts` | Shared video resolution (direct + publishedVideoId lookup) |
| `functions/src/services/tools/utils/trafficSourceCsvParser.ts` | CSV parser (Traffic Source format) |
| `functions/src/services/tools/utils/trafficSourceTimeline.ts` | `buildSourceTimeline` — per-source timelines with deltas |
| `functions/src/services/tools/definitions.ts` | Tool declaration |

### Data path

```
Firestore:  users/{uid}/channels/{channelId}/videos/{videoId}/trafficSource/main → snapshots[]
Storage:    storagePath from each snapshot entry → CSV body
```

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/analyzeTrafficSources.test.ts` | — |
| `functions/src/services/tools/utils/__tests__/trafficSourceCsvParser.test.ts` | — |
| `functions/src/services/tools/utils/__tests__/trafficSourceTimeline.test.ts` | — |
