# AI Tool: getMultipleVideoDetails — Feature Doc

## Текущее состояние

**Реализовано.** Telescope Pattern Layer 2 — detail. 3-level cascade lookup (Firestore own → external cache → YouTube API). Кэширует YouTube API результаты в `cached_external_videos/`. Для own-видео пробрасывает денормализованные `suggestedTrafficSnapshotCount` и `trafficSourceSnapshotCount` — LLM видит, у каких видео есть загруженные CSV для traffic analysis.

---

## Что это

LLM получает из `browseChannelVideos` компактный список (title + viewCount). Когда нужны полные метаданные (description, tags, channelTitle) — вызывает `getMultipleVideoDetails`. Тул максимально экономит квоту: сначала ищет в двух кэшах, и только если видео нигде нет — обращается к YouTube API.

---

## User flow

1. LLM видит интересное видео в результатах `browseChannelVideos` или `analyzeSuggestedTraffic`
2. Вызывает `getMultipleVideoDetails([videoId1, videoId2, ...])`
3. Handler: `videos/` → `cached_external_videos/` → YouTube API (only missing)
4. LLM получает полные метаданные + `ownership` + traffic snapshot counts

---

## Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `videoIds` | string[] (required) | Массив video ID (max 20) |

---

## Что возвращает

```typescript
{
    videos: [{
        videoId: string,
        title: string,
        description: string,
        tags: string[],
        ownership: "own-published" | "external",
        channelTitle?: string,
        viewCount?: number,
        likeCount?: number,
        publishedAt?: string,
        duration?: string,
        thumbnailUrl?: string,
        // Denormalized traffic snapshot counts (own videos only)
        suggestedTrafficSnapshotCount?: number,
        trafficSourceSnapshotCount?: number,
    }],
    notFound: string[],
    quotaUsed?: number,  // only present if YouTube API was called
}
```

### Traffic Snapshot Counts

Для own-видео (`ownership: "own-published"`) ответ может содержать:
- `suggestedTrafficSnapshotCount` — количество загруженных CSV снэпшотов Suggested Traffic
- `trafficSourceSnapshotCount` — количество загруженных CSV снэпшотов Traffic Sources

Эти поля денормализованы из `traffic/main` и `trafficSource/main` на документ видео. Обновляются:
- При create/delete снэпшота (service-level sync)
- При входе в Traffic / Traffic Sources таб (lazy sync)

LLM использует эти поля чтобы решить, стоит ли вызывать `analyzeTrafficSources` или `analyzeSuggestedTraffic`. Если поле = 0 или отсутствует — вызов бессмыслен.

---

## 3-Level Cascade

```
videos/ → cached_external_videos/ → YouTube API (1 unit / 50 videos)
```

1. **`videos/`** — собственные видео пользователя (0 API cost)
2. **`cached_external_videos/`** — внешние видео из предыдущих tool calls (0 API cost)
3. **YouTube API** — fallback, без отдельного quota gate (micro-cost: 1 unit на 50 видео)

YouTube API результаты кэшируются в `cached_external_videos/` для будущих 0-cost lookups.

---

## Связанные фичи

- [Telescope Pattern Overview](./README.md)
- [browseChannelVideos](./browse-channel-videos-tool.md) — часто вызывается перед этим тулом
- [analyzeTrafficSources](./analyze-traffic-sources-tool.md) — использует `trafficSourceSnapshotCount` для pre-check
- [analyzeSuggestedTraffic](./analyze-suggested-traffic-tool.md) — использует `suggestedTrafficSnapshotCount` для pre-check

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/getMultipleVideoDetails.ts` | Handler: 3-level cascade, formatting, denormalized counts |
| `functions/src/services/tools/definitions.ts` | Tool declaration |
| `src/core/services/traffic/syncSnapshotCount.ts` | Fire-and-forget sync utility (frontend) |

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/getMultipleVideoDetails.bugfix.test.ts` | 2 |
