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

Инструмент для AI-чата, позволяющий анализировать данные Suggested Traffic без ручного прикрепления CSV. Пользователь задаёт вопрос вида *"Рядом с какими видео YouTube показывает моё?"* — AI сама вызывает инструмент, получает структурированные данные и отвечает с инсайтами.

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

Подробнее: [Video View Deltas](../../../trends/video-view-deltas.md)

---

### Шаг 6 — getTransitions()

Для каждой пары последовательных снапшотов считает:
- `newCount` / `droppedCount` — масштаб ротации пула
- `returningCount` — сколько из "new" видео уже встречались в ЛЮБОМ предыдущем снапшоте (были, исчезли, вернулись). Высокий `returningCount/newCount` = YouTube повторно тестирует тот же пул; низкий = нашёл новый контент.
- `topNew` / `topDropped` — топ 10 примеров по impressions

```typescript
transitions: [
    { periodFromDate: "2026-01-15", periodToDate: "2026-01-22",
      newCount: 439, droppedCount: 0, returningCount: 0, topNew: [...], topDropped: [] },
    { periodFromDate: "2026-01-22", periodToDate: "2026-02-15",
      newCount: 20, droppedCount: 23, returningCount: 15, topNew: [...], topDropped: [...] },
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
        newCount, droppedCount, returningCount,
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
| Как менялся пул? | `transitions` — newCount/droppedCount/returningCount + примеры за каждый период |
| YouTube тестирует новый контент или старый? | `transitions[].returningCount` — сколько "new" видео уже были раньше (drop→reappear) |
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

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### Масштаб данных

Этот тул возвращает значительно больше данных, чем `analyzeTrafficSources`. При 9 снэпшотах и `depth: "standard"` (top 50):

| Секция | Объём |
|--------|-------|
| `topSources` | 50 видео × 9 timeline points × 10 полей |
| `transitions` | 8 пар × (counts + topNew[10] + topDropped[10]) |
| `contentAnalysis` | perVideoOverlap[30] + aggregate (tags, keywords, channels) |
| `selfChannelStats` | stats + timeline[9] |
| `contentTrajectory` | 9 снэпшотов × (keywords + tags + channels + topVideos[10]) |
| `analysisGuidance` | текстовая строка |

**Оценка: 30,000–50,000+ символов JSON ≈ 10,000–16,000 токенов.** Это 2-3× больше, чем `analyzeTrafficSources` (5.8K). Может занять 50-70% context window при Haiku (200K). При `depth: "deep"` (500 видео) — потенциально выход за бюджет.

#### Реальный замер (trace 2026-03-13, 8 снэпшотов, depth: standard, 44 видео в topSources)

Общий toolResult: **~34.8K токенов** (оба тула: `analyzeTrafficSources` ~5K + `analyzeSuggestedTraffic` ~30K).

Примерная разбивка `analyzeSuggestedTraffic` ответа:

| Секция | Оценка токенов | Использована моделью? |
|--------|---------------|----------------------|
| `topSources` (44 видео × 8 timeline points) | ~12K | Частично (3 из 44) |
| `contentTrajectory` (8 снэпшотов) | ~10K | Не использована |
| `transitions` (7 пар) | ~3K | Да (pool explosion) |
| `contentAnalysis` (aggregate + perVideoOverlap) | ~2K | Частично (keywords) |
| `analysisGuidance` | ~2K | Частично |
| `selfChannelStats` + timeline | ~1.5K | Полностью |
| `snapshotTimeline` + `tail` + `sourceVideo` | ~1K | Да |

**Вывод:** ~20K токенов (~65%) ушло на `topSources` + `contentTrajectory`, которые модель использовала минимально. Потенциал оптимизации — 30-40% без потери качества анализа (дедупликация идентичных contentTrajectory снэпшотов, сжатие single-point timelines, убрать topVideos из trajectory т.к. дублирует topSources).

### План проверки

| # | Сценарий | Что проверяет | Промпт-идея | Проверено |
|---|----------|---------------|-------------|-----------|
| 1 | **Happy path (standard)** | Базовый вызов: topSources, transitions, content analysis | "Рядом с какими видео YouTube показывает мой [X]?" | ✅ via #2 |
| 2 | **Gateway chain** | analyzeTrafficSources → Suggested доминирует → analyzeSuggestedTraffic | "Разбери трафик [X] и покажи откуда идут рекомендации" | ✅ |
| 3 | **Depth selection** | Выбирает ли модель правильный depth для вопроса | "Проведи глубокий анализ suggested traffic" vs "Быстрый обзор рекомендаций" | — |
| 4 | **No data (snapshotCount = 0)** | Проверяет ли модель suggestedTrafficSnapshotCount | "Проанализируй suggested traffic для [видео без CSV]" | — |
| 5 | **Transitions interpretation** | Видит ли модель ротацию пула (newCount, droppedCount) | "Как менялось окружение моего видео?" | ✅ partial |
| 6 | **Self-channel stats** | Интерпретирует ли модель ecosystem boost vs external discovery | "Сколько трафика приходит от моего же канала?" | ✅ |
| 7 | **Content trajectory** | Видит ли модель эволюцию ключевых слов/каналов по снэпшотам | "Как менялась тематика рекомендаций со временем?" | — |
| 8 | **View deltas usage** | Использует ли модель viewDelta24h/7d/30d для оценки source health | "Какие из источников suggested traffic сейчас растут на YouTube?" | ✅ |
| 9 | **mentionVideo calls** | Вызывает ли модель mentionVideo для видео из topSources | (покрывается любым trace) | ✅ |
| 10 | **Token budget** | Помещается ли tool result в context window при разных depth | (покрывается traces #1 и #3) | ✅ standard |
| 11 | **Long tail (tail field)** | Упоминает ли модель truncated sources | (покрывается trace #1) | ✅ not used |

### Ключевые вопросы

1. **Token budget при standard depth** — ✅ Ответ: 34.8K tokens (оба тула), 22% context window Haiku. Укладывается с большим запасом.
2. **Depth auto-selection** — Не проверено. В trace #1 промпт не указывал depth, модель выбрала `standard` (default). Нужен тест #3 с "глубокий анализ" vs "быстрый обзор".
3. **Transitions vs timeline** — ✅ Частично. Модель использовала transitions (pool explosion) и per-video timeline (vmG6iKpqq1I), но не синтезировала оба в единый нарратив. Пропустила второй взрыв пула.
4. **Self-channel interpretation** — ✅ Модель прочитала guidance, использовала пороги (13% = External Discovery), timeline inflection points. Работает.
5. **mentionVideo incentive** — ✅ Haiku вызвал mentionVideo для 3 ключевых видео. Стабильнее, чем в getNicheSnapshot traces.
6. **viewDelta enrichment** — ✅ Null значения не вызвали confusion. Модель использовала viewDelta только для видео с данными (vmG6iKpqq1I), остальные проигнорировала корректно.

### Проверено в бою

<details>
<summary><b>Trace #1 — Gateway chain (2026-03-13, Haiku 4.5)</b></summary>

**Промпт:** "Разбери трафик прикрепленного видео и если suggested traffic значительный — покажи детали"
**Видео:** "this spring playlist will find you at the right time" (8 снэпшотов, slow life mode)
**Модель:** claude-haiku-4-5 | **Cost:** $0.067 | **Context:** 22% of 200K
**Покрывает тесты:** #2, #5, #6, #8, #9, #10, #11

| Тест | Результат | Детали |
|------|-----------|--------|
| #2 Gateway chain | **PASS** | `analyzeTrafficSources` → Suggested 36% → автоматически вызвала `analyzeSuggestedTraffic(depth: "standard")` |
| Числовая точность | **PASS** | Все числа (views, impressions, CTR, %, viewDeltas) совпадают с данными |
| #5 Transitions | **PARTIAL** | Заметила взрыв 46→495 и ретракцию →47, но пропустила второй взрыв 47→491 на 2 weeks |
| #6 Self-channel | **PASS** | selfPercentage 13%, timeline inflection points, "External Discovery" — верно |
| #8 View deltas | **PASS** | vmG6iKpqq1I (+14,549/7d, +130,396/30d) отмечен как "exploding". Null не путает |
| #9 mentionVideo | **PASS** | `mention://` ссылки для 3 ключевых topSources |
| #10 Token budget | **PASS** | 34.8K toolResults, 22% context window — с запасом |
| #11 Tail | **NOT USED** | tail (707 видео, 764 impr) не упомянут |
| Direction | **FAIL** | "YouTube tested putting that hot video next to yours" — направление перепутано |
| Thumbnail | **FAIL (partial)** | Видела обложку user через context image, но сравнила с воображаемыми конкурентами без `viewThumbnails` |
| #7 Trajectory | **NOT USED** | ~10K токенов contentTrajectory полностью проигнорированы |

**Fixes applied:** DIRECTION block в `analysisGuidance`, multi-wave hint в transitions, viewThumbnails guidance уточнён.

**Нерассмотренные сценарии:** #1 (happy path без gateway), #3 (depth selection), #4 (no data).

</details>

### Связь с analyzeTrafficSources battle test

Из [analyzeTrafficSources trace #2](./1-analyze-traffic-sources-tool.md): Browse features (63%) > Suggested videos (29%). Модель написала рекомендацию "углубитесь в Suggested traffic" — но НЕ вызвала `analyzeSuggestedTraffic` сама. В trace #1 (выше) при соотношении Browse 45% / Suggested 36% модель **вызвала drill-down автоматически**. Разница: промпт trace #1 явно просил "если suggested traffic значительный — покажи детали", а trace #2 analyzeTrafficSources не содержал такой инструкции. **Вывод:** gateway chain работает при явном conditional в промпте, но модель не инициирует drill-down сама при меньшей доле Suggested.

### Потенциальные architectural gaps

- **Token budget при `deep` (500 видео)** — 500 × 9 timeline points может превысить context window. Возможно нужен серверный лимит или предупреждение
- **contentTrajectory token waste** — ~10K токенов (~30% ответа) полностью проигнорированы в trace #1. Дедупликация идентичных снэпшотов (24h≡48h) и удаление topVideos (дублирует topSources) сэкономят 30-40% без потери качества
- **Нет share % в topSources** — модель сама посчитала % от total (верно), но было бы чище pre-compute
- **Direction confusion** — исправлено в guidance, требует повторного тестирования

---

## Technical Implementation

### Backend
| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/analysis/analyzeSuggestedTraffic.ts` | Main handler: resolveVideosByIds → Cloud Storage → parse → timelines → content → JSON |
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
| `functions/src/services/tools/handlers/analysis/__tests__/analyzeSuggestedTraffic.viewDeltas.test.ts` | 3 (view delta enrichment: populated, null, failure graceful) |
