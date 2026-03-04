# 🤖 AI Tool: analyzeSuggestedTraffic — Feature Doc

## Текущее состояние

**Реализовано (v2.3).** Gemini вызывает `analyzeSuggestedTraffic` в чате, передаёт `videoId` + `depth`, получает **per-video timeline по всем снапшотам** с pre-computed дельтами и transitions между периодами. **Self-channel detection**: тул определяет self-channel видео и вычисляет `selfChannelStats` с per-snapshot timeline. **Content trajectory**: per-snapshot `topKeywords` + `channelDistribution` + `topSharedTags` + `topVideos[10]` с `deltaImpressions` — фильм эволюции контента. Latest snapshot пропускает topVideos (покрыт `topSources`). LLM получает промпт для reconstruction algorithm journey.

**Ключевые принципы (Elite Senior Dev Lens):**
1. **Deterministic API** — `depth` enum вместо свободного числа
2. **Code = math, LLM = patterns** — handler считает дельты, self-channel stats, content trajectory; LLM интерпретирует
3. **Full trajectory** — ни один снапшот не выбрасывается, labels сохраняются
4. **No bias** — AVD передаётся как raw метрика без навязанной классификации
5. **No duplication** — latest snapshot topVideos не дублируют topSources

---

## Что это

Инструмент для AI-чата, позволяющий Gemini анализировать данные Suggested Traffic без ручного прикрепления CSV. Пользователь задаёт вопрос вида *"Какие видео YouTube рекомендует рядом с моим?"* — AI сама вызывает инструмент, получает структурированные данные и отвечает с инсайтами.

---

## User flow

Пользователь в чате спрашивает: *"Проведи глубокий анализ suggested traffic — почему мои видео показываются рядом с нерелевантным контентом?"*

Gemini понимает контекст, выбирает `depth: "detailed"` (топ 100) и вызывает инструмент автономно.

Пока инструмент работает, в UI появляется анимированный статус:
```
⟳ Загружаю CSV снапшоты...
⟳ Строю timeline по всем снапшотам...
⟳ Анализирую теги и ключевые слова...
```

Под tool pill:
```
📊 3 snapshots
📈 495 active sources (detailed analysis: top 100)
```

При ховере на pill — PortalTooltip с расшифровкой:
```
Timeline:
Jan 15 (24h after publish): 59 sources
Jan 22 (1 week): 498 sources (+439 new)
Feb 15 (1 month): 495 sources (+20 new, -23 dropped)
```

---

## Как собираются данные: шаг за шагом

### Шаг 1 — Firestore: metadata + source video

Из Firestore читается два документа:

**`traffic/main`** — список снапшотов:
```
snapshots: [
  { timestamp: 1706000000, storagePath: "users/.../snapshot_1.csv", label: "24h" },
  { timestamp: 1706300000, storagePath: "users/.../snapshot_2.csv", label: "1 week" },
]
```

**`videos/{videoId}`** — данные ролика автора (title, tags, description).

---

### Шаг 2 — Скачиваем все CSV параллельно

Каждый снапшот — CSV-файл в Cloud Storage. Все скачиваются одновременно. Если файл недоступен — возвращается пустая строка, обработка не падает.

---

### Шаг 3 — Парсим CSV

Парсер извлекает из `YT_RELATED.{videoId}` → videoId, читает метрики. CTR = `null` если impressions = 0.

Каждый снапшот → `VideoSnapshotEntry[]`:
```
[{ videoId, sourceTitle, views, impressions, ctr, avgViewDuration, watchTimeHours }]
```

---

### Шаг 4 — buildVideoTimeline()

Для каждого видео, которое было в **любом** снапшоте, строит timeline — значения в каждой точке + pre-computed delta от предыдущей точки:

```typescript
// Видео "Lofi beats" — было во всех 3 снапшотах:
timeline: [
    { date: "2026-01-15", label: "24h", views: 200,  impressions: 3000,  deltaViews: null },    // baseline
    { date: "2026-01-22", label: "1 week", views: 2800, impressions: 45000, deltaViews: +2600 },   // рост
    { date: "2026-02-15", label: "1 month", views: 5000, impressions: 80000, deltaViews: +2200 },   // замедление
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

### Шаг 7 — Content analysis (опционально)

Анализирует теги и ключевые слова для топ 30 видео из кэша Firestore:
- `sharedTags` — совпадающие теги с source video
- `topKeywordsInSuggestedTitles` — частые слова в заголовках → тематика окружения
- `channelDistribution` — какие каналы чаще появляются

---

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

---

## Параметры инструмента

| Параметр | Тип | Default | Описание |
|---|---|---|---|
| `videoId` | string | — | ID видео (required) |
| `depth` | enum | `"standard"` | `quick` (20) / `standard` (50) / `detailed` (100) / `deep` (500) |
| `minImpressions` | number | — | Фильтр по минимуму impressions |
| `minViews` | number | — | Фильтр по минимуму views |
| `includeContentAnalysis` | boolean | true | Включить анализ тегов и ключевых слов |

---

## Что возвращает

```typescript
{
    sourceVideo: { videoId, title, description, tags },
    snapshotTimeline: [{ date, label, totalSources }],
    topSources: [{
        videoId, sourceTitle,
        views, impressions, ctr, avgViewDuration, watchTimeHours,
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
            mostFrequentSharedTags,
            topKeywordsInSuggestedTitles,
            channelDistribution
        }
    },
    selfChannelStats?: {
        channelTitle, selfCount, totalEnriched, selfPercentage,
        selfImpressions, selfViews, selfTopVideos: [{ videoId, sourceTitle, impressions, views }],
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

---

## Pure утилиты (unit-tested)

| Файл | Экспорты | Тесты |
|---|---|---|
| `utils/csvParser.ts` | `parseSuggestedTrafficCsv` | 12 тестов |
| `utils/delta.ts` | `calculateSnapshotDeltas`, `findNewEntries`, `findDroppedEntries`, `buildVideoTimeline`, `getTransitions` | 17 тестов |
| `utils/suggestedAnalysis.ts` | `aggregateTopSources`, `analyzeContent`, `computeSelfChannelStats`, `computeContentTrajectory`, `tokenizeTitle`, `findSharedTags` | 46 тестов |

---

## Расположение файлов

```
functions/src/
  services/tools/
    handlers/analyzeSuggestedTraffic.ts   ← main handler
    utils/
      csvParser.ts                        ← RFC 4180 parser
      delta.ts                            ← timeline builder + transitions + snapshot diffing
      suggestedAnalysis.ts                ← aggregation + content analysis
      __tests__/
        csvParser.test.ts
        delta.test.ts
        suggestedAnalysis.test.ts
    definitions.ts                        ← tool declaration (depth enum)
    executor.ts                           ← tool routing

src/
  features/Chat/
    components/ToolCallSummary.tsx        ← AnalysisStats + PortalTooltip
    utils/toolCallGrouping.ts             ← getGroupLabel для analyzeSuggestedTraffic
```

---

## Связанные фичи

- [Suggested Traffic UI](./suggested-traffic.md) — откуда берутся CSV и данные enrichment
- [Chat](./chat/) — SSE streaming, tool call pipeline, ToolCallSummary UI

---

## ← YOU ARE HERE → v2.3: self-channel detection + content trajectory + per-snapshot topVideos

## Roadmap

### Stage 3 — Multi-snapshot comparison UI
**Бизнес-цель:** пользователь видит ротацию пула suggested видео визуально на странице Traffic, не только через AI.

- [ ] Визуализация transitions на Suggested Traffic page
- [ ] Timeline view для отдельного source видео

### Stage 3.5 — Self-channel matching по channelId
**Бизнес-цель:** устранить edge case с совпадающими названиями каналов.

> **Known limitation (v2.1):** `computeSelfChannelStats()` матчит по `channelTitle` (case-insensitive). Совпадение названий каналов — редкий кейс, но `channelId` (YouTube ID `UC...`) — deterministic и неизменен. Переход на `channelId` matching имеет смысл при расширении `EnrichedVideoData` (например, для competitive intelligence).

- [ ] Добавить `channelId` в `EnrichedVideoData`
- [ ] Читать `channelId` из `cached_suggested_traffic_videos` при enrichment
- [ ] Matching по `channelId` вместо `channelTitle` в `computeSelfChannelStats()`

### Stage 4 — Niche correlation
**Бизнес-цель:** связать suggested traffic с нишами пользователя, показать какие ниши приносят трафик.

- [ ] Передать niche assignments в handler
- [ ] Агрегат impressions/views по нишам

### Stage 5 — Market-ready
**Бизнес-цель:** полная автоматизация аналитики для YouTube-каналов.

- [ ] Scheduled analysis (автоматический отчёт при новом снапшоте)
- [ ] Cost: ~$0.05-0.10 per analysis (pre-computed JSON vs raw CSV tokens)
- [ ] API: Gemini 3.1 Pro by default, Cloud Functions 2nd Gen
- [ ] Storage: Firestore (metadata) + Cloud Storage (CSV bodies)
