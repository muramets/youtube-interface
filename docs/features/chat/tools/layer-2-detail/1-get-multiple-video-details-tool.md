# AI Tool: getMultipleVideoDetails — Feature Doc

## Текущее состояние

**Реализовано.** Telescope Pattern Layer 2 — detail. 5-level cascade lookup (Firestore own → reverse publishedVideoId → external cache → trendChannels → YouTube API). Кэширует YouTube API результаты в `cached_external_videos/` (включая `channelId` для view delta lookup). Для own-видео пробрасывает денормализованные `suggestedTrafficSnapshotCount` и `trafficSourceSnapshotCount`. View delta enrichment: каждое видео получает `viewDelta24h/7d/30d` из trend snapshots (когда канал отслеживается). Поддерживает поиск по `titles` (exact match через 3 Firestore коллекции) для случаев, когда videoId неизвестен. Возвращает `youtubeVideoId` для custom-видео (отличается от внутреннего doc ID).

---

## Что это

LLM получает из `browseChannelVideos` компактный список (title + viewCount). Когда нужны полные метаданные (description, tags, channelTitle) — вызывает `getMultipleVideoDetails`. Принимает `videoIds` и/или `titles` — если модель знает только название видео, она передаёт его в `titles`, и тул сам резолвит ID через Firestore (0 API cost). Это устраняет архитектурный gap, где модели пытались угадать videoId по названию.

Тул максимально экономит квоту: сначала ищет через `resolveVideosByIds` (direct lookup + reverse lookup по `publishedVideoId` для custom videos + trendChannels для конкурентских видео), и только если видео нигде нет — обращается к YouTube API.

---

## User flow

1. LLM видит интересное видео в результатах `browseChannelVideos` или `analyzeSuggestedTraffic`
2. Вызывает `getMultipleVideoDetails({ videoIds: [...] })` или `getMultipleVideoDetails({ titles: [...] })` (когда videoId неизвестен)
3. Handler: titles → `resolveVideoIdsByTitle` (Firestore search) → merge с videoIds → `resolveVideosByIds` (5-level cascade) → YouTube API (only missing)
4. LLM получает полные метаданные + `ownership` + traffic snapshot counts + view deltas + `youtubeVideoId` (для custom-видео)

---

## Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `videoIds` | string[] | Массив video ID (max 20). Из `[id: ...]` annotation в контексте |
| `titles` | string[] | Fallback: exact video titles для поиска по Firestore (0 API cost). Используй когда videoIds неизвестны |

Хотя бы один из `videoIds` или `titles` обязателен.

---

## Что возвращает

```typescript
{
    videos: [{
        videoId: string,
        // YouTube-embeddable ID. Present only for custom videos where it differs from videoId.
        // Custom published: youtubeVideoId = publishedVideoId. Regular videos: omitted (videoId IS YouTube ID).
        youtubeVideoId?: string,
        title: string,
        description: string,
        tags: string[],
        ownership: "own-published" | "own-draft" | "external",
        channelTitle?: string,
        viewCount?: number,
        likeCount?: number,
        commentCount?: number,
        publishedAt?: string,
        duration?: string,
        thumbnailUrl?: string,
        channelId?: string,
        // Denormalized traffic snapshot counts (own videos only)
        suggestedTrafficSnapshotCount?: number,
        trafficSourceSnapshotCount?: number,
        // YouTube-wide view growth (from trend snapshots, when channel is tracked)
        viewDelta24h?: number | null,
        viewDelta7d?: number | null,
        viewDelta30d?: number | null,
    }],
    notFound: string[],           // videoIds not resolved
    notFoundTitles?: string[],    // titles not resolved (only when titles param used)
    quotaUsed?: number,           // only present if YouTube API was called
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

### View Deltas (YouTube-wide growth)

Для каждого видео (own и external) ответ может содержать:
- `viewDelta24h` — рост просмотров за последние 24 часа
- `viewDelta7d` — рост за 7 дней
- `viewDelta30d` — рост за 30 дней

Данные берутся из trend snapshots через `trendSnapshotService`. Доступны только когда канал видео отслеживается в Trends. `null` = snapshot для этого окна отсутствует (канал синкался недостаточно долго). `undefined` (поле отсутствует) = канал не отслеживается.

LLM использует дельты для оценки динамики: видео с 1M views и `viewDelta24h: 0` — мёртвое; видео с 50K views и `viewDelta24h: +5K` — активно растёт.

Graceful degradation: если `trendSnapshotService` недоступен — видео возвращаются без delta полей.

Подробнее: [Video View Deltas](../../../video-view-deltas.md)

---

## 5-Level Cascade

```
resolveVideosByIds (videos/ + publishedVideoId reverse + cached_external_videos/ + trendChannels/) → YouTube API (1 unit / 50 videos)
```

1. **`videos/`** — собственные видео по document ID (0 API cost)
2. **`videos/` reverse lookup** — custom videos по полю `publishedVideoId` (0 API cost)
3. **`cached_external_videos/`** — внешние видео из предыдущих tool calls (0 API cost)
4. **`trendChannels/{ch}/videos/`** — конкурентские видео из Trends (0 API cost, graceful degradation)
5. **YouTube API** — fallback, без отдельного quota gate (micro-cost: 1 unit на 50 видео)

YouTube API результаты кэшируются в `cached_external_videos/` для будущих 0-cost lookups.

---

## Связанные фичи

- [Telescope Pattern Overview](../README.md)
- [browseChannelVideos](../layer-1-discovery/2-browse-channel-videos-tool.md) — часто вызывается перед этим тулом
- [analyzeTrafficSources](../layer-3-analysis/1-analyze-traffic-sources-tool.md) — использует `trafficSourceSnapshotCount` для pre-check
- [analyzeSuggestedTraffic](../layer-3-analysis/2-analyze-suggested-traffic-tool.md) — использует `suggestedTrafficSnapshotCount` для pre-check
- [getVideoComments](./3-get-video-comments-tool.md) — использует `commentCount` как сигнал для вызова

---

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### План проверки

| # | Сценарий | Что проверяет | Промпт-идея | Проверено |
|---|----------|---------------|-------------|-----------|
| 1 | **Happy path (own video)** | Cascade level 1: прямой lookup в videos/ | "Расскажи подробнее про моё видео [X]" | — |
| 2 | **External video (cached)** | Cascade level 3: cached_external_videos/ без API call | "Что за видео [videoId из suggested traffic]?" | ✅ |
| 3 | **External video (API fallback)** | Cascade level 5: YouTube API + caching | "Расскажи про видео [неизвестный ID]" | — |
| 4 | **Title lookup** | titles param: Firestore search → videoId resolution (0 API cost) | "Расскажи про видео 'exact title here'" | — |
| 5 | **Title not found** | notFoundTitles в ответе — не галлюцинирует ли модель? | "Расскажи про видео 'несуществующее название'" | — |
| 6 | **Batch (multiple IDs)** | Несколько видео за один call, mix own + external | "Сравни эти 5 видео: [IDs]" | — |
| 7 | **View deltas usage** | Использует ли модель viewDelta24h/7d/30d для оценки динамики | "Какие из моих видео сейчас растут?" | — |
| 8 | **Snapshot counts → tool chain** | Видит ли модель suggestedTrafficSnapshotCount и вызывает drill-down | "Проанализируй трафик [видео с CSV]" | ✅ (via analyzeSuggestedTraffic trace #1) |
| 9 | **Custom video (publishedVideoId)** | Cascade level 2: reverse lookup для custom videos | Вызов с custom-* videoId | — |
| 10 | **Ownership labeling** | Правильно ли модель различает own-published / external | "Это моё видео или конкурента?" | — |

### Ключевые вопросы

1. **Cascade efficiency** — Как часто срабатывает YouTube API fallback vs Firestore-only? Нужен trace с quotaUsed > 0
2. **Title lookup accuracy** — Точный match по title достаточен? Или пользователь пишет приблизительно?
3. **View deltas interpretation** — Модель понимает разницу между null (нет данных) и 0 (стагнация)?
4. **Batch size** — При 10+ видео ответ помещается в context window? Как модель фильтрует релевантные?
5. **Tool chain trigger** — suggestedTrafficSnapshotCount > 0 надёжно запускает chain в analyzeTrafficSources/analyzeSuggestedTraffic?

### Проверено в бою

<details>
<summary>Trace #1 — External video from suggested traffic (тест #2) ✅</summary>

- **Промпт**: "что за видео fVJ6iDoziiY?"
- **Контекст**: после `analyzeSuggestedTraffic` для own-видео (spring piano playlist)
- **Модель**: claude-haiku-4-5
- **Результат**: ✅ тул отработал корректно, cascade Firestore-only (`quotaUsed` отсутствует)

**Что сработало:**
- Tool call: `getMultipleVideoDetails({ videoIds: ["fVJ6iDoziiY"] })` — модель правильно извлекла videoId
- Cascade: 0 API cost — видео найдено в Firestore (trendChannels или cached_external_videos)
- `ownership: "external"` — правильно
- Модель связала данные с предыдущим `analyzeSuggestedTraffic` (impressions, CTR, avgViewDuration)
- Description, tags, viewCount использованы в ответе

**Проблемы:**
- ⚠️ **Haiku arithmetic error**: написал "25:54 — дольше, чем 38:47" (перепутал направление сравнения). Данные верные, интерпретация ошибочная. Sonnet/Opus вероятно не допустят — не усложняем тул.
- ⚠️ **`viewCount`/`likeCount` как строки**: `formatVideoData()` пробрасывает Firestore-значения без конверсии. YouTube API path конвертирует через `parseInt()`, Firestore path — нет. **Баг подтверждён, фикс запланирован.**
- **`commentCount` отсутствует** при Firestore-only resolve — ограничение cascade, поле optional.
- **`viewDelta` полей нет** — канал Giuseppe Centonze не в Trends. Ожидаемое поведение.

**Ответ на ключевой вопрос #1 (Cascade efficiency):** в этом trace YouTube API не вызывался — видео зарезолвилось через Firestore. Cascade работает как задумано.

</details>

_Тест #8 покрыт через [analyzeSuggestedTraffic trace #1](../layer-3-analysis/2-analyze-suggested-traffic-tool.md) — модель увидела snapshotCount и вызвала drill-down._

### Ещё не проверено в бою

| Сценарий | Почему важно |
|----------|-------------|
| **Title fallback** | Частый user pattern: "расскажи про видео [название]" без ID |
| **quotaUsed > 0** | Убедиться что API fallback работает и кеширует |
| **Custom video resolution** | Reverse lookup по publishedVideoId — нетривиальный путь |
| **notFound handling** | Модель должна сообщить что видео не найдено, не галлюцинировать |

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/getMultipleVideoDetails.ts` | Handler: title resolution + cascade via resolveVideosByIds, formatting, denormalized counts, view delta enrichment, youtubeVideoId |
| `functions/src/services/tools/utils/resolveVideos.ts` | Shared 3-step video resolution (direct + publishedVideoId + trendChannels) |
| `functions/src/services/tools/utils/resolveVideosByTitle.ts` | Shared title→videoId resolution across 3 Firestore collections (videos/ → cached_external_videos/ → trendChannels/) |
| `functions/src/services/trendSnapshotService.ts` | View delta enrichment: admin SDK → `calculateViewDeltas()` from `shared/viewDeltas.ts` |
| `functions/src/services/tools/definitions.ts` | Tool declaration (`titles` param, "Never invent video IDs" instruction) |
| `src/core/services/traffic/syncSnapshotCount.ts` | Fire-and-forget sync utility (frontend) |

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/getMultipleVideoDetails.bugfix.test.ts` | 2 |
| `functions/src/services/tools/handlers/__tests__/getMultipleVideoDetails.viewDeltas.test.ts` | 5 (deltas present, null, failure graceful, channelId hints, mix own+external) |
| `functions/src/services/tools/handlers/__tests__/getMultipleVideoDetails.titles.test.ts` | 7 (title resolution, notFoundTitles, merge titles+videoIds, deduplication, defensive string input, error on empty, no YouTube API for title-resolved) |
