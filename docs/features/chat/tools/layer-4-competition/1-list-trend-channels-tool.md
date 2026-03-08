# AI Tool: listTrendChannels — Feature Doc

## Текущее состояние

**Реализовано.** AI вызывает `listTrendChannels` как точку входа в конкурентную аналитику. Возвращает все отслеживаемые каналы-конкуренты из Trends с метаданными: количество видео, средние просмотры, подписчики, дата последней синхронизации, статистика распределения просмотров (`performanceDistribution`). Zero YouTube API cost — все данные из Firestore.

---

## Что это

Telescope Pattern Layer 4 — точка входа. LLM вызывает этот инструмент первым, когда пользователь спрашивает про конкурентов. Инструмент даёт ландшафт: кого пользователь отслеживает, как каналы перформят, когда последний раз обновлялись данные.

`performanceDistribution` (p25/median/p75/max) позволяет LLM понимать масштаб каждого канала — какой результат "нормальный", а какой аномальный. Это основа для per-channel percentile анализа в `browseTrendVideos`.

---

## User flow

1. Пользователь спрашивает: *"Какие каналы я отслеживаю? Как они перформят?"*
2. LLM вызывает `listTrendChannels()` (без параметров)
3. Handler читает channel-level docs из Firestore (10 reads при 10 каналах)
4. LLM получает список каналов и решает, куда копать дальше
5. Для детального исследования — `browseTrendVideos(channelIds: [...])` с конкретными ID из ответа

---

## Параметры

Нет входных параметров. Инструмент возвращает все отслеживаемые каналы.

---

## Что возвращает

```typescript
{
    channels: [{
        channelId: string,
        title: string,
        handle?: string,           // YouTube handle (e.g. @MrBeast)
        avatarUrl: string,
        videoCount: number,
        subscriberCount: number,
        averageViews: number,      // rounded to integer
        lastUpdated: string | null, // ISO 8601
        performanceDistribution?: {
            p25: number,
            median: number,
            p75: number,
            max: number,
        },
    }],
    totalChannels: number,
    totalVideos: number,           // sum of videoCount across all channels
    dataFreshness: [{
        channelId: string,
        channelTitle: string,
        lastSynced: string | null,
    }],
}
```

### Что получает LLM

| Вопрос | Ответ в JSON |
|--------|-------------|
| Сколько конкурентов отслеживается? | `totalChannels` |
| Какой масштаб у каждого канала? | `channels[].subscriberCount`, `averageViews` |
| Что "нормально" для канала X? | `performanceDistribution.median` — медиана просмотров |
| Когда обновлялись данные? | `dataFreshness[].lastSynced` |
| Какие каналы фильтровать дальше? | `channels[].channelId` → передать в `browseTrendVideos` |

---

## Эффективность Firestore

**Reads per call:** N (где N = количество отслеживаемых каналов, обычно 5-10).

Handler читает ТОЛЬКО channel-level документы из `trendChannels/` collection. Video subcollections (обычно ~800 видео × 10 каналов = 8000 docs) **не читаются**. `videoCount` и `performanceDistribution` кэшируются на channel doc при sync.

---

## Связанные фичи

- [Telescope Pattern Overview](../README.md) — Layer 4: Competition
- [browseTrendVideos](./2-browse-trend-videos-tool.md) — следующий шаг (видео конкурентов с фильтрами)
- [getNicheSnapshot](./3-get-niche-snapshot-tool.md) — контекст ниши вокруг даты
- [Competitive Intelligence](./competitive-intelligence.md) — roadmap и архитектура

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/listTrendChannels.ts` | Handler: read channel docs, format response |
| `functions/src/services/tools/definitions.ts` | Tool declaration (no parameters) |
| `functions/src/services/tools/executor.ts` | Tool routing |
| `functions/src/services/sync.ts` | `updateChannelStats()` — caches `performanceDistribution` and `videoCount` on channel doc |

### Data path

```
Firestore: users/{userId}/channels/{channelId}/trendChannels/{trendChannelId}
  Fields: title, handle, avatarUrl, subscriberCount, averageViews, videoCount,
          performanceDistribution, lastUpdated
```

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/listTrendChannels.test.ts` | 9 (empty state, fields, distribution null, lastUpdated formats, totalVideos, dataFreshness) |
