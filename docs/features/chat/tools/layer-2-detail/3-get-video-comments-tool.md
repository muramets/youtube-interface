# AI Tool: getVideoComments — Feature Doc

## Текущее состояние

**Реализовано (Stage 1).** Layer 2 — detail. LLM читает комментарии под любым публичным видео через YouTube Data API `commentThreads.list`. 1-3 quota units (до 300 комментариев). Handler контролирует пагинацию, `_systemNote` ограничивает LLM от избыточных запросов. `commentCount` добавлен в `getMultipleVideoDetails` как сигнал для вызова.

---

## Что это — простыми словами

Представь, что AI-ассистент анализирует видео — смотрит статистику, обложку, трафик. Но он не слышит **голос аудитории**: что люди пишут в комментариях, какие вопросы задают, что хвалят или ругают. Этот инструмент даёт AI возможность прочитать комментарии и включить мнение зрителей в анализ.

---

## User flow

### Типичные сценарии

**"Что люди говорят?"**
1. Пользователь: *«Посмотри комментарии к моему последнему видео»*
2. LLM знает videoId из контекста → вызывает `getVideoComments(videoId)`
3. Получает top 100 комментариев по relevance (YouTube сам ранжирует лучшие)
4. Анализирует настроение, выделяет ключевые темы, частые вопросы

**"Сравни реакцию"**
1. Пользователь: *«Сравни комментарии под этими двумя видео — чем отличается аудитория?»*
2. LLM вызывает `getVideoComments` дважды (параллельно через `executeToolBatch`)
3. Сравнивает тон, темы, вовлечённость (reply count, like count)

**"Что пишут у конкурента?"**
1. Пользователь: *«Посмотри комменты под топ-видео MrBeast»*
2. LLM уже знает videoId из предыдущего `browseTrendVideos` или `browseChannelVideos`
3. Вызывает `getVideoComments` — работает для любых публичных видео

### В цепочке Telescope Pattern

```
browseChannelVideos → getMultipleVideoDetails → getVideoComments
       (список)            (метаданные)           (голос аудитории)
```

Комментарии — логичное продолжение после метаданных. LLM видит, что у видео высокий engagement (likeCount из `getMultipleVideoDetails`, commentCount доступен) → хочет понять **почему** → читает комменты.

---

## Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:---:|----------|
| `videoId` | string | да | ID видео для чтения комментариев |
| `order` | `"relevance"` \| `"time"` | нет | Сортировка. Default: `"relevance"` — YouTube ML-ранжирование (лайки, ответы, свежесть). `"time"` — хронологический порядок (новые первыми) |
| `maxResults` | number (1-100) | нет | Комментариев на страницу. Default: 100 |
| `maxPages` | number (1-3) | нет | Количество страниц пагинации. Default: 1 (100 комментариев). Max: 3 (300 комментариев, 3 quota units) |

---

## Что возвращает

```typescript
{
    videoId: string;
    totalTopLevelThreads: number;  // из pageInfo.totalResults (приблизительное для больших чисел)
    fetchedCount: number;          // сколько реально вернулось
    hasMore: boolean;              // есть ли ещё страницы
    coveragePercent: number;       // fetchedCount / totalTopLevelThreads * 100
    comments: Array<{
        author: string;
        authorChannelId?: string;    // channel ID автора — позволяет выявить engagement farms
                                     // (каналы, набивающие комменты под чужими видео для продвижения)
        text: string;                // текст комментария (plain text)
        likeCount: number;
        publishedAt: string;         // ISO 8601
        replyCount: number;          // общее число ответов (может быть больше, чем topReplies.length)
        topReplies?: Array<{         // inline replies из part=replies (обычно до 5, не гарантировано)
            author: string;
            text: string;
            likeCount: number;
            publishedAt: string;
        }>;
    }>;
    quotaUsed: number;           // 1 unit per page
    _systemNote: string;         // инструкция для LLM: не запрашивать больше без причины
}
```

### Progress Reporting

Handler использует `ctx.reportProgress?.()` для SSE `toolProgress` events — UI показывает статус в badge:

```
Page 1:  "Reading comments..."
Page 2+: "Reading more comments (page 2/3)..."
```

### `_systemNote` — контроль поведения LLM

Tool возвращает системную заметку, которая управляет решением LLM о повторном вызове:

```
"You have the top 100 comments by relevance. These represent the most engaged
discussions. Only request more pages if the user EXPLICITLY asks for broader
coverage or you cannot find enough signal in the current batch."
```

Этот паттерн (`_systemNote`) уже используется в проекте — например, `QUOTA_GATE` в `getChannelOverview`. LLM читает заметку в момент принятия решения и следует инструкции.

---

## Quota & Cost

| Сценарий | Pages | Quota | Комментариев |
|----------|:-----:|:-----:|:------------:|
| Default (1 page) | 1 | 1 unit | до 100 |
| Расширенный | 2 | 2 units | до 200 |
| Maximum | 3 | 3 units | до 300 |

Для сравнения: `browseChannelVideos` может потратить 5-10 units, `search.list` стоит 100 units. Комментарии — одна из самых дешёвых операций в YouTube API.

Quota gate **не требуется** — стоимость всегда предсказуема (1-3 units) и минимальна.

---

## YouTube API под капотом

Endpoint: `GET https://www.googleapis.com/youtube/v3/commentThreads`

```
part=snippet,replies
videoId={videoId}
order=relevance|time
maxResults=100
textFormat=plainText         // ВАЖНО: без этого textDisplay содержит HTML
pageToken={nextPageToken}    // для пагинации
key={apiKey}
```

- `snippet` — данные комментария (автор, текст, лайки, дата)
- `replies` — вложенные ответы, возвращаются inline (обычно до 5, количество не гарантировано API). Для полного списка ответов потребовался бы отдельный `comments.list` call — не делаем, inline replies достаточно для LLM-анализа
- `textFormat=plainText` — возвращает чистый текст вместо HTML в `textDisplay`
- Quota cost: **1 unit** за запрос
- Max results per page: **100**
- Пагинация: через `nextPageToken` в ответе

### totalTopLevelThreads — источник данных

Ответ `commentThreads.list` содержит `pageInfo.totalResults` — количество top-level comment threads для видео. Это значение берётся **из того же ответа** (0 дополнительных API вызовов).

**Почему не `video.statistics.commentCount`:**
- `statistics.commentCount` считает ВСЕ комментарии (top-level + replies)
- Мы фетчим только top-level threads → denominator в `coveragePercent` был бы завышен
- Потребовал бы отдельный `videos.list` call (+1 quota unit)

**Оговорка:** `pageInfo.totalResults` приблизительный для видео с десятками тысяч комментариев. Для LLM это не проблема — нужен порядок величины ("100 из ~15K" vs "100 из 103"), а не бухгалтерская точность.

### textDisplay vs textOriginal

YouTube API возвращает два текстовых поля:

| Поле | Содержимое | Доступность |
|------|-----------|-------------|
| `textDisplay` | Отформатированный текст. Без `textFormat=plainText` содержит HTML (ссылки, timestamps как `<a>` теги) | Всегда доступен |
| `textOriginal` | Сырой текст автора | Только для авторизованного автора комментария |

**Решение:** Используем `textFormat=plainText` в запросе + берём `textDisplay`. Это гарантирует:
- Чистый текст без HTML-noise (экономия токенов)
- Работает для любых видео (свои и чужие)
- Детерминированный формат вне зависимости от содержимого комментария

### Ограничения YouTube API

- Комментарии могут быть отключены автором видео → API вернёт ошибку 403 `commentsDisabled`
- Некоторые видео скрывают комментарии (kids content, age-restricted) → graceful error handling
- API не возвращает комментарии, удалённые модерацией

---

## Связанные фичи

- [Telescope Pattern Overview](../README.md) — общая архитектура tools
- [getMultipleVideoDetails](./1-get-multiple-video-details-tool.md) — часто вызывается перед этим тулом (commentCount оттуда подсказывает, стоит ли смотреть комменты)
- [browseChannelVideos](../layer-1-discovery/2-browse-channel-videos-tool.md) — источник videoId для анализа

---

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### План проверки

| # | Сценарий | Что проверяет | Промпт-идея | Проверено |
|---|----------|---------------|-------------|-----------|
| 1 | **Happy path (own video)** | 100 комментариев по relevance, sentiment analysis | "Что люди пишут в комментариях к моему видео [X]?" | ✅ trace #1 |
| 2 | **Competitor video** | Работа с чужим публичным видео | "Посмотри комментарии у [конкурент videoId]" | — |
| 3 | **Sentiment interpretation** | Выделяет ли модель темы, настроение, ключевые вопросы | "Какое настроение в комментариях? Что хвалят, что ругают?" | ✅ trace #1 |
| 4 | **Comparison (two videos)** | Параллельные вызовы, сравнение аудитории | "Сравни комментарии под этими двумя видео" | — |
| 5 | **Pagination control** | Не запрашивает ли модель лишние страницы (maxPages > 1) без причины | "Посмотри комменты" (ожидаем maxPages=1) | ✅ trace #1 |
| 6 | **Explicit more pages** | Запрашивает maxPages > 1 когда пользователь явно просит | "Покажи побольше комментариев, хочу полную картину" | — |
| 7 | **Comments disabled** | Graceful handling ошибки 403 commentsDisabled | Вызов для видео с отключёнными комментариями | — |
| 8 | **coveragePercent usage** | Упоминает ли модель "100 из ~15K" контекст | (покрывается любым trace с > 100 комментариев) | ⚠️ trace #1 |
| 9 | **_systemNote compliance** | Следует ли модель инструкции "only request more if EXPLICITLY asked" | "Посмотри комменты" → ожидаем 1 call, не 3 | ✅ trace #1 |
| 10 | **Tool chain: details → comments** | commentCount из getMultipleVideoDetails как триггер | "Расскажи всё про это видео" (ожидаем: details → видит commentCount → comments) | ✅ trace #1 |
| 11 | **Reply analysis** | Использует ли модель topReplies для deeper analysis | "Есть ли интересные дискуссии в комментариях?" | ✅ trace #1 |
| 12 | **authorChannelId patterns** | Замечает ли модель повторяющихся авторов / engagement farms | "Есть ли подозрительная активность в комментариях?" | — |

### Ключевые вопросы

1. **Pagination discipline** — Следует ли модель _systemNote? Или всегда запрашивает 3 страницы "на всякий случай"?
2. **Sentiment without pre-compute** — Модель определяет тон из raw text (by design). Качество?
3. **Tool chain trigger** — commentCount из getMultipleVideoDetails реально триггерит вызов getVideoComments?
4. **Token budget** — 100 комментариев ≈ сколько токенов? Помещается ли в context window с другими tool results?
5. **Multi-language** — Комментарии на разных языках — справляется ли модель с sentiment analysis?
6. **Comments disabled UX** — Внятно ли модель объясняет "комментарии отключены" или путается?

### Проверено в бою

<details>
<summary>Trace #0 — Title resolution fail (предварительный прогон) ❌→✅</summary>

- **Промпт**: "что люди писали под моим видео a playlist for a quiet morning 🍁 autumn version. ? для чего использовали видео?"
- **Контекст**: пустой (projectId: null)
- **Модель**: claude-haiku-4-5
- **Результат**: ❌ title lookup fail → модель не дошла до `getVideoComments`

**Что произошло:**
- Tool call: `getMultipleVideoDetails({ titles: ["a playlist for a quiet morning 🍁 autumn version"] })` — без точки в конце
- Firestore title: `"a playlist for a quiet morning 🍁 autumn version."` — с точкой
- Exact match fail → `notFoundTitles` → модель попросила ID
- LLM отрезала точку из названия, восприняв её как конец предложения (title не был в кавычках)

**Фикс**: пользователь обернул title в кавычки → LLM сохранила точку → trace #1 прошёл.

**Вывод**: `resolveVideosByTitle` с exact match хрупок — один символ пунктуации ломает lookup. Кавычки в промпте — workaround, не fix. Нормализация title (strip trailing punctuation, lowercase) — потенциальное улучшение на будущее.

</details>

<details>
<summary>Trace #1 — Happy path own video + sentiment + replies (тесты #1, #3, #5, #8, #9, #10, #11) ✅</summary>

- **Промпт**: "что люди писали под моим видео с названием "a playlist for a quiet morning 🍁 autumn version." ? для чего использовали видео?"
- **Контекст**: пустой (projectId: null)
- **Модель**: claude-haiku-4-5
- **Результат**: ✅ title lookup → getVideoComments → structured sentiment analysis

**Tool chain (3 итерации, 2 tool calls):**
1. `getMultipleVideoDetails({ titles: [...] })` → `ownership: "own-published"`, `youtubeVideoId: "A4SkhlJ2mK8"`, `videoId: "custom-1770397384029"`
2. `getVideoComments({ videoId: "A4SkhlJ2mK8" })` → 24 комментария, `coveragePercent: 100`, `quotaUsed: 1`
3. Финальный ответ с анализом

**Что сработало:**
- **#1 Happy path**: own-published видео найдено, 24 комментария + 18 replies получены
- **#3 Sentiment**: модель выделила 4 категории использования (учёба, творчество, эмоциональное состояние, наслаждение) + интересные детали (запросы нот, трек 7:32, вопрос про AI)
- **#5 Pagination control**: `maxPages` не указан → default 1 → 1 запрос, 1 quota unit
- **#9 _systemNote compliance**: модель не запросила дополнительные страницы
- **#10 Tool chain**: `getMultipleVideoDetails` → извлёк `youtubeVideoId` → `getVideoComments`. Модель правильно использовала YouTube ID (не custom-* ID)
- **#11 Reply analysis**: использовала topReplies — thread про экономику (3 replies), SoundCloud ссылку (4 replies), ответы автора канала
- **Multi-language**: итальянский коммент правильно интерпретирован

**Замечания:**
- **#8 coveragePercent**: данные есть (`coveragePercent: 100`, `24 of 24`), но модель не упомянула coverage в ответе. Для маленького видео это не критично, но для видео с 15K комментариев "100 из ~15K" — важный контекст. Нужен trace с большим видео.
- **authorChannelId**: повторяющиеся авторы не анализировались (в данном trace нет engagement farms — ожидаемо)

**Ответы на ключевые вопросы:**
1. **Pagination discipline**: ✅ — 1 page, не запросила больше
2. **Sentiment quality**: ✅ — 4 категории + interesting details, без pre-compute
3. **Tool chain trigger**: ✅ — title → videoId → comments, chain работает (но trigger был от промпта, не от commentCount)
4. **Token budget**: 24 комментария + 18 replies = `toolResults: 10145` токенов (5% context window). Для 100 комментариев ≈ 40K токенов — помещается
5. **Multi-language**: ✅ — итальянский распознан

</details>

### Ещё не проверено в бою

| Сценарий | Почему важно |
|----------|-------------|
| **Competitor video** | Работает ли с чужим публичным видео (не только своё) |
| **Comments disabled** | Edge case, но частый — kids content, age-restricted |
| **coveragePercent на большом видео** | "100 из ~15K" — упоминает ли модель контекст неполного покрытия |
| **Explicit more pages** | Запрашивает ли maxPages > 1 по просьбе пользователя |
| **Comparison (two videos)** | Параллельные вызовы через executeToolBatch |
| **authorChannelId patterns** | Engagement farms detection — нужно видео с подозрительной активностью |
| **commentCount → implicit trigger** | "Расскажи всё про видео" → details видит commentCount → сама вызывает comments |

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/youtube.ts` | `getCommentThreads()` — новый метод YouTubeService |
| `functions/src/services/tools/handlers/getVideoComments.ts` | Handler: валидация → API → structured response |
| `functions/src/services/tools/definitions.ts` | Tool declaration в `TOOL_NAMES` + `TOOL_DECLARATIONS` |
| `functions/src/services/tools/executor.ts` | Регистрация handler'а в `HANDLERS` map |
| `src/features/Chat/utils/toolCallGrouping.ts` | UI label, `isExpandable`, `extractVideoIdsForTool` |

### UI Labels (`toolCallGrouping.ts`)

```
pending:  "Reading comments..."
resolved: "{fetchedCount} comments loaded"
error:    "Couldn't load comments"
isExpandable: false (Stage 1). Stage 2: expandable preview top 3-5 комментариев в badge
extractVideoIdsForTool: videoId из args (для mentionVideo linkage)
```

### Field Mapping (YouTube API → handler response)

```
pageInfo.totalResults  →  totalTopLevelThreads              // из того же ответа, 0 доп. cost
snippet.topLevelComment.snippet.textDisplay  →  comment.text      // с textFormat=plainText
snippet.topLevelComment.snippet.authorDisplayName  →  comment.author
snippet.topLevelComment.snippet.authorChannelId.value  →  comment.authorChannelId
snippet.topLevelComment.snippet.likeCount  →  comment.likeCount
snippet.topLevelComment.snippet.publishedAt  →  comment.publishedAt
snippet.totalReplyCount  →  comment.replyCount
replies.comments[].snippet.textDisplay  →  comment.topReplies[].text
replies.comments[].snippet.authorDisplayName  →  comment.topReplies[].author
replies.comments[].snippet.likeCount  →  comment.topReplies[].likeCount
replies.comments[].snippet.publishedAt  →  comment.topReplies[].publishedAt
```

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/getVideoComments.test.ts` | 16 (validation, happy path, pagination, errors, edge cases) |
| `functions/src/services/__tests__/youtube.test.ts` (getCommentThreads describe) | 8 (happy path, pagination, 403, empty, replies, order, nextPageToken) |
| `functions/src/services/tools/handlers/__tests__/getMultipleVideoDetails.commentCount.test.ts` | 4 (own, API fallback, cache, undefined) |

---

## ← YOU ARE HERE → Stage 2: Structural enrichment

## Roadmap

### Stage 1 — Core implementation ✅
**Бизнес-цель:** LLM может читать комментарии к любому публичному видео.

- [x] `commentCount` в `formatVideoData` (`getMultipleVideoDetails`)
- [x] Метод `getCommentThreads()` в YouTubeService
- [x] Handler `handleGetVideoComments`
- [x] Tool definition + регистрация в executor
- [x] Frontend: tool call label в `toolCallGrouping.ts`
- [x] Тесты: 16 handler + 8 YouTubeService + 4 commentCount = 28 новых тестов
- [x] Feature doc обновление

### Stage 2 — Structural enrichment
**Бизнес-цель:** handler pre-computes структурные метрики (math), LLM интерпретирует смысл (pattern recognition).

- [ ] Word/phrase frequency — top N повторяющихся слов/фраз (code: counting)
- [ ] Temporal distribution — комментарии по дням/неделям, спайки активности (code: buckets)
- [ ] Reply ratios — % комментариев с ответами, avg replies per thread (code: arithmetic)
- [ ] Author stats — повторяющиеся комментаторы, % unique authors (code: counting)
- [ ] Sentiment analysis — **НЕ pre-compute**. LLM определяет тон из raw text значительно лучше любого keyword matching
- [ ] Expandable comment preview в tool call badge (top 3-5 комментариев, аналог ThumbnailGrid)

### Stage 3 — Market-ready
**Бизнес-цель:** комментарии как полноценный аналитический инструмент.

- [ ] Кэширование в `cached_comments/` с adaptive TTL (hot videos с активными комментами — короткий TTL, old videos — длинный)
- [ ] Rate limiting per user
- [ ] Cost tracking (quota usage per user per day)
