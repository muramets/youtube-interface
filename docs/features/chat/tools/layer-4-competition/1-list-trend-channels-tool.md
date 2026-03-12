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

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### План проверки

| # | Сценарий | Что проверяет | Промпт-идея | Проверено |
|---|----------|---------------|-------------|-----------|
| 1 | **Happy path** | Все каналы возвращаются, поля корректны | "Каких конкурентов я отслеживаю?" | ✅ |
| 2 | **performanceDistribution interpretation** | Модель правильно использует p25/median/p75 для контекста | "Как перформят мои конкуренты? Кто сильнее/слабее?" | — |
| 3 | **Routing to browseTrendVideos** | Модель передаёт channelIds в browseTrendVideos, не в browseChannelVideos | "Покажи последние видео [канала из трендов]" | ✅ |
| 4 | **dataFreshness awareness** | Модель предупреждает о устаревших данных | (покрыто если есть stale channel) | — |
| 5 | **Zero channels** | Пустой ответ — модель объясняет, как добавить каналы | (нужен новый пользователь без trend data) | — |

### Проверено в бою

Модель: `claude-haiku-4-5`. Вызывался как первый шаг в цепочках getNicheSnapshot.

| # | Trace source | $ | Channels | Videos | Routing | Баги |
|---|-------------|---|----------|--------|---------|------|
| 1 | getNicheSnapshot #1a/1b | .039/.040 | 15 | 2098 | → getNicheSnapshot | ✅ |
| 3a | getNicheSnapshot #3b | .062 | 15 | 2098 | → browseChannelVideos (не browseTrendVideos) | Routing bug† |
| 3b | browseTrendVideos #1 (post-fix) | .022 | 15 | 2098 | → browseTrendVideos ✅ | Routing исправлен хинтом |

### Паттерны

- **Всегда первый в цепочке.** Во всех traces модель вызывает listTrendChannels как entry point — паттерн стабилен
- **Routing исправлен.** До хинта (trace 3a): Haiku игнорировал "Use channelId to filter browseTrendVideos" и шёл через browseChannelVideos (2 YT units). После встречного хинта в browseChannelVideos description (trace 3b): модель корректно выбрала browseTrendVideos (0 units)

### Найденные баги

**† Haiku routing: browseChannelVideos вместо browseTrendVideos** (хинт добавлен 2026-03-12)
- Подробности в [getNicheSnapshot battle test #3](./3-get-niche-snapshot-tool.md) (секция ¶)
- Фикс: добавлен хинт в `browseChannelVideos` description — "If channel is tracked in Trends, use browseTrendVideos instead"

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
