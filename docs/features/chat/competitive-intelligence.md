# Competitive Intelligence — AI Tools

## Что это

AI-ассистент в чате умеет глубоко анализировать **твои** видео: откуда приходит трафик, как растут просмотры, какие видео приводят зрителей через suggested. Но он полностью слеп к тому, что происходит **вокруг** — у конкурентов, в нише.

Competitive Intelligence — это набор инструментов, которые открывают AI-ассистенту доступ к данным из Trends. Все видео конкурентов (~8000 на 10 каналах) уже лежат в Firestore — нужны лишь инструменты, чтобы AI мог их читать, фильтровать и сравнивать.

## Зачем

Сейчас, когда ты просишь AI "проанализируй моё последнее видео", он расскажет про просмотры, трафик, suggested videos. Но **не скажет**:

- "В тот же день 3 конкурента выпустили видео на эту тему, и у двоих результат лучше"
- "Твоя обложка повторяет видео канала X, которое вышло неделей раньше и набрало 500K"
- "В нише тренд на [тему] — 5 из 10 каналов выпустили об этом видео за 2 недели"

С Competitive Intelligence — скажет. AI сможет посмотреть, что публиковали конкуренты в тот же период, сравнить перформанс, найти похожие видео по упаковке и визуалу, увидеть тренды ниши.

## Текущее состояние

**Стадия: Этап 1 реализован.** Три инструмента (`listTrendChannels`, `browseTrendVideos`, `getNicheSnapshot`) дают AI доступ к данным конкурентов из Trends. Per-channel percentile тиры, view deltas (24h/7d/30d), hidden video filtering, `dataFreshness` metadata. Zero YouTube API cost — все данные из Firestore. Percentile алгоритм вынесен в `shared/percentiles.ts` (SSOT для frontend и backend).

← YOU ARE HERE

---

## Roadmap

Реализация разбита на 3 этапа. Каждый следующий этап добавляет новый уровень "интеллекта", но предыдущий полностью самодостаточен.

### Этап 1 — Базовые инструменты

**Что получает пользователь:**
AI отвечает на вопросы про конкурентов, используя данные, которые уже есть в Trends. Ответы мгновенные (данные в Firestore), не тратят YouTube API квоту.

**Примеры вопросов, на которые AI сможет ответить:**
- "Какие каналы я отслеживаю и как они перформят?"
- "Что публиковали конкуренты на прошлой неделе?"
- "Покажи топ-видео конкурента X за последний месяц"
- "Что происходило в нише, когда я выпустил вот это видео?"
- "Есть ли общие темы у видео, которые хорошо зашли у разных конкурентов?"

**Три новых инструмента:**

#### 1. `listTrendChannels` — "кого я отслеживаю?"

AI получает список всех отслеживаемых каналов-конкурентов с базовыми метриками: сколько видео, средние просмотры, подписчики, когда последний раз синхронизировались. Плюс статистика распределения просмотров по каналу — чтобы AI понимал, какой результат "нормальный" для каждого конкурента.

Это точка входа. AI вызывает этот инструмент первым, чтобы понять ландшафт.

<details>
<summary>Пример ответа</summary>

```json
{
  "channels": [
    {
      "channelId": "UC_x5XG1OV2P6uZZ5FSM9Ttw",
      "title": "MrBeast",
      "handle": "@MrBeast",
      "avatarUrl": "https://yt3.ggpht.com/...",
      "videoCount": 812,
      "subscriberCount": 345000000,
      "averageViews": 94500000,
      "lastUpdated": "2026-03-07T00:00:00Z",
      "performanceDistribution": {
        "p25": 42000000,
        "median": 78000000,
        "p75": 130000000,
        "max": 520000000
      }
    },
    {
      "channelId": "UCq6aw03GEhSoE9Rs18YjbHQ",
      "title": "Veritasium",
      "handle": "@veritasium",
      "avatarUrl": "https://yt3.ggpht.com/...",
      "videoCount": 245,
      "subscriberCount": 16200000,
      "averageViews": 8300000,
      "lastUpdated": "2026-03-07T00:00:00Z",
      "performanceDistribution": {
        "p25": 3100000,
        "median": 6800000,
        "p75": 11500000,
        "max": 72000000
      }
    }
  ],
  "totalChannels": 10,
  "totalVideos": 8247
}
```

Что AI видит: "у MrBeast медианное видео набирает 78M, а всё что ниже 42M — Bottom 20%. У Veritasium медиана 6.8M — совершенно другая шкала. Нельзя сравнивать абсолютные цифры между каналами, нужно смотреть на перформанс относительно нормы канала."

</details>

#### 2. `browseTrendVideos` — "что публиковали конкуренты?"

Главный рабочий инструмент. AI запрашивает видео конкурентов с фильтрами:

- **По каналам** — конкретный конкурент или все сразу
- **По датам** — "за последнюю неделю", "в январе", "вокруг даты X"
- **По перформансу** — те же 5 групп, что в Trends UI: Top 1%, Top 5%, Top 20%, Middle 60%, Bottom 20%
- **Сортировка** — по просмотрам, по дате, по росту за 24ч/7д/30д

Для каждого видео AI получает: заголовок, теги, просмотры, дату публикации, рост просмотров (дельты 24ч/7д/30д), URL обложки и название канала.

Default limit — 50 видео (~6K tokens), max — 200 (~25K tokens). Ответ **всегда** содержит `totalMatched` (required) — LLM видит, сколько всего подходит под фильтры (50 из 50 или 50 из 2000), и может сузить фильтры или увеличить limit. Без пагинации — LLM ограничен параметрами тула (limit, channelIds, dateRange, performanceTier), а не управляет cursor. Аналогично `browseChannelVideos`, где scope контролируется через `publishedAfter`, а внутренняя пагинация YouTube API скрыта от LLM. Token budget: одно видео ≈ 125 tokens.

<details>
<summary>Пример ответа (запрос: Top 1% видео канала Veritasium за последний месяц, сортировка по просмотрам)</summary>

```json
{
  "videos": [
    {
      "videoId": "dQw4w9WgXcQ",
      "title": "The Satisfsatisfying satisfying satisfying Video",
      "channelId": "UCq6aw03GEhSoE9Rs18YjbHQ",
      "channelTitle": "Veritasium",
      "publishedAt": "2026-02-28T14:00:00Z",
      "viewCount": 18500000,
      "viewDelta24h": 320000,
      "viewDelta7d": 4200000,
      "viewDelta30d": 18500000,
      "tags": ["science", "physics", "experiment"],
      "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      "performanceTier": "Top 1%"
    },
    {
      "videoId": "abc123xyz",
      "title": "Why No One Has Measured The Speed Of Light",
      "channelId": "UCq6aw03GEhSoE9Rs18YjbHQ",
      "channelTitle": "Veritasium",
      "publishedAt": "2026-02-15T16:00:00Z",
      "viewCount": 15200000,
      "viewDelta24h": 89000,
      "viewDelta7d": 1100000,
      "viewDelta30d": 12400000,
      "tags": ["light", "speed", "physics", "relativity"],
      "thumbnailUrl": "https://i.ytimg.com/vi/abc123xyz/mqdefault.jpg",
      "performanceTier": "Top 1%"
    }
  ],
  "totalMatched": 2,
  "channels": [
    { "channelId": "UCq6aw03GEhSoE9Rs18YjbHQ", "title": "Veritasium", "matchedCount": 2 }
  ]
}
```

Что AI видит: "у Veritasium за месяц 2 видео в Top 1%. Первое всё ещё активно растёт (+4.2M за неделю), второе замедляется (+1.1M). Оба — science/physics, значит эта тема сейчас заходит у аудитории канала."

</details>

#### 3. `getNicheSnapshot` — "снимок ниши в момент времени"

Инструмент агрегации данных. AI указывает конкретное видео (или дату) и получает снимок: всё, что публиковали конкуренты в окне ±7 дней. Тул возвращает **сырые данные + pre-computed агрегаты** (подсчёты, средние, сортировки), но не делает выводов — интерпретация остаётся за LLM:

- Видео конкурентов, сгруппированные по каналу, с метриками
- Количество публикаций и средние просмотры per channel
- Частотность тегов across каналов (commonTags — deterministic counting)
- Видео с наибольшими просмотрами в окне (topPerformers — сортировка по viewCount)

LLM получает структурированные данные и сам решает, что это значит для пользователя — были ли конкуренты активнее обычного, пересекались ли темы, как выглядит видео пользователя на фоне ниши.

<details>
<summary>Пример ответа (запрос: niche snapshot для видео "My Iceland Adventure", опубликованного 2026-02-20)</summary>

```json
{
  "referencePoint": {
    "date": "2026-02-20",
    "videoTitle": "My Iceland Adventure",
    "videoViews": 245000
  },
  "window": {
    "from": "2026-02-13",
    "to": "2026-02-27"
  },
  "competitorActivity": [
    {
      "channelId": "UC_x5XG1OV2P6uZZ5FSM9Ttw",
      "channelTitle": "MrBeast",
      "videosPublished": 3,
      "videos": [
        {
          "videoId": "vid_mr1",
          "title": "I Survived 7 Days In Iceland",
          "viewCount": 185000000,
          "viewDelta7d": 42000000,
          "publishedAt": "2026-02-18T17:00:00Z",
          "tags": ["iceland", "survival", "challenge"],
          "performanceTier": "Top 1%"
        },
        {
          "videoId": "vid_mr2",
          "title": "World's Most Dangerous Bridge",
          "viewCount": 92000000,
          "viewDelta7d": 18000000,
          "publishedAt": "2026-02-22T17:00:00Z",
          "tags": ["bridge", "extreme", "challenge"],
          "performanceTier": "Top 20%"
        },
        {
          "videoId": "vid_mr3",
          "title": "$1 vs $1,000,000 Hotel Room",
          "viewCount": 134000000,
          "viewDelta7d": 31000000,
          "publishedAt": "2026-02-14T17:00:00Z",
          "tags": ["hotel", "luxury", "comparison"],
          "performanceTier": "Top 5%"
        }
      ],
      "avgViews": 137000000,
      "topPerformer": { "videoId": "vid_mr1", "title": "I Survived 7 Days In Iceland", "viewCount": 185000000 }
    },
    {
      "channelId": "UCq6aw03GEhSoE9Rs18YjbHQ",
      "channelTitle": "Veritasium",
      "videosPublished": 1,
      "videos": [
        {
          "videoId": "vid_v1",
          "title": "The Real Reason Iceland Has No Trees",
          "viewCount": 9800000,
          "viewDelta7d": 3200000,
          "publishedAt": "2026-02-19T16:00:00Z",
          "tags": ["iceland", "trees", "geography", "science"],
          "performanceTier": "Top 5%"
        }
      ],
      "avgViews": 9800000,
      "topPerformer": { "videoId": "vid_v1", "title": "The Real Reason Iceland Has No Trees", "viewCount": 9800000 }
    }
  ],
  "aggregates": {
    "totalVideosInWindow": 14,
    "commonTags": [
      { "tag": "iceland", "count": 4 },
      { "tag": "challenge", "count": 3 },
      { "tag": "travel", "count": 3 },
      { "tag": "science", "count": 2 }
    ],
    "avgViewsInWindow": 48300000,
    "topByViews": [
      { "videoId": "vid_mr1", "title": "I Survived 7 Days In Iceland", "channelTitle": "MrBeast", "viewCount": 185000000 },
      { "videoId": "vid_mr3", "title": "$1 vs $1,000,000 Hotel Room", "channelTitle": "MrBeast", "viewCount": 134000000 },
      { "videoId": "vid_mr2", "title": "World's Most Dangerous Bridge", "channelTitle": "MrBeast", "viewCount": 92000000 },
      { "videoId": "vid_v1", "title": "The Real Reason Iceland Has No Trees", "channelTitle": "Veritasium", "viewCount": 9800000 },
      { "videoId": "vid_o1", "title": "Iceland's Hidden Hot Springs", "channelTitle": "Yes Theory", "viewCount": 4200000 }
    ]
  }
}
```

**Что тул возвращает** (data + computation): 14 видео в окне, сгруппированных по каналу, с подсчётом тегов и сортировкой по просмотрам. Никаких выводов — только структурированные данные и арифметика.

**Что LLM делает с этими данными** (interpretation): "ты выпустил 'My Iceland Adventure' (245K) в неделю, когда MrBeast выпустил 'I Survived 7 Days In Iceland' (185M) за 2 дня до тебя, а Veritasium — видео про Исландию за день до. Тег 'iceland' у 4 из 14 видео. Ты был в русле ниши, но конкурировал с каналами другого масштаба."

</details>

**Важно:** на этом этапе AI уже может анализировать обложки конкурентов визуально — для этого есть готовый инструмент `viewThumbnails`. Поток: `browseTrendVideos` (получить ID видео) → `viewThumbnails` (увидеть обложки) → AI анализирует визуальные паттерны. Единственное ограничение — AI не может **найти** похожие обложки среди 8000 видео, он может только **посмотреть** обложки конкретных видео, которые ему уже показали.

**Чеклист:**
- [x] Инструмент `listTrendChannels`
- [x] Вынос percentile алгоритма в `shared/percentiles.ts` (SSOT для frontend + backend)
- [x] Инструмент `browseTrendVideos` с фильтрами и percentile расчётом
- [x] Инструмент `getNicheSnapshot`
- [x] View deltas для trend videos (через существующий `trendSnapshotService`)
- [x] Документация каждого инструмента (`docs/features/chat/tools/`)
- [x] Тесты

---

### Этап 2 — Поиск похожих по упаковке (text embeddings)

**Что получает пользователь:**
AI может **найти** видео конкурентов, похожие на конкретное видео по смыслу — не по точному совпадению слов, а по теме. Вопрос "найди у конкурентов видео, похожие на моё" — AI возвращает ранжированный список.

**Как это работает (простыми словами):**
Для каждого из 8000 видео конкурентов создаётся числовой "отпечаток" (embedding) из заголовка, тегов и описания. Два видео на одну тему будут иметь похожие отпечатки, даже если слова разные. Когда AI ищет "похожие", он сравнивает отпечатки — это мгновенно даже на 8000 видео.

**Новый инструмент:**

#### `findSimilarVideos` (mode: packaging)

AI указывает видео (своё или конкурента) и получает список самых похожих по теме видео across всех каналов-конкурентов. Каждый результат — с баллом схожести и метриками перформанса.

Закрывает кейсы:
- "Кто из конкурентов делал видео на эту же тему?"
- "Моё видео — копия чего-то у конкурентов?"
- "Какие результаты у похожих видео на других каналах?"

<details>
<summary>Пример ответа (запрос: видео похожие на "My Iceland Adventure" по упаковке)</summary>

```json
{
  "referenceVideo": {
    "videoId": "my_video_123",
    "title": "My Iceland Adventure",
    "tags": ["iceland", "travel", "adventure", "vlog", "landscape"]
  },
  "mode": "packaging",
  "similar": [
    {
      "videoId": "vid_mr1",
      "title": "I Survived 7 Days In Iceland",
      "channelTitle": "MrBeast",
      "similarityScore": 0.91,
      "publishedAt": "2026-02-18T17:00:00Z",
      "viewCount": 185000000,
      "viewDelta24h": 1200000,
      "viewDelta7d": 42000000,
      "viewDelta30d": 185000000,
      "performanceTier": "Top 1%",
      "sharedTags": ["iceland"]
    },
    {
      "videoId": "vid_v1",
      "title": "The Real Reason Iceland Has No Trees",
      "channelTitle": "Veritasium",
      "similarityScore": 0.84,
      "publishedAt": "2026-02-19T16:00:00Z",
      "viewCount": 9800000,
      "viewDelta24h": 120000,
      "viewDelta7d": 3200000,
      "viewDelta30d": 9800000,
      "performanceTier": "Top 5%",
      "sharedTags": ["iceland"]
    },
    {
      "videoId": "vid_yt3",
      "title": "48 Hours in Reykjavik — Ultimate Travel Guide",
      "channelTitle": "Yes Theory",
      "similarityScore": 0.82,
      "publishedAt": "2025-11-05T15:00:00Z",
      "viewCount": 3100000,
      "viewDelta24h": 5000,
      "viewDelta7d": 45000,
      "viewDelta30d": 180000,
      "performanceTier": "Middle 60%",
      "sharedTags": ["iceland", "travel"]
    },
    {
      "videoId": "vid_gg7",
      "title": "Camping in the Most Remote Place on Earth",
      "channelTitle": "Going Global",
      "similarityScore": 0.76,
      "publishedAt": "2026-01-10T14:00:00Z",
      "viewCount": 1800000,
      "viewDelta24h": null,
      "viewDelta7d": null,
      "viewDelta30d": null,
      "performanceTier": "Middle 60%",
      "sharedTags": ["adventure", "travel"]
    }
  ],
  "totalFound": 47
}
```

Что AI видит: "нашлось 47 похожих видео. Топ-2 по сходству — тоже про Исландию, и оба вышли в ту же неделю (0.91 и 0.84 similarity). Третье — travel guide по Рейкьявику, но вышло 3 месяца назад и уже остановилось в росте. Четвёртое — похоже по концепции (adventure + travel), но не про Исландию (0.76). Видно, что тема Iceland была горячей в феврале."

</details>

**Чеклист:**
- [ ] Pipeline генерации embeddings при sync каналов (Gemini text-embedding-004)
- [ ] Firestore vector index для packaging embeddings
- [ ] Backfill: генерация embeddings для существующих ~8000 видео
- [ ] Инструмент `findSimilarVideos` (mode: packaging)
- [ ] Тесты

---

### Этап 3 — Поиск похожих по визуалу (thumbnail embeddings)

**Что получает пользователь:**
AI может найти видео конкурентов с **визуально похожими обложками**. "Моя обложка напоминает что-то у конкурентов?" → AI находит и показывает.

**Как это работает (простыми словами):**
Для каждой обложки AI (Gemini Vision) пишет текстовое описание: "яркий фон, крупное лицо с удивлённым выражением, красный текст 'ШОК', стрелка вниз". Затем из этого описания создаётся числовой отпечаток — такой же, как для упаковки в Этапе 2. Две обложки с похожим визуалом будут иметь похожие отпечатки.

**Бонус:** текстовые описания обложек дают AI понимание визуала **без загрузки картинок** — экономия токенов. AI может прочитать "яркий фон, крупное лицо" вместо того, чтобы смотреть на картинку.

#### `findSimilarVideos` (mode: visual / both)

Тот же инструмент из Этапа 2, но с двумя дополнительными режимами:
- `visual` — поиск по визуальному сходству обложек
- `both` — комбинированный (похожа и тема, и обложка)

Закрывает кейсы:
- "Была ли моя обложка вдохновлена конкурентом?"
- "Какой визуальный стиль сейчас работает в нише?"
- "Покажи топ-обложки конкурентов, похожие на мой стиль"

<details>
<summary>Пример ответа (запрос: видео с визуально похожими обложками, mode: visual)</summary>

```json
{
  "referenceVideo": {
    "videoId": "my_video_123",
    "title": "My Iceland Adventure",
    "thumbnailDescription": "Wide aerial shot of glacial landscape with turquoise lake, person standing on cliff edge with arms spread, bold white text 'ICELAND' with blue glow effect, dramatic sunset sky with orange and purple gradients"
  },
  "mode": "visual",
  "similar": [
    {
      "videoId": "vid_mr1",
      "title": "I Survived 7 Days In Iceland",
      "channelTitle": "MrBeast",
      "similarityScore": 0.88,
      "viewCount": 185000000,
      "performanceTier": "Top 1%",
      "thumbnailDescription": "Person in winter gear standing on glacier with arms raised, aerial perspective, bold yellow text '7 DAYS', icy blue landscape with dramatic clouds"
    },
    {
      "videoId": "vid_yt5",
      "title": "We Jumped Off a Cliff in Norway",
      "channelTitle": "Yes Theory",
      "similarityScore": 0.79,
      "viewCount": 5600000,
      "performanceTier": "Top 20%",
      "thumbnailDescription": "Person on cliff edge overlooking fjord, wide aerial shot, teal water below, bold white text 'NORWAY', sunset lighting with warm tones"
    },
    {
      "videoId": "vid_gg2",
      "title": "Alone in Patagonia",
      "channelTitle": "Going Global",
      "similarityScore": 0.74,
      "viewCount": 2400000,
      "performanceTier": "Middle 60%",
      "thumbnailDescription": "Solo figure on mountain ridge, vast landscape below, moody clouds, muted blue-green palette, minimalist text 'PATAGONIA' in thin white font"
    }
  ],
  "totalFound": 23
}
```

Что AI видит: "твоя обложка использует паттерн 'человек на краю + эпичный ландшафт + bold текст с названием страны' — это визуальный шаблон, который встречается у 23 видео конкурентов. MrBeast использует почти идентичную композицию (0.88 similarity), но его вариант набрал 185M. Yes Theory — тот же приём с Норвегией (0.79). Паттерн работает, но ты конкурируешь с очень узнаваемыми каналами на том же визуальном языке."

</details>

**Cost & rate limit strategy:**

Этап 3 — самый дорогой по API cost. Backfill 8000 видео = 8000 Vision calls + 8000 embedding calls.

- **Стоимость backfill:** зависит от модели и pricing на момент реализации. Перед запуском backfill — рассчитать точную стоимость по текущим ценам Gemini Vision (input: thumbnail ~258 tokens + prompt ~100 tokens; output: description ~200 tokens) × 8000 видео. Embedding calls (text-embedding-004) практически бесплатны
- **Rate limits:** Gemini Vision имеет RPM/RPD лимиты, зависящие от tier. Backfill должен работать батчами (N видео → пауза → N видео) с уважением к rate limits. Точный batch size определяется при реализации по текущим лимитам аккаунта
- **Ongoing cost:** после backfill — только новые видео (5-20 в день across 10 каналов). Несущественно
- **Idempotency:** backfill пропускает видео, у которых уже есть `thumbnailDescription`. Можно остановить и перезапустить безопасно
- **Partial failure:** если Vision не может обработать обложку (битый URL, content policy) → `thumbnailDescription: null`, визуальный embedding не создаётся, sync не блокируется. Видео остаётся доступным для packaging search (Этап 2), но не для visual search
- **Модель для Vision:** использовать самую дешёвую модель, достаточную для описания обложки (Flash, не Pro). Описание не требует глубокого reasoning — это перечисление визуальных элементов

**Чеклист:**
- [ ] Cost estimate на backfill по текущим ценам Gemini Vision
- [ ] Генерация текстовых описаний обложек через Gemini Vision при sync
- [ ] Pipeline визуальных embeddings (описание → embedding)
- [ ] Backfill для существующих видео (батчами, idempotent)
- [ ] `findSimilarVideos` (mode: visual + both)
- [ ] Тесты

---

### Финальное состояние (market-ready)

AI-ассистент, который при анализе любого видео автоматически:
1. Смотрит, что делали конкуренты в тот же период
2. Находит похожие видео по теме и визуалу
3. Определяет тренды ниши и позицию пользователя
4. Показывает, вдохновлено ли видео конкурентами
5. Сравнивает перформанс с аналогами

Всё на данных, которые уже в приложении (Trends). Zero дополнительного ручного ввода от пользователя.

---

## Technical Implementation

### Telescope Pattern — Layer 4

Существующие инструменты организованы в 3 слоя (подробнее: [Telescope Pattern](./tools/README.md)):

```
Layer 1: Discovery   → getChannelOverview, browseChannelVideos     (любой YouTube канал — YouTube API)
Layer 2: Detail      → getMultipleVideoDetails, viewThumbnails     (конкретные видео — Firestore + API)
Layer 3: Analysis    → analyzeTrafficSources, analyzeSuggestedTraffic (трафик своих видео — Firestore)
Layer 4: Competition → listTrendChannels, browseTrendVideos, getNicheSnapshot, findSimilarVideos (конкуренты — Firestore)
```

**Ключевое отличие Layer 4:** все данные читаются из Firestore (Trends feature). Zero YouTube API quota cost.

### Источник данных

```
Firestore path:
  users/{userId}/channels/{channelId}/
    trendChannels/{trendChannelId}/
      (title, avatarUrl, subscriberCount, averageViews, totalViewCount, lastUpdated)
      videos/{videoId}
        (title, thumbnail, tags, description, viewCount, publishedAt, duration)
      snapshots/{timestamp}
        (timestamp, videoViews: {videoId → viewCount})
```

Данные синхронизируются ежедневно через `scheduledSync` (Cloud Scheduler, 00:00 UTC) и по кнопке через `manualSync`.

### Percentile calculation (Этап 1)

Переиспользует существующую систему перcентилей из Trends UI — те же 5 групп (Top 1%, Top 5%, Top 20%, Middle 60%, Bottom 20%), тот же алгоритм ранжирования по viewCount.

**Percentile всегда per-channel.** Видео ранжируется относительно нормы своего канала, не в глобальном рейтинге across каналов. Это бизнес-решение: cross-channel percentile превращается в синоним размера канала (все видео большого канала — Top, все видео маленького — Bottom), а per-channel показывает, какие видео перформят **аномально хорошо или плохо для данного конкурента** — что гораздо полезнее для анализа.

При cross-channel запросе (все каналы сразу) фильтр `performanceTier: "Top 1%"` вернёт Top 1% видео **каждого** канала — т.е. хиты у всех конкурентов, а не только у самого крупного.

Сейчас алгоритм живёт только на фронтенде (`TrendsPage.tsx`, `useMemo`). В рамках Этапа 1 он выносится в `shared/percentiles.ts` — единый источник правды для фронтенда и бэкенда (аналогично `shared/viewDeltas.ts`). Фронтенд переключается на импорт из shared, backend handler использует ту же функцию.

При ~800 видео на канал — субсекундная операция, вычисляется в handler при каждом вызове.

### View deltas

Переиспользует `trendSnapshotService.getViewDeltas()` — тот же pipeline и алгоритм из `shared/viewDeltas.ts`, что уже работает в `getMultipleVideoDetails` и `analyzeSuggestedTraffic`.

### Cross-channel queries

Видео хранятся в subcollections по каналам. Для запросов across каналов handler делает параллельные запросы ко всем отслеживаемым каналам и мерджит результаты. При 10 каналах — 10 параллельных Firestore queries, быстро.

### Embedding storage (Этап 2+)

**Решение: отдельная flat-коллекция `trendVideoEmbeddings`.**

Embeddings — это поисковый индекс, а не source data. Как индекс в базе данных: хранится отдельно от таблицы, можно пересоздать из исходных данных в любой момент. Хранить их прямо в video documents — антипаттерн: каждое чтение видео (для фильтрации, отображения) тащило бы лишние ~6KB embedding данных.

**Альтернативы, которые были рассмотрены и отклонены:**
- **Vectors на video docs** — collection name `videos` слишком generic для collection group query; документы раздуваются; collection group + findNearest не задокументирован в Firebase docs
- **Внешняя vector DB (Pinecone, Weaviate)** — overkill на 8000 документов, лишняя инфраструктура и billing
- **In-memory в Cloud Function** — 8000 reads при каждом вызове, не масштабируется

```
Firestore path:
  users/{userId}/channels/{channelId}/trendVideoEmbeddings/{videoId}

Поля:
  videoId: string                    // YouTube video ID
  trendChannelId: string             // к какому trend channel принадлежит
  channelTitle: string               // денормализовано для результатов поиска
  title: string                      // заголовок видео (денормализовано)
  tags: string[]                     // теги (денормализовано)
  viewCount: number                  // просмотры (обновляется при sync)
  publishedAt: string                // дата публикации
  packagingEmbedding: vector(768)    // [Этап 2] из title + tags + description
  visualEmbedding: vector(768)       // [Этап 3] из thumbnail description
  thumbnailDescription: string       // [Этап 3] текстовое описание обложки
  embeddingVersion: number           // версия модели (для ре-генерации при смене модели)
  updatedAt: number                  // timestamp последнего обновления
```

**Firestore vector search:**
- `findNearest()` с cosine distance на одной коллекции — cross-channel search без collection group
- Flat index (точный KNN) — на 8000 документах точность важнее скорости, и скорость всё равно мгновенная
- Pre-filtering через `where()` (например, `trendChannelId == X`) + composite vector index
- Gemini `text-embedding-004`: 768 dimensions (лимит Firestore — 2048)
- Max 1000 результатов на запрос (хватает с запасом)

**Синхронизация с video docs:**
- `title`, `tags`, `viewCount` дублируются — обновляются при каждом sync канала
- Embedding пересоздаётся только при изменении title/tags/description (не при каждом sync)
- Скрытые видео (hiddenVideos) не удаляются из embeddings — фильтруются на уровне handler при выдаче результатов (аналогично фронтенду). Так проще и обратимо при "восстановлении" видео
- `embeddingVersion` позволяет массово пересоздать embeddings при смене модели

**View deltas в `findSimilarVideos`:** дельты (24h/7d/30d) НЕ хранятся в embedding doc — вычисляются runtime через `trendSnapshotService.getViewDeltas()` после vector search (тот же pipeline, что в `browseTrendVideos` и `getMultipleVideoDetails`). Это сохраняет embedding doc как чистый поисковый индекс, без дублирования delta-логики.

Graceful degradation: если канал добавлен недавно и snapshots ещё нет — deltas приходят как `null` (не `0`), чтобы LLM различал "нет данных" и "нулевой рост". Это уже реализованное поведение в `shared/viewDeltas.ts`.

**Осознанный trade-off:** дублирование минимального набора полей (title, viewCount) в обмен на чистые поисковые запросы без joins и без нагрузки на video documents. Всё, что меняется часто или вычисляется из других источников (дельты) — обогащается в runtime.

### Embedding generation (Этап 2+)

Встраивается в существующий sync pipeline:

```
scheduledSync / manualSync
  → SyncService.syncChannel()
    → YouTube API → save videos to Firestore
    → updateEmbeddingDocs(videos)                        // sync денормализованных полей
    → [Этап 2] generatePackagingEmbeddings(newOrChanged)  // Gemini text-embedding-004
    → [Этап 3] generateThumbnailDescriptions(newVideos)   // Gemini Vision
    → [Этап 3] generateVisualEmbeddings(descriptions)     // Gemini text-embedding-004
```

**Логика обновления:**
1. Для КАЖДОГО видео при sync — обновить денормализованные поля (viewCount, title) в embedding doc
2. Для НОВЫХ видео или видео с изменённым title/tags/description — пересоздать embedding
3. Для существующих ~8000 — одноразовый backfill через Cloud Function

### Firestore vector indexes (Этап 2+)

```bash
# Packaging embedding — cross-channel search
gcloud firestore indexes composite create \
  --collection-group=trendVideoEmbeddings \
  --query-scope=COLLECTION \
  --field-config field-path=packagingEmbedding,vector-config='{"dimension":"768","flat":"{}"}' \
  --database=DEFAULT

# Packaging embedding — per-channel search (composite)
gcloud firestore indexes composite create \
  --collection-group=trendVideoEmbeddings \
  --query-scope=COLLECTION \
  --field-config=order=ASCENDING,field-path=trendChannelId \
  --field-config field-path=packagingEmbedding,vector-config='{"dimension":"768","flat":"{}"}' \
  --database=DEFAULT

# Visual embedding (Этап 3) — аналогичная пара индексов
```

### Error handling & data quality

**Принцип: LLM никогда не должен представлять неполные или устаревшие данные как актуальные, не зная об этом.**

#### Staleness awareness

Каждый ответ инструмента содержит metadata о свежести данных:

- **`listTrendChannels`** — `lastUpdated` per channel (уже есть в схеме)
- **`browseTrendVideos`** — `dataFreshness: [{channelId, channelTitle, lastSynced}]` в ответе. LLM видит: "данные канала X обновлены 3 дня назад" и может предупредить пользователя
- **`getNicheSnapshot`** — тот же `dataFreshness` массив для каналов, попавших в окно

LLM получает факт ("last sync: 3 days ago") и сам решает, стоит ли предупреждать пользователя.

#### Missing snapshots (канал без истории)

Если канал только что добавлен и snapshots ещё нет:
- `viewDelta24h/7d/30d` = `null` (не `0`). Уже реализованное поведение в `shared/viewDeltas.ts`
- `browseTrendVideos` с `sort: "delta7d"` при всех `null` дельтах — fallback на вторичную сортировку по `viewCount desc`. Ответ включает `_note: "Delta data unavailable for N videos — sorted by viewCount instead"`
- `performanceDistribution` в `listTrendChannels` — считается по viewCount (snapshots не нужны). Всегда доступна, если есть хотя бы 1 видео

#### Partial embeddings (Этап 2+)

Embedding generation может не покрыть все видео (backfill в процессе, partial failure):
- `findSimilarVideos` ищет только среди видео с embeddings
- Ответ содержит `coverage: {indexed: 7500, total: 8000}` — LLM видит, что покрытие неполное
- Видео без embeddings остаются доступными через `browseTrendVideos` (text filters), просто не участвуют в semantic search

#### Пустые результаты

- `browseTrendVideos` с фильтрами, которым ничего не соответствует → `{videos: [], totalMatched: 0}`. Не ошибка, а валидный ответ ("конкуренты ничего не публиковали в этом окне")
- `getNicheSnapshot` для даты, когда ни один конкурент не публиковал → пустой `competitorActivity`, `aggregates` с нулями. LLM сам интерпретирует: "тишина в нише"

### Связь со Stage 6 (Chat README)

В [Chat README](./README.md) Stage 6 (RAG + Visual Context) содержит TODO:
- Visual descriptions (batch vision → thumbnail descriptions) — это наш Этап 3
- Vector search (embedding → semantic search) — это наш Этап 2

Competitive Intelligence естественно завершает Stage 6, добавляя vector search и visual descriptions конкретно для данных конкурентов из Trends.

### Файлы (будут созданы)

**Этап 1:**
```
shared/
  percentiles.ts                ← SSOT percentile алгоритм (frontend + backend)

functions/src/services/tools/
  handlers/
    listTrendChannels.ts
    browseTrendVideos.ts
    getNicheSnapshot.ts
  definitions.ts                ← добавить 3 новых tool definitions
  executor.ts                   ← добавить routing

docs/features/chat/tools/
  list-trend-channels.md
  browse-trend-videos.md
  get-niche-snapshot.md
```

**Этап 2-3:**
```
functions/src/services/
  embedding/
    packagingEmbedding.ts       ← text embedding generation
    visualEmbedding.ts          ← thumbnail description + embedding
    embeddingSync.ts            ← sync денормализованных полей при каждом sync
    backfill.ts                 ← one-time backfill для существующих видео

functions/src/services/tools/
  handlers/
    findSimilarVideos.ts
```
