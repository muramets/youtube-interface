# 🤖 AI Tool: analyzeSuggestedTraffic — Feature Doc

## Текущее состояние

**Реализовано.** Gemini может самостоятельно вызвать инструмент `analyzeSuggestedTraffic` в ходе чата, передать `videoId`, получить структурированный аналитический отчёт по Suggested Traffic и интерпретировать его стратегически.

**Ключевой принцип:** весь расчёт — на сервере (детерминированный код), Gemini только интерпретирует. AI не оценивает цифры, не занимается арифметикой.

---

## Что это

Инструмент для AI-чата, позволяющий Gemini анализировать данные Suggested Traffic без ручного прикрепления CSV. Пользователь задаёт вопрос вида *"Какие видео YouTube рекомендует рядом с моим?"* — AI сама вызывает инструмент, получает структурированные данные и отвечает с инсайтами.

---

## User flow

Пользователь в чате спрашивает: *"Какие видео конкурентов YouTube ставит рядом с моим роликом? Что изменилось за последнюю неделю?"*

Gemini понимает, что нужны данные, и вызывает инструмент автономно — пользователь ничего не прикрепляет вручную.

Пока инструмент работает, в UI появляется анимированный статус:
```
⟳ Загружаю CSV снапшоты...
⟳ Считаю дельту между снапшотами...
⟳ Анализирую теги и ключевые слова...
```

Затем Gemini отвечает — с конкретными цифрами, названиями видео и стратегическими выводами.

---

## Как собираются данные: шаг за шагом

### Шаг 1 — Что вообще есть в базе?

Из Firestore читается два документа:

**`trafficData/main`** — список снапшотов:
```
snapshots: [
  { timestamp: 1706000000, storagePath: "users/.../snapshot_1.csv", label: "13 hours" },
  { timestamp: 1706300000, storagePath: "users/.../snapshot_2.csv", label: "3 days" },
]
```

**`videos/{videoId}`** — данные самого ролика автора:
```
{ title: "Peaceful Morning Lofi", tags: ["lofi", "study", "chill"], description: "..." }
```

Теги source video нужны для сравнения с тегами suggested видео на шаге 6.

---

### Шаг 2 — Скачиваем все CSV параллельно

Каждый снапшот — это CSV-файл в Cloud Storage. Все скачиваются одновременно. Если файл недоступен — возвращается пустая строка, обработка не падает.

---

### Шаг 3 — Парсим CSV

Один снапшот — один CSV. Пример строки:
```
YT_RELATED.dQw4w9WgXcQ,"Never Gonna Give You Up - Official",5000,10000,2.5,0:04:32,833
```

Парсер извлекает из `YT_RELATED.dQw4w9WgXcQ` → `videoId = "dQw4w9WgXcQ"`, читает метрики. CTR выставляется в `null` если impressions = 0 (YouTube не считает CTR без показов).

На выходе каждый снапшот = массив `SuggestedVideoRow[]`:
```
[
  { videoId, sourceTitle, views, impressions, ctr, avgViewDuration, watchTimeHours },
  ...
]
```

---

### Шаг 4 — Считаем дельту между снапшотами

Сравниваем **последний** снапшот с **предпоследним**. Видео, которое есть в обоих — получает дельту. Видео только в одном — идёт в `newEntries` или `droppedEntries`.

```
snapshot_2: { "dQw4w9WgXcQ": views=8000, impressions=15000 }
snapshot_1: { "dQw4w9WgXcQ": views=3000, impressions=10000 }

→ deltaViews = +5000 (+167%)
→ deltaImpressions = +5000 (+50%)
```

Процент изменения округляется до 1 знака. Если в предыдущем снапшоте было 0 — процент = `null` (деление на ноль недопустимо).

---

### Шаг 5 — Агрегируем топ-источники

Из последнего снапшота берём топ N видео по выбранному критерию (`views`, `impressions`, `deltaViews`, `deltaImpressions`). Остальные сворачиваются в `tail` — агрегированная сводка по хвосту.

Каждый TopSource содержит:
- метрики из CSV (views, impressions, ctr, avgViewDuration, watchTimeHours)
- дельту, если есть второй снапшот (deltaViews, deltaImpressions, pctViews, pctImpressions)

`biggestChanges` — отдельный список из топ 10 видео по абсолютному изменению (и рост, и падение).

---

### Шаг 6 — Обогащаем данные из кэша

CSV содержит только метрики и title. Для анализа содержания нужны **теги** и **channelTitle** suggested видео.

Они уже есть в Firestore — были сохранены при загрузке CSV (YouTube API enrichment). Читаем батчем (до 30 видео из топа):

```
cached_suggested_traffic_videos/{videoId}:
  { tags: ["lofi", "study", "piano"], channelTitle: "ChillBeats Studio" }
```

Если видео нет в кэше — оно не ломает анализ, просто `sharedTags = []`.

---

### Шаг 7 — Анализируем контентное пересечение

Для каждого suggested видео из топа считаем:

**Shared tags** — какие теги совпадают с тегами source video (кейс-нечувствительно):
```
source video tags: ["lofi", "peaceful", "relax"]
suggested video tags: ["lofi", "chill", "morning"]
→ sharedTags: ["lofi"]
```

**Shared keywords** — какие слова из title suggested видео встречаются в title source video (токенизация, stop words убраны):
```
source title: "peaceful morning lofi playlist"
suggested title: "peaceful lofi study music"
→ sharedKeywords: ["peaceful", "lofi"]
```

**Агрегаты:**
- `mostFrequentSharedTags` — какие теги source video чаще всего совпадают с suggested → понять, по каким тегам YouTube тебя ставит
- `topKeywordsInSuggestedTitles` — самые частые слова во всех title suggested видео → понять нишу/тематику окружения
- `channelDistribution` — какие каналы встречаются чаще всего → понять конкурентное окружение

---

### Что получает Gemini

Все предыдущие шаги сворачиваются в структурированный JSON. Gemini получает **готовые ответы**, а не сырые данные:

| Вопрос | Ответ в JSON |
|---|---|
| Кто чаще всего появляется рядом? | `topSources` — топ N по views/impressions |
| Что изменилось? | `biggestChanges` — абсолютные муверы с % |
| Кто появился впервые? | `newEntries` — новые видео в последнем снапшоте |
| Кто исчез? | `droppedEntries` — были, больше нет |
| По каким тегам YouTube меня ставит? | `mostFrequentSharedTags` |
| Какие каналы-конкуренты? | `channelDistribution` |
| Какова тематика рядом стоящих видео? | `topKeywordsInSuggestedTitles` |
| История снапшотов | `snapshotTimeline` |

Gemini **не пересчитывает** — только интерпретирует. `analysisGuidance` в ответе явно это предписывает.

---

## Архитектура

```
Chat UI
  └─ SSE stream ←──────────────────────────────── Cloud Function: aiChat
                                                       │
                                          streamChat (Gemini loop)
                                                       │
                                            Gemini вызывает tool
                                                       │
                                          executeTool → handler
                                                       │
                               ┌───────────────────────┴────────────────────────┐
                               │         analyzeSuggestedTraffic handler          │
                               │                                                  │
                               │  1. Firestore: snapshot metadata + source video  │
                               │  2. Cloud Storage: parallel CSV download         │
                               │  3. csvParser: pure parse → SuggestedVideoRow[]  │
                               │  4. delta: calculateSnapshotDeltas               │
                               │  5. suggestedAnalysis: aggregateTopSources       │
                               │                        findBiggestChanges        │
                               │  6. Firestore: cached_suggested_traffic_videos   │
                               │     (tags, channelTitle для content analysis)    │
                               │  7. analyzeContent: shared tags, keywords        │
                               └───────────────────────┬────────────────────────┘
                                                       │
                                          Structured JSON → Gemini
                                                       │
                                         SSE: toolProgress events
                                         SSE: final text response
```

---

## Параметры инструмента

| Параметр | Тип | Default | Описание |
|---|---|---|---|
| `videoId` | string | — | ID видео (required) |
| `limit` | number | 20 | Топ N источников (max 500) |
| `sortBy` | enum | `"views"` | `views` / `impressions` / `deltaViews` / `deltaImpressions` |
| `minImpressions` | number | — | Фильтр по минимуму impressions |
| `minViews` | number | — | Фильтр по минимуму views |
| `includeContentAnalysis` | boolean | true | Включить анализ тегов и ключевых слов |

**Валидация `videoId`:** проверяется тип + regex `^[\w-]{1,64}$` (защита от path traversal).

**Fallback:** если `sortBy` = `deltaViews`/`deltaImpressions`, но снапшот только один — автоматически падает до `"views"`.

---

## Что возвращает

```typescript
{
  sourceVideo: {
    videoId, title, description, tags
  },
  snapshotTimeline: [
    { date, label, totalSources }  // все снапшоты по порядку
  ],
  topSources: TopSource[],       // топ N по sortBy, с delta если есть
  biggestChanges: BiggestChanger[], // топ 10 абсолютных муверов (|deltaViews| desc)
  newEntries: [                   // появились в последнем снапшоте (max 20)
    { videoId, title, views, impressions }
  ],
  droppedEntries: [               // были, исчезли из последнего снапшота (max 20)
    { videoId, title, lastViews }
  ],
  tail: {                         // агрегат строк за пределами topN
    count, totalImpressions, totalViews, avgCtr
  },
  contentAnalysis?: {             // если includeContentAnalysis=true
    perVideoOverlap: [
      { videoId, sourceTitle, sharedTags, sharedKeywords }
    ],
    aggregate: {
      mostFrequentSharedTags,       // теги, совпадающие с source video
      topKeywordsInSuggestedTitles, // частые слова в title'ах suggested видео
      channelDistribution           // какие каналы чаще всего появляются
    }
  },
  analysisGuidance: string        // инструкция для Gemini (не показывается пользователю)
}
```

---

## Pure утилиты (unit-tested)

Вся бизнес-логика вынесена в чистые функции без side effects:

| Файл | Экспорты | Тесты |
|---|---|---|
| `utils/csvParser.ts` | `parseSuggestedTrafficCsv` | `__tests__/csvParser.test.ts` (12 тестов) |
| `utils/delta.ts` | `calculateSnapshotDeltas`, `findNewEntries`, `findDroppedEntries` | `__tests__/delta.test.ts` (12 тестов) |
| `utils/suggestedAnalysis.ts` | `aggregateTopSources`, `findBiggestChanges`, `analyzeContent`, `tokenizeTitle`, `findSharedTags` | `__tests__/suggestedAnalysis.test.ts` (20+ тестов) |

**CSV формат:** `YT_RELATED.{videoId}` как Source, RFC 4180 (quoted commas), CTR = `null` когда impressions = 0.

**Keyword tokenization:** Unicode-aware (`\p{L}\p{N}`), ~60 stop words (EN), min длина 3 символа.

---

## SSE: toolProgress events

Во время работы инструмент эмитит промежуточные прогресс-события через SSE:

```
"Загружаю CSV снапшоты..."    ← перед скачиванием из Cloud Storage
"Считаю дельту..."            ← перед delta calculation
"Анализирую теги..."          ← перед content analysis (если включён)
```

Клиент рендерит это как анимированный статус внутри `ToolCallSummary`.

---

## Хранение данных

| Что | Где |
|---|---|
| CSV тела снапшотов | Cloud Storage: `storagePath` из Firestore |
| Snapshot metadata | Firestore: `users/{uid}/channels/{ch}/videos/{id}/trafficData/main` → `snapshots[]` |
| Source video (title, tags) | Firestore: `users/{uid}/channels/{ch}/videos/{id}` |
| Enrichment (tags, channelTitle) | Firestore: `users/{uid}/channels/{ch}/cached_suggested_traffic_videos/{videoId}` |

`cached_suggested_traffic_videos` заполняется при загрузке CSV через YouTube API enrichment (см. [suggested-traffic.md](./suggested-traffic.md)).

---

## Ключевые технические решения

**Почему не передавать CSV напрямую в Gemini:**
500 строк CSV ≈ 140K токенов ≈ $2.80. Предварительный расчёт на сервере сжимает данные до ~5K токенов с потерей только длинного хвоста.

**Почему delta на стороне сервера:**
Gemini не умеет надёжно сравнивать массивы числовых данных. Детерминированный код даёт точные числа, AI только интерпретирует результат.

**biggestChanges по абсолютному значению:**
Включает и рост, и падение — Gemini знает об этом из `analysisGuidance`.

**db.getAll ограничен до 30 refs:**
Content analysis берёт не более 30 топ-источников, чтобы не упереться в лимиты Firestore.

---

## Расположение файлов

```
functions/src/
  services/tools/
    handlers/analyzeSuggestedTraffic.ts   ← main handler
    utils/
      csvParser.ts                        ← RFC 4180 parser
      delta.ts                            ← snapshot diffing
      suggestedAnalysis.ts                ← aggregation + content analysis
      __tests__/
        csvParser.test.ts
        delta.test.ts
        suggestedAnalysis.test.ts
    definitions.ts                        ← tool declaration (FunctionDeclaration)
    executor.ts                           ← tool routing

src/
  core/
    types/sseEvents.ts                    ← SSEToolProgressEvent
    services/aiProxyService.ts            ← SSE toolProgress handler
    services/aiService.ts                 ← onToolProgress thread-through
    stores/chatStore.ts                   ← ActiveToolCall + progressMessage
  features/Chat/
    components/ToolCallSummary.tsx        ← рендер прогресс-статуса
    components/ToolCallBadge.tsx          ← метка инструмента
    utils/toolCallGrouping.ts             ← getGroupLabel для analyzeSuggestedTraffic
```

---

## Связанные фичи

- [Suggested Traffic UI](./suggested-traffic.md) — откуда берутся CSV и данные enrichment
- [Chat](./chat/) — SSE streaming, tool call pipeline, ToolCallSummary UI
