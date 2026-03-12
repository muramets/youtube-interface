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

### Cost trade-off

Delta sorts дороже обычных: чтобы определить настоящий top-N по росту, handler обогащает дельтами **все** отфильтрованные видео (не только limit). Для 350 videos с limit 50 — это 350 delta lookups вместо 50. Trade-off осознанный: обрезка до limit перед обогащением дала бы некорректный top-N.

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

- [Telescope Pattern Overview](../README.md) — Layer 4: Competition
- [listTrendChannels](./1-list-trend-channels-tool.md) — prerequisite (channelIds)
- [getNicheSnapshot](./3-get-niche-snapshot-tool.md) — агрегированный снимок ниши
- [viewThumbnails](../layer-2-detail/2-view-thumbnails-tool.md) — визуальный анализ обложек результатов
- [Competitive Intelligence](./competitive-intelligence.md) — roadmap и архитектура

---

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### План проверки

| # | Сценарий | Что проверяет | Промпт-идея | Проверено |
|---|----------|---------------|-------------|-----------|
| 1 | **channelIds + sort by views** | Фильтр по каналу, сортировка по views, top видео | "Покажи самые популярные видео Little Thing" | ✅ |
| 2 | **dateRange filter** | Видео за конкретный период | "Что публиковали конкуренты на прошлой неделе?" | — |
| 3 | **performanceTier filter** | Top 1% per-channel — хиты каждого конкурента | "Покажи хиты каждого конкурента" | ✅ |
| 4 | **delta sort (delta7d/30d)** | Самые быстрорастущие видео, fallback при null deltas | "Какие видео конкурентов растут быстрее всего?" | ✅ |
| 5 | **totalMatched > limit** | Модель понимает truncation и сужает фильтры | (покрыто при широком запросе без фильтров) | — |
| 6 | **Cross-channel comparison** | Модель сравнивает каналы через channels[].matchedCount | "Кто активнее всех в последний месяц?" | — |
| 7 | **Chained: browseTrendVideos → viewThumbnails** | Модель передаёт videoIds для визуального анализа обложек | "Покажи обложки топ-видео конкурентов" | — |

### Проверено в бою

Модель: `claude-haiku-4-5`.

| # | Сценарий | Query | $ | Iter | Tools | Videos | Баги |
|---|----------|-------|---|------|-------|--------|------|
| 1 | channelIds + sort views | "Покажи топ-5 самых популярных видео Little Thing из моих трендов" | — | 1 | listTrendChannels → browseTrendVideos | 5/69 | mentionVideo: 0 calls (Haiku shortcut) |
| 3 | performanceTier Top 1% | "Покажи Top 1% видео каждого конкурента из трендов" | — | 1 | listTrendChannels → browseTrendVideos(Top 1%, limit:200) | 29/2098 | mentionVideo: 0 calls, Haiku сам увеличил limit до 200 |
| 4a | delta7d sort | "Какие видео конкурентов растут быстрее всего за последнюю неделю?" (Haiku) | — | 1 | listTrendChannels → browseTrendVideos(delta7d, limit:20) | 20/2135 | mentionVideo: 0 calls. Сортировка корректна (96K→87K→68K→...) |
| 4b | delta30d + dateRange (Haiku) | "...за последний месяц?" (Haiku) | — | 1 | listTrendChannels → browseTrendVideos(delta30d, dateRange 30d, limit:20) | 20/245 | **Haiku ловушка:** dateRange отсёк старые видео → все delta30d=null → fallback на views. Модель проигнорировала `_note`, написала "sorted by 30-day growth" и показала delta7d |
| 4c | delta30d без dateRange (Sonnet) | "...за последний месяц?" (Sonnet, thinking low) | — | 1 | listTrendChannels → browseTrendVideos(delta30d, limit:20) + 7× mentionVideo | 20/2135 | **Sonnet корректно:** без dateRange, реальные delta30d (411K→336K→335K→...), 7 mentionVideo calls, аналитический вывод |

### Паттерны

- **Хинт в browseChannelVideos сработал.** После добавления "If channel is tracked in Trends, use browseTrendVideos instead" (2026-03-12) модель корректно выбрала Layer 4 tool. Ранее (trace getNicheSnapshot #3b) модель шла через browseChannelVideos с 2 YT units
- **Идеальные параметры.** `{ channelIds: ["UCmGML6S4cvUf3QcPSYhGJKg"], sort: "views", limit: 5 }` — точно соответствует запросу. totalMatched: 69 корректно показывает полный набор
- **mentionVideo shortcut.** Haiku пишет `[title](mention://videoId)` inline, 0 tool calls. [Known issue](../utility/mention-video-tool.md)
- **Haiku + dateRange + delta sort = ловушка.** Haiku добавляет dateRange к delta30d запросу → свежие видео не имеют delta30d → fallback → игнорирует `_note`. Sonnet не ставит dateRange и получает корректный результат
- **Sonnet вызывает mentionVideo.** 7 calls в trace 4c vs 0 у Haiku. Sonnet следует tool contract, Haiku шорткатит

### Known Issues

| Issue | Описание | Severity |
|-------|----------|----------|
| **Haiku игнорирует `_note`** | При delta fallback (sorted by views instead) Haiku не предупреждает пользователя, пишет "sorted by 30-day growth" и показывает delta7d вместо delta30d | Medium — Sonnet не воспроизводит |
| **Свежие видео выпадают из delta sort** | Видео < 30 дней имеют delta30d=null, хотя их viewCount ≈ реальный прирост с момента публикации. При `sort: "delta30d"` они уходят в конец списка. На практике impact минимален: без dateRange старые видео доминируют, с dateRange estimated delta ≈ viewCount (порядок тот же). Решение отложено — estimated delta показывается в UI как реальная, что сбивает с толку | Low |

### Ещё не проверено в бою

| Сценарий | Почему важно |
|----------|-------------|
| **Hidden videos** | Скрытые видео не попадают в результат — проверить на реальных данных |
| **Large limit (200)** | ~25K tokens — модель справится с таким объёмом? |

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
