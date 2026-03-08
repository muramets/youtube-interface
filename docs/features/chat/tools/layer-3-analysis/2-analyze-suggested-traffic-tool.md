# AI Tool: analyzeSuggestedTraffic — Feature Doc

## Текущее состояние

**Реализовано.** AI вызывает `analyzeSuggestedTraffic` в чате, передаёт `videoId` + `depth`, получает per-video timeline по всем снапшотам с дельтами и transitions между периодами. Определяет self-channel видео, вычисляет content trajectory (эволюция ключевых слов, каналов, тегов по снапшотам). Enrichment из `cached_external_videos` (tags, channelTitle). View delta enrichment: suggested видео обогащаются `viewDelta24h/7d/30d` из trend snapshots — LLM видит, растёт ли suggested video на YouTube в целом.

**Snapshot count denormalization:** `suggestedTrafficSnapshotCount` записывается на документ видео при каждом create/delete снэпшота и при входе в Traffic таб (lazy sync). `getMultipleVideoDetails` пробрасывает это поле для own-видео, а tool description указывает LLM проверять его перед вызовом.

**Ключевые принципы:**
1. **Deterministic API** — `depth` enum вместо свободного числа
2. **Code = math, LLM = patterns** — handler считает дельты и статистику; LLM интерпретирует паттерны
3. **Full trajectory** — ни один снапшот не выбрасывается, labels сохраняются

---

## Что это

Инструмент для AI-чата, позволяющий анализировать данные Suggested Traffic без ручного прикрепления CSV. Пользователь задаёт вопрос вида *"Какие видео YouTube рекомендует рядом с моим?"* — AI сама вызывает инструмент, получает структурированные данные и отвечает с инсайтами.

**Gateway-паттерн:** `analyzeTrafficSources` (aggregate) вызывается ПЕРВЫМ → если Suggested доминирует → `analyzeSuggestedTraffic` (per-video drill-down).

---

## User flow

Пользователь в чате спрашивает: *"Проведи глубокий анализ suggested traffic — почему мои видео показываются рядом с нерелевантным контентом?"*

AI понимает контекст, выбирает `depth: "detailed"` (топ 100) и вызывает инструмент автономно.

Пока инструмент работает, в UI появляется анимированный статус:
```
Analyzing suggested traffic...
```

Под tool pill:
```
3 snapshots | 495 active sources (detailed analysis: top 100)
```

При ховере на pill — PortalTooltip с расшифровкой timeline.

---

## Как собираются данные: шаг за шагом

### Шаг 1 — Метаданные

Видео резолвится через `resolveVideosByIds` (direct lookup + reverse lookup по `publishedVideoId` для custom videos). Из резолвера берётся `docId` для доступа к подколлекциям. Читаются метаданные снапшотов (список загруженных CSV с датами и labels) и данные исходного видео (title, tags, description, channelTitle).

### Шаг 2 — CSV скачиваются параллельно

Каждый снапшот — CSV-файл в Cloud Storage. Все скачиваются одновременно. Если файл недоступен — возвращается пустая строка, обработка не падает.

### Шаг 3 — Парсинг

Парсер извлекает videoId из формата `YT_RELATED.{videoId}`, читает метрики (views, impressions, CTR, AVD, watch time). CTR = `null` если impressions = 0. Фильтруется только `sourceType === "Content"`.

### Шаг 4 — Per-video Timeline

Для каждого видео, которое было в **любом** снапшоте, строит timeline — значения в каждой точке + pre-computed delta от предыдущей точки:

```typescript
// Видео "Lofi beats" — было во всех 3 снапшотах:
timeline: [
    { date: "2026-01-15", label: "24h", views: 200,  impressions: 3000,  deltaViews: null },
    { date: "2026-01-22", label: "1 week", views: 2800, impressions: 45000, deltaViews: +2600 },
    { date: "2026-02-15", label: "1 month", views: 5000, impressions: 80000, deltaViews: +2200 },
]
```

**Если видео пропущено в среднем снапшоте** — timeline содержит только точки присутствия (2 вместо 3). Delta считается от предыдущей реальной точки.

---

### Шаг 5 — Сортировка и отсечение

Все видео сортируются по **impressions** (descending) из последнего снапшота. Берётся топ N (зависит от `depth`):

| depth | limit | use case |
|-------|-------|----------|
| `quick` | 20 | Быстрый обзор |
| `standard` | 50 | Обычный анализ (default) |
| `detailed` | 100 | Углублённый анализ |
| `deep` | 500 | Полное исследование |

Остальные сворачиваются в `tail` (count + totals).

### Шаг 5b — View Delta Enrichment

Для каждого видео из topSources добавляется **YouTube-wide view growth** — насколько это видео растёт на YouTube в целом (не только в контексте suggested traffic):

1. Читает `channelId` из `cached_external_videos` (если видео было кэшировано ранее)
2. Вызывает `getViewDeltas()` из `trendSnapshotService` — использует `calculateViewDeltas()` из `shared/viewDeltas.ts`
3. Добавляет к каждому topSource: `viewDelta24h`, `viewDelta7d`, `viewDelta30d`
4. Null = нет trend data для канала этого видео (принятый trade-off)

**Зачем:** Видео, которое даёт impressions моему видео И одновременно быстро растёт (`viewDelta24h` высокий) — сигнал сильной алгоритмической ассоциации. YouTube активно продвигает оба видео вместе. Стагнирующий source (`viewDelta ≈ 0`) — более стабильная, но менее динамичная связь.

Graceful degradation: если `getViewDeltas()` падает — handler продолжает работу, все viewDelta остаются null.

Подробнее: [Video View Deltas](../../../video-view-deltas.md)

---

### Шаг 6 — getTransitions()

Для каждой пары последовательных снапшотов считает:
- `newCount` / `droppedCount` — масштаб ротации пула
- `topNew` / `topDropped` — топ 10 примеров по impressions

```typescript
transitions: [
    { periodFromDate: "2026-01-15", periodToDate: "2026-01-22",
      newCount: 439, droppedCount: 0, topNew: [...], topDropped: [] },
    { periodFromDate: "2026-01-22", periodToDate: "2026-02-15",
      newCount: 20, droppedCount: 23, topNew: [...], topDropped: [...] },
]
```

---

### Шаг 7 — Content analysis (опционально, `includeContentAnalysis`)

#### 7a — Enrichment из Firestore

Читает enrichment данные из `cached_external_videos` (tags, channelTitle) для:
- Топ 30 видео (content analysis)
- ВСЕ видео из всех снапшотов (self-channel + trajectory) — batch по 500

#### 7b — analyzeContent()

Анализирует теги и ключевые слова для топ видео:
- `sharedTags` — совпадающие теги с source video (case-insensitive)
- `topKeywordsInSuggestedTitles` — частые слова в заголовках (Unicode-aware tokenizer, stop-word filter)
- `channelDistribution` — какие каналы чаще появляются

#### 7c — computeSelfChannelStats()

Определяет, сколько suggested traffic приходит от собственного канала пользователя:
- Matching по `channelTitle` (case-insensitive)
- selfPercentage + timeline по снапшотам
- Interpretation guide в `analysisGuidance`: >60% = ecosystem boost, 30-60% = hybrid, <30% = external discovery

#### 7d — computeContentTrajectory()

Per-snapshot эволюция контента:
- topKeywords, topSharedTags, channelDistribution — для каждого снапшота
- topVideos (top 10 по impressions) с deltaImpressions — для всех кроме latest (latest покрыт topSources)
- tailImpressions — размер long tail

---

## Параметры инструмента

| Параметр | Тип | Default | Описание |
|---|---|---|---|
| `videoId` | string | — | ID видео (required) |
| `depth` | enum | `"standard"` | `quick` (20) / `standard` (50) / `detailed` (100) / `deep` (500) |
| `minImpressions` | number | — | Фильтр по минимуму impressions |
| `minViews` | number | — | Фильтр по минимуму views |
| `includeContentAnalysis` | boolean | true | Включить анализ тегов, ключевых слов, self-channel, trajectory |

---

## Что возвращает

```typescript
{
    sourceVideo: { videoId, title, description, tags, channelTitle },
    snapshotTimeline: [{ date, label, totalSources }],
    topSources: [{
        videoId, sourceTitle,
        views, impressions, ctr, avgViewDuration, watchTimeHours,
        viewDelta24h: number | null,   // YouTube-wide view growth (from trend snapshots)
        viewDelta7d: number | null,
        viewDelta30d: number | null,
        timeline: [
            { date, label, views, impressions, ctr, avgViewDuration, watchTimeHours,
              deltaViews: null, deltaImpressions: null },
            { date, label, views, impressions, ctr, avgViewDuration, watchTimeHours,
              deltaViews, deltaImpressions },
        ]
    }],
    transitions: [{
        periodFromDate, periodFromLabel, periodToDate, periodToLabel,
        newCount, droppedCount,
        topNew: VideoSnapshotEntry[],
        topDropped: VideoSnapshotEntry[]
    }],
    tail: { count, totalViews, totalImpressions },
    contentAnalysis?: {
        perVideoOverlap: [{ videoId, sourceTitle, sharedTags, sharedKeywords }],
        aggregate: {
            mostFrequentSharedTags: [{ tag, count }],
            topKeywordsInSuggestedTitles: [{ keyword, count }],
            channelDistribution: [{ channelTitle, count }]
        }
    },
    selfChannelStats?: {
        channelTitle, selfCount, totalEnriched, selfPercentage,
        selfImpressions, selfViews,
        selfTopVideos: [{ videoId, sourceTitle, impressions, views }],
        timeline: [{ date, label, selfCount, totalEnriched, selfPercentage, selfImpressions }]
    },
    contentTrajectory?: [{
        date, label, totalSources, totalImpressions, isLatest,
        topKeywords: [{ keyword, count }],
        topSharedTags: [{ tag, count }],
        channelDistribution: [{ channelTitle, count }],
        topVideos: [{ videoId, sourceTitle, impressions, views, ctr, avgViewDuration, deltaImpressions }],
        tailImpressions
    }],
    analysisGuidance: string
}
```

### Что получает LLM

| Вопрос | Ответ в JSON |
|---|---|
| Кто чаще всего рядом? | `topSources` — топ N по impressions с полным timeline |
| Как менялась динамика? | `timeline[]` — trajectory каждого видео по всем снапшотам |
| Как менялся пул? | `transitions` — newCount/droppedCount + примеры за каждый период |
| По каким тегам ставят? | `contentAnalysis.mostFrequentSharedTags` |
| Какие каналы-конкуренты? | `contentAnalysis.channelDistribution` |
| Тематика окружения? | `contentAnalysis.topKeywordsInSuggestedTitles` |
| Как алгоритм пришёл сюда? | `contentTrajectory` — per-snapshot keywords + channels + top videos + deltas |
| Сколько трафика от моего канала? | `selfChannelStats` — selfPercentage + timeline |
| Когда начался ecosystem boost? | `selfChannelStats.timeline` — inflection point |
| Растёт ли source видео на YouTube? | `topSources[].viewDelta24h/7d/30d` — YouTube-wide view growth |

---

## Known Issues

### 1. Теги из описаний не анализируются
`findSharedTags()` сравнивает только явные YouTube-теги (`tags[]` из `cached_external_videos`). Если создатель вшивает теги/хештеги в description (распространённая SEO-практика на YouTube), они полностью игнорируются при content analysis. Это значит, что `sharedTags` и `mostFrequentSharedTags` дают неполную картину тематического пересечения.

**Решение:** парсить description на хештеги (#tag) и ключевые слова, включать их в анализ наравне с явными тегами.

### 2. Tool не передаёт вручную размеченные данные (viewer type, traffic type)
В Suggested Traffic таблице пользователь может вручную (или через smart assistant) проставить для каждого suggested видео: viewer type (new/returning) и traffic type. Эти данные хранятся в Firestore, но `analyzeSuggestedTraffic` handler их не читает и не включает в response.

LLM анализирует "слепо" — не знает, какой тип зрителя и трафика стоит за каждым suggested видео.

**Важно:** эти данные — субъективная оценка пользователя, не объективная метрика YouTube. Tool должен явно маркировать их как `userAnnotation` / `subjective`, чтобы LLM учитывал это при интерпретации.

### 3. Tool не передаёт пользовательские ниши suggested видео
Пользователь может вручную проставить принадлежность к нише для каждого suggested видео в Suggested Traffic таблице. Эти данные уже хранятся в Firestore, но handler их не читает.

Это связано со Stage 3 (Niche correlation) в Roadmap, но отличается: Stage 3 предполагает передачу ниш **пользователя** (его канала) в handler. Здесь речь о нишах, проставленных **на suggested видео** — субъективная классификация того, к какой нише относится каждое рекомендуемое видео.

**Важно:** как и viewer type / traffic type — это субъективная оценка пользователя (`userAnnotation`).

---

## Roadmap

### Stage 1 — Multi-snapshot comparison UI ← YOU ARE HERE
**Бизнес-цель:** пользователь видит ротацию пула suggested видео визуально на странице Traffic, не только через AI.

- [ ] Визуализация transitions на Suggested Traffic page
- [ ] Timeline view для отдельного source видео

### Stage 2 — Self-channel matching по channelId
**Бизнес-цель:** устранить edge case с совпадающими названиями каналов.

> **Known limitation:** `computeSelfChannelStats()` матчит по `channelTitle` (case-insensitive). `channelId` (YouTube ID `UC...`) уже есть в `cached_external_videos`, но `EnrichedVideoData` interface на бэкенде читает только `{ videoId, tags, channelTitle }`. Нужно добавить `channelId` в интерфейс и переключить matching.

- [ ] Расширить `EnrichedVideoData` на `channelId` (читать из `cached_external_videos`)
- [ ] Matching по `channelId` вместо `channelTitle` в `computeSelfChannelStats()`

### Stage 3 — Niche correlation
**Бизнес-цель:** связать suggested traffic с нишами пользователя, показать какие ниши приносят трафик.

- [ ] Передать niche assignments в handler
- [ ] Агрегат impressions/views по нишам

### Stage 4 — Market-ready
**Бизнес-цель:** полная автоматизация аналитики для YouTube-каналов.

- [ ] Scheduled analysis (автоматический отчёт при новом снапшоте)
- [ ] Cost: ~$0.05-0.10 per analysis (pre-computed JSON vs raw CSV tokens)

---

## Связанные фичи
- [Suggested Traffic UI](../../../video-details/suggested-traffic/) — откуда берутся CSV и данные enrichment
- [Traffic Sources Tool](../../../video-details/traffic-sources.md) — gateway tool (`analyzeTrafficSources`) вызывается перед drill-down
- [Telescope Pattern Overview](../README.md) — архитектура tool chain
- Chat — SSE streaming, tool call pipeline, ToolCallSummary UI

---

## Technical Implementation

### Backend
| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/analyzeSuggestedTraffic.ts` | Main handler: resolveVideosByIds → Cloud Storage → parse → timelines → content → JSON |
| `functions/src/services/tools/utils/resolveVideos.ts` | Shared video resolution (direct + publishedVideoId lookup) |
| `functions/src/services/tools/utils/csvParser.ts` | Server-side CSV parser (RFC 4180, `YT_RELATED.{id}`, Total row, `sourceType` filter) |
| `functions/src/services/tools/utils/delta.ts` | `buildVideoTimeline`, `getTransitions`, `calculateSnapshotDeltas`, `findNewEntries`, `findDroppedEntries` |
| `functions/src/services/tools/utils/suggestedAnalysis.ts` | `analyzeContent`, `computeSelfChannelStats`, `computeContentTrajectory`, `aggregateTopSources`, `tokenizeTitle`, `findSharedTags` |
| `functions/src/services/trendSnapshotService.ts` | View delta enrichment: admin SDK → `calculateViewDeltas()` from `shared/viewDeltas.ts` |
| `functions/src/services/tools/definitions.ts` | Tool declaration (depth enum, parameter descriptions) |
| `functions/src/services/tools/executor.ts` | Tool routing: `ANALYZE_SUGGESTED_TRAFFIC` → handler |

### Frontend (Chat UI)
| Файл | Назначение |
|------|-----------|
| `features/Chat/components/ToolCallSummary.tsx` | AnalysisStats + PortalTooltip для pill |
| `features/Chat/components/ToolCallBadge.tsx` | Pending/resolved labels |
| `features/Chat/utils/toolCallGrouping.ts` | `getGroupLabel` + auto-expand logic |
| `features/Chat/ChatMessageList.tsx` | Dynamic video discovery from tool results |

### Data paths
```
Firestore:  users/{uid}/channels/{channelId}/videos/{videoId}/traffic/main → snapshots[]
            users/{uid}/channels/{channelId}/videos/{videoId} → source video
            users/{uid}/channels/{channelId}/cached_external_videos/{id} → enrichment
            users/{uid}/channels/{channelId}/trendChannels/{tcId}/snapshots/{id} → view delta source
Storage:    storagePath from each snapshot entry → CSV body
```

### Tests
| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/utils/__tests__/csvParser.test.ts` | 12 (RFC 4180, Total row, edge cases) |
| `functions/src/services/tools/utils/__tests__/delta.test.ts` | 17 (timelines, transitions, new/dropped, gaps) |
| `functions/src/services/tools/utils/__tests__/suggestedAnalysis.test.ts` | 46 (content analysis, self-channel, trajectory, tokenizer, stop-words) |
| `functions/src/services/tools/handlers/__tests__/analyzeSuggestedTraffic.viewDeltas.test.ts` | 3 (view delta enrichment: populated, null, failure graceful) |
