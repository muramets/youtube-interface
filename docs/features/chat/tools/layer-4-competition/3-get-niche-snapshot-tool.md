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
        commonTags: [{ tag: string, weight: number }],  // top 20, log-scaled view weight, sorted desc
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
| Какие темы были горячими? | `aggregates.commonTags` — теги, ранжированные по log-scaled view weight (баланс частотности и views) |
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

- [Telescope Pattern Overview](../README.md) — Layer 4: Competition
- [listTrendChannels](./1-list-trend-channels-tool.md) — prerequisite (landscape)
- [browseTrendVideos](./2-browse-trend-videos-tool.md) — детальный поиск видео с фильтрами
- [viewThumbnails](../layer-2-detail/2-view-thumbnails-tool.md) — визуальный анализ обложек
- [Competitive Intelligence](./competitive-intelligence.md) — roadmap и архитектура

---

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### План проверки

| # | Сценарий | Что проверяет | Промпт-идея | Проверено |
|---|----------|---------------|-------------|-----------|
| 1 | **date path (broad)** | Happy path: date → window → все каналы, aggregates, commonTags | "Покажи конкурентную активность в нише за последнюю неделю" | ✅ |
| 2 | **videoId path (own video)** | Resolution через own videos, window вокруг publishedAt | "Что конкуренты публиковали, когда вышло моё [видео]?" | ✅ |
| 3 | **videoId + channelId (competitor)** | Single doc read, инвертированный lookup (trend first) | "Что было в нише, когда [конкурент] выпустил [видео]?" | ✅ |
| 4 | **Custom windowDays** | Расширенное/сжатое окно, влияние на aggregates | "Покажи конкурентную активность ±3 дня вокруг [даты]" | ✅ |
| 5 | **Пустое окно** | Дата вне диапазона tracked данных — пустой competitorActivity | "Что было в нише 1 января 2020?" | ✅ |
| 6 | **commonTags quality** | Тегов много, top-20 отражают реальные темы ниши | (покрыто trace #1) | ✅ |
| 7 | **performanceTier accuracy** | Tier на полном наборе (не на window) — проверить top 1% vs реальность | Сверить tier видео с browseTrendVideos | ✅ |
| 8 | **Model interpretation** | Группировка по каналам, trend detection, рекомендации | (покрыто trace #1) | ✅ |
| 9 | **Chained: getNicheSnapshot → mentionVideo** | Модель упоминает видео из snapshot через mentionVideo | "Кто доминировал в нише на прошлой неделе? Покажи лучшие видео" | — |
| 10 | **videoId only (no channelId)** | Scan всех trend channels через db.getAll() | Передать videoId конкурента без channelId hint | — |

### Проверено в бою (2026-03-11)

Модель: `claude-haiku-4-5`. Два прогона: до и после UI/backend фиксов.

| # | Сценарий | Query | $ | Iter | Tools | Videos | Ch | Баги |
|---|----------|-------|---|------|-------|--------|----|------|
| 1a | date path (pre-fix) | "конкурентная активность за неделю" | .039 | 2 | listTrendChannels → getNicheSnapshot | 55 | 11/15 | commonTags bias†, window display‡, `\u00b7`/`\u2014` |
| 1b | date path (post-fix) | то же | .040 | 2 | listTrendChannels → getNicheSnapshot | 55 | 11/15 | mentionVideo: 0 calls (Haiku) |
| 2a | videoId own (pre-fix) | "когда вышло waiting for summer?" | .014 | 2 | getMultipleVideoDetails(hallucinated ID) | 0 | 0 | **FAIL**: галлюцинация videoId, 1 YT unit потрачен§ |
| 2b | videoId own (post-fix) | то же | .043 | 3 | getMultipleVideoDetails(titles) → getNicheSnapshot(date) | 124 | 14/15 | ✅ 6 mentionVideo calls |
| 3a | competitor video (1st prompt) | "когда Little Thing выпустил самое популярное видео?" | .002 | 1 | (none) | 0 | 0 | **FAIL**: модель не вызвала tools, попросила ID |
| 3b | competitor video (2nd prompt) | "Найди в трендах Little Thing..." | .062 | 4 | listTrendChannels → browseChannelVideos → getNicheSnapshot(date) | 80 | 12/15 | browseChannelVideos вместо browseTrendVideos (2 YT units)¶, mentionVideo: 0 calls |
| 4 | custom windowDays | "±3 дня вокруг 1 марта 2026" | — | 1 | getNicheSnapshot(date, windowDays:3) + 3× mentionVideo | 49 | 15/15 | ✅ clean pass |
| 5a | пустое окно (1st prompt) | "Что было в нише 1 января 2020?" | — | 1 | (none) | 0 | 0 | **FAIL**: Haiku не вызвал tool, решил за пользователя |
| 5b | пустое окно (2nd prompt) | "Используй getNicheSnapshot для 1 января 2020" | — | 1 | getNicheSnapshot(date) | 0 | 0/15 | ✅ пустой competitorActivity, модель не галлюцинировала |
| 7 | performanceTier accuracy | "Покажи Top 1% видео каждого конкурента из трендов" | — | 1 | listTrendChannels → browseTrendVideos(Top 1%, limit:200) | 29 | 15/15 | ✅ тиры совпадают с getNicheSnapshot, mentionVideo: 0 calls |

### Паттерны

- **Window ±7 от сегодня = будущее в UI.** Модель выбрала `date: "2026-03-11"` для "за последнюю неделю" → окно до 2026-03-18. Данных в будущем нет, но raw window вводит в заблуждение. Фикс: frontend показывает фактический диапазон публикаций, не search window
- **commonTags эволюция (3 итерации).** `count` (частотность) → bias к спам-каналам. `totalViews` (raw sum) → bias к одному мега-хиту (80K видео = 96K totalViews во всех его тегах). `weight` (log-scaled) → баланс частотности и performance. Формула: `sum(log(1 + viewCount))` per tag
- **Haiku не вызывает mentionVideo.** Тот же паттерн, что в searchDatabase: Haiku пишет `[title](mention://videoId)` с placeholder вместо реального ID. Known model limitation, не tool bug. Задокументировано в [mentionVideo known issues](../utility/mention-video-tool.md)
- **Haiku не проявляет инициативу в tool discovery.** На промпт "когда Little Thing выпустил самое популярное видео?" модель не начала с `listTrendChannels`, а попросила ID вручную (тест #3a). Тот же паттерн, что в #2a. Переформулировка с явным "найди в трендах" решает проблему (#3b)
- **browseChannelVideos vs browseTrendVideos для trend-каналов.** Модель использовала Layer 1 tool (browseChannelVideos, 2 YT units) вместо Layer 4 (browseTrendVideos, 0 units) для канала из listTrendChannels. Хинт в listTrendChannels ("use channelId to filter browseTrendVideos") был проигнорирован. Фикс: добавлен встречный хинт в browseChannelVideos description
- **videoId + channelId path нетестируем через battle test.** Модель всегда узнаёт publishedAt до вызова getNicheSnapshot (из browseChannelVideos или getMultipleVideoDetails) и выбирает date path per tool description. Этот path покрыт unit tests (14 кейсов)
- **windowDays: half-window понят корректно.** "±3 дня" → `windowDays: 3` (не 6). Модель правильно интерпретировала семантику параметра
- **mentionVideo нестабилен у Haiku.** В traces #1b, #3b — 0 calls (inline shortcut). В trace #4 — 3 calls (полноценные tool calls с badges). Возможная причина: в #4 модель вызвала getNicheSnapshot напрямую (1 итерация, меньше контекста) → больше "бюджета внимания" на mentionVideo
- **Haiku фильтрует "бессмысленные" вызовы.** На промпт "что было в нише 1 января 2020?" модель решила не вызывать tool, объяснив что данных нет (trace #5a). Плюс: экономия. Минус: assumption не проверен — данные могли быть. Явная инструкция "используй getNicheSnapshot" решает проблему (#5b)
- **Пустое окно: handler стабилен.** `competitorActivity: []`, `totalVideosInWindow: 0`, `commonTags: []` — никаких крешей. `dataFreshness` возвращается даже при пустом окне (полезно: модель видит что каналы есть, просто данных за период нет)
- **performanceTier консистентен между инструментами.** Cross-verification: `A4SkhlJ2mK8` (slow life mode, 121K) = Top 1% в обоих getNicheSnapshot и browseTrendVideos. `OEuaEaXGXCY` (Little Thing, 317K) = Top 1% в обоих. Оба инструмента используют `shared/percentiles.ts` на полном наборе видео канала — тиры совпадают

### Ключевые наблюдения по traces

**#1a Pre-fix "конкурентная активность за неделю"** — 2 tool calls: `listTrendChannels` (15 каналов) → `getNicheSnapshot(date: "2026-03-11")`. 55 видео в окне, 11 каналов активны. Модель корректно определила лидеров (Little Thing 80K, Ophelia's Playlists 17K), тренд сезонности ("spring"), и каналы "на дне" (Wilde Ophelia avg 63 views). commonTags bias: "focus music" ×14 = #1, но 13 из 14 видео < 200 views. UI баги: `\u2014` в дате, `\u00b7` в TrendChannelsStats, сортировка каналов/видео в expanded pill случайная

**#1b Post-fix** — те же данные, но UI пофикшен: дата как фактический range (Mar 4 — Mar 10), каналы отсортированы по avgViews, видео по viewCount, "Top tags" вместо "Tags". commonTags теперь log-weighted: `focus music` (14 видео × low views) всё ещё высоко, но не доминирует единолично. Модель дала более структурированный ответ: секции "Лидеры", "Тренды", "Что работает/не работает"

### Найденные и исправленные баги

**† commonTags: frequency → raw views → log-scale** (исправлен 2026-03-11)
- **Симптом v1 (frequency):** `focus music` ×14 = #1, но 13 из 14 видео — Wilde Ophelia (50-120 views). Tag #1 определялся спамом, а не качеством
- **Симптом v2 (raw views):** `relaxing piano music` totalViews=96K = #1, но 80K из 96K — одно видео Little Thing. Все top-10 тегов из 1-2 видео одного канала
- **Фикс:** `sum(log(1 + viewCount))` per tag. Log-scale: 80K views ≈ weight 11, 80 views ≈ weight 4. Баланс: tag в 7 low-view видео (28) > tag в 1 mega-hit (11), но tag в 1 hit (11) > tag в 2 tiny видео (6)
- **Файл:** `getNicheSnapshot.ts` (handler), `definitions.ts` (tool description)
- **Урок:** данные с power-law распределением (views) требуют log-scale для fair ranking. Ни frequency, ни raw sum не работают

**‡ Expanded pill UI bugs** (исправлены 2026-03-11)
- `\u2014` / `\u00b7` в JSX — Unicode escapes в JSX text не интерпретируются (только в JS strings/template literals). Заменены на символы `—` / `·`
- Window display — raw search window (включая будущее) → фактический date range из `competitorActivity[].videos[].publishedAt`
- Каналы не отсортированы → sorted by avgViews desc
- Видео в expanded pill не отсортированы → sorted by viewCount desc (через `sortVideosBy: 'views'` в toolRegistry config)
- "Tags:" → "Top tags:"
- **Scope:** `NicheSnapshotStats.tsx`, `TrendChannelsStats.tsx`, `BrowseChannelStats.tsx`, `ToolCallSummary.tsx`, `toolRegistry.ts`

**§ #2a/2b "Что конкуренты публиковали, когда вышло моё видео?"** (2026-03-12, Haiku)

Промпт: "Что конкуренты публиковали, когда вышло мое видео waiting for summer (a playlist for a quiet morning)?"

**Результат: FAIL — модель галлюцинировала videoId.** Tool call: `getMultipleVideoDetails({ videoIds: ["bJ7sRJ_3Aro"] })` — выдуманный ID. Firestore miss → YouTube API fallback (1 unit потрачен) → notFound. Модель сдалась и попросила пользователя дать ID.

**Root cause: архитектурный gap, не баг модели.** У модели не было инструмента для поиска видео по названию. `getMultipleVideoDetails` принимал только `videoIds`. Единственный альтернативный path (`browseChannelVideos`) требовал `uploadsPlaylistId` + user approval. Модель оказалась в тупике и "помогла" — выдумала ID.

**Три бага обнаружены и исправлены:**

1. **Tool architecture gap → `titles` param** (исправлен 2026-03-12)
   - Добавлен `titles` param в `getMultipleVideoDetails` (по аналогии с `viewThumbnails`)
   - Shared util: `resolveVideosByTitle.ts` (DRY — извлечён из viewThumbnails)
   - `getNicheSnapshot` description обновлён: "first call getMultipleVideoDetails with titles"
   - Zero API cost — поиск по Firestore: videos/ → cached_external_videos/ → trendChannels/

2. **notFound pill показывал raw videoId** (исправлен 2026-03-12)
   - `extractDetailVideoIds` теперь берёт IDs из `result.videos` (не `args.videoIds`)
   - notFound items естественно исключаются из pill
   - Во время загрузки — fallback на `args.videoIds` для immediate feedback

3. **Квота тратилась на галлюцинированные ID** (следствие #1, решено)
   - Модель больше не будет выдумывать IDs — есть путь через `titles`

**Урок:** когда модель галлюцинирует — ищи gap в tool architecture, не чини промптом. Deterministic > magic.

**Post-fix trace (2b):** тот же промпт → `getMultipleVideoDetails({ titles: ["waiting for summer..."] })` → 1 video found (0 quota) → `getNicheSnapshot({ date: "2026-02-12" })` → 124 видео в окне ±7 дней, 14 каналов. Модель дала жёсткий анализ: "worst possible day to launch" — Little Thing выпустил в тот же день видео с 249K views. 6 mentionVideo calls (Haiku, которая раньше не вызывала mentionVideo — видимо, больший контекст = больше поводов для ссылок). Cost: $0.043 (3 iterations).

**¶ #3a/3b "Что происходило в нише, когда Little Thing выпустил самое популярное видео?"** (2026-03-12, Haiku)

Промпт 1: "Что происходило в нише, когда Little Thing выпустил своё самое популярное видео?"

**Результат: FAIL — модель не вызвала ни одного инструмента**, попросила video ID и channel URL. Тот же паттерн инициативы, что в #2a — Haiku не начинает tool chain самостоятельно.

Промпт 2: "Найди в моих трендах канал Little Thing, посмотри его самое популярное видео и покажи что было в нише когда оно вышло"

**Результат: SUCCESS.** Цепочка: `listTrendChannels` (15 каналов) → `browseChannelVideos({ channelId: "UCmGML6S4cvUf3QcPSYhGJKg", uploadsPlaylistId: "UUmGML6S4cvUf3QcPSYhGJKg" })` (69 видео, quotaUsed: 2) → `getNicheSnapshot({ date: "2025-10-26", windowDays: 7 })` (80 видео, 12 каналов активны).

Модель нашла топ-видео — "this feels like a quiet morning in a coffee shop 🍂" (OEuaEaXGXCY, 317K views, 2025-10-26). Анализ ниши: James Quinn доминировал (1M + 393K), Little Thing 3-е место. Autumn-тематика синхронизирована у всех каналов.

**Баг: browseChannelVideos вместо browseTrendVideos.** Модель вычислила `uploadsPlaylistId` (UC→UU) и вызвала Layer 1 tool. Все 69 видео уже в кэше (fetchedFromYouTube: 0), но 2 YouTube API units потрачены на playlist metadata. `browseTrendVideos({ channelIds: [...], sort: "views" })` дал бы тот же результат за 0 units. Хинт в `listTrendChannels` ("use channelId to filter browseTrendVideos") проигнорирован.

**Фикс:** добавлен встречный хинт в `browseChannelVideos` description: "If the channel is already tracked in Trends (from listTrendChannels), use browseTrendVideos instead — same data, zero API cost."

**Также замечено:** commonTags содержит "love" кластер из 6 тегов с одинаковым весом 133.6 (вероятно Lorenza Amour) — канал с идентичными тегами на всех видео заполняет top-20. Log-scale предотвращает доминирование mega-hit, но не защищает от tag-спама через объём.

### Ещё не проверено в бою

| Сценарий | Почему важно |
| **Hidden video в top-5 aggregates** | Не попадёт ли скрытое видео в topByViews? |
| **Concurrent channels sync** | dataFreshness корректна при частичном sync? |
| **Very large window (±30 дней)** | Сотни видео — token budget, модель справится? |

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/getNicheSnapshot.ts` | Handler: date resolution, window, per-channel percentiles, aggregates |
| `functions/src/services/tools/utils/getHiddenVideoIds.ts` | Hidden video filter |
| `functions/src/services/tools/utils/resolveVideos.ts` | Own video resolution (fallback path) |
| `functions/src/services/tools/utils/resolveVideosByTitle.ts` | Title → videoId resolution (shared by viewThumbnails + getMultipleVideoDetails) |
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
| `functions/src/services/tools/handlers/__tests__/getMultipleVideoDetails.titles.test.ts` | 7 (title resolution from videos/, notFoundTitles, merge titles+videoIds, deduplication, defensive string input, error on empty input, no YouTube API for title-resolved) |
