# Competitive Intelligence — AI Tools

## Что это

AI-ассистент в чате умеет глубоко анализировать **твои** видео: откуда приходит трафик, как растут просмотры, какие видео приводят зрителей через suggested. Но он полностью слеп к тому, что происходит **вокруг** — у конкурентов, в нише.

Competitive Intelligence — это набор инструментов, которые открывают AI-ассистенту доступ к данным из Trends. Все видео конкурентов (~8000 на 10 каналах) уже в базе — нужны лишь инструменты, чтобы AI мог их читать, фильтровать и сравнивать.

## Зачем

Сейчас, когда ты просишь AI "проанализируй моё последнее видео", он расскажет про просмотры, трафик, suggested videos. Но **не скажет**:

- "В тот же день 3 конкурента выпустили видео на эту тему, и у двоих результат лучше"
- "Твоя обложка повторяет видео канала X, которое вышло неделей раньше и набрало 500K"
- "В нише тренд на [тему] — 5 из 10 каналов выпустили об этом видео за 2 недели"

С Competitive Intelligence — скажет. AI сможет посмотреть, что публиковали конкуренты в тот же период, сравнить перформанс, найти похожие видео по упаковке и визуалу, увидеть тренды ниши.

## Инструменты Layer 4

Пять инструментов закрывают разные задачи конкурентной аналитики. У каждого — своя специализация, свой тип входных данных и свой формат ответа.

| Инструмент | Вопрос пользователя | Что возвращает | Вход | Стоимость | Типичная цепочка |
|---|---|---|---|---|---|
| **listTrendChannels** — "кого я отслеживаю?" | "Какие каналы я мониторю?" "Как перформят конкуренты?" | Список каналов с метриками: подписчики, средние просмотры, распределение перформанса (что "нормально" для канала) | Ничего — возвращает всё | Бесплатно | **Точка входа** → browseTrendVideos / getNicheSnapshot |
| **browseTrendVideos** — "что публиковали?" | "Что конкуренты выпустили на прошлой неделе?" "Топ-видео канала X?" "Что растёт быстрее всего?" | Список видео с фильтрами по каналу, дате, перформансу. Каждое видео — с тиром (Top 1%...Bottom 20%) и динамикой роста (24ч/7д/30д) | Каналы, даты, тир, сортировка, лимит — всё опционально | Бесплатно | listTrendChannels → **browseTrendVideos** → viewThumbnails |
| **getNicheSnapshot** — "что было в нише?" | "Что происходило, когда я выпустил видео X?" "Какие тренды были на прошлой неделе?" | Снимок ниши в окне ±N дней: все видео конкурентов, сгруппированные по каналу, + агрегаты (горячие теги, средние просмотры, топ-перформеры) | Дата или ID видео (+ опционально размер окна) | Бесплатно | listTrendChannels → **getNicheSnapshot** |
| **findSimilarVideos** — "найди похожие" | "Кто из конкурентов делал видео на ту же тему?" "Моя обложка похожа на что-то у конкурентов?" | Ранжированный список похожих видео с баллом сходства. Три режима: по теме (текст), по обложке (визуал), комбинированный | ID видео (своего или конкурента) + режим поиска | ~$0.0001 за запрос (генерация embedding для своего видео; для конкурентов — бесплатно) | browseTrendVideos → **findSimilarVideos** → viewThumbnails |
| **searchDatabase** — "найди про тему" | "Есть ли у конкурентов видео про AI?" "Какие видео в нише про путешествия?" | Семантический поиск по свободному тексту — находит видео по смыслу, а не по точному совпадению слов. Кросс-язычный (русский запрос находит английские видео) | Текстовый запрос (+ опционально каналы) | ~$0.00004 за запрос | **searchDatabase** (самодостаточный) |

**Как выбрать инструмент — простое правило:**
- Знаешь **конкретное видео** и хочешь найти похожие → `findSimilarVideos`
- Знаешь **тему** и хочешь найти видео про неё → `searchDatabase`
- Хочешь **отфильтровать** видео конкурентов по дате/перформансу/каналу → `browseTrendVideos`
- Хочешь увидеть **контекст ниши** вокруг конкретной даты → `getNicheSnapshot`
- Хочешь понять **ландшафт** конкурентов → `listTrendChannels`

<details>
<summary><b>browseTrendVideos vs getNicheSnapshot — в чём разница?</b></summary>

На первый взгляд оба инструмента возвращают видео конкурентов. Но у них принципиально разные задачи:

**browseTrendVideos** — это **фильтр в каталоге**. "Покажи мне видео, подходящие под критерии." Результат — плоский список, без агрегации. Как поиск в Google: задаёшь параметры → получаешь результаты.

**getNicheSnapshot** — это **газета за конкретную дату**. "Что происходило в мире, когда я сделал X?" Результат — видео сгруппированы по каналам + агрегаты поверх данных: горячие теги, средние просмотры, топ-5 видео, активность каждого канала. AI получает не просто список, а готовую аналитическую картину.

| | browseTrendVideos | getNicheSnapshot |
|---|---|---|
| **Аналогия** | Поиск в каталоге | Фотография момента |
| **Вход** | Фильтры (каналы, даты, тир, сортировка) | Дата или видео |
| **Результат** | Плоский список видео | Видео по каналам + агрегаты |
| **Агрегаты** | Нет (только `totalMatched`) | Горячие теги, средние views, топ-перформеры |
| **Когда** | "Топ-видео канала X?" "Что растёт?" | "Что было в нише вокруг моего релиза?" |

**Пример:** ты выпустил видео 20 февраля.
- `browseTrendVideos({ dateRange: { from: "2026-02-13", to: "2026-02-27" } })` → список видео за период. AI сам считает, группирует, ищет паттерны.
- `getNicheSnapshot({ date: "2026-02-20" })` → готовый снимок: "14 видео от 4 конкурентов, тег 'iceland' у 4 из них, MrBeast доминировал с 185M views". AI сразу интерпретирует.

</details>

> Подробная документация каждого инструмента: [listTrendChannels](./1-list-trend-channels-tool.md) · [browseTrendVideos](./2-browse-trend-videos-tool.md) · [getNicheSnapshot](./3-get-niche-snapshot-tool.md) · [findSimilarVideos](./4-find-similar-videos-tool.md) · [searchDatabase](./5-search-database-tool.md)

## Текущее состояние

**Все 3 этапа + searchDatabase реализованы.** Пять инструментов дают AI полный доступ к данным конкурентов:
- **Этап 1:** Базовый доступ — список каналов, фильтрация видео, снимок ниши. Мгновенные ответы, бесплатно.
- **Этап 2:** Семантический поиск по теме — "найди похожие по смыслу" across всех конкурентов.
- **Этап 3:** Визуальный поиск по обложкам — "найди похожие по внешнему виду" + комбинированный режим.
- **searchDatabase:** Свободный текстовый поиск — "найди видео про [тему]" по всей базе.

Инфраструктура: глобальный поисковый индекс (~4370 видео, 36 каналов), автоматическая ежедневная синхронизация, бюджетный лимит ($5/мес). Покрытие: 100% текстовый поиск, 98% визуальный (84 видео с недоступными обложками).

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
- [x] Единый percentile алгоритм (SSOT для frontend + backend)
- [x] Инструмент `browseTrendVideos` с фильтрами и percentile расчётом
- [x] Инструмент `getNicheSnapshot`
- [x] View deltas для trend videos
- [x] Документация каждого инструмента
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
- [x] Глобальный поисковый индекс — schema, vector indexes
- [x] Ежедневная синхронизация embeddings (отдельная от video sync)
- [x] Pipeline текстовых embeddings
- [x] Pipeline текстовых описаний обложек
- [x] Batched vector search
- [x] Backfill для ~8000 существующих видео
- [x] Инструмент `findSimilarVideos` (mode: packaging) — [tool doc](./4-find-similar-videos-tool.md)
- [x] Тесты

---

### Этап 3 — Поиск похожих по визуалу (thumbnail embeddings)

**Что получает пользователь:**
AI может найти видео конкурентов с **визуально похожими обложками**. "Моя обложка напоминает что-то у конкурентов?" → AI находит и показывает.

**Как это работает (простыми словами):**
Для каждой обложки создаётся числовой "визуальный отпечаток" напрямую из картинки — без промежуточного текстового описания. Модель анализирует саму картинку: цвета, композицию, расположение объектов, стиль типографики, эмоциональный тон. Две обложки с похожим визуалом будут иметь близкие отпечатки.

Прямое сравнение картинок точнее, чем текстовое описание: текст неизбежно теряет детали (оттенки цвета, пространственную композицию, стиль обработки фото). Модель "видит" картинку целиком.

Текстовые описания обложек генерируются уже в **Этапе 2** — к моменту Этапа 3 AI уже умеет объяснять визуальное сходство словами.

#### `findSimilarVideos` (mode: visual / both)

Тот же инструмент из Этапа 2, но с двумя дополнительными режимами:
- `visual` — поиск по визуальному сходству обложек
- `both` — комбинированный: ищет и по теме, и по визуалу одновременно, затем объединяет результаты через алгоритм [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf). Видео, похожее и по теме, и по обложке, поднимается выше. Видео, похожее только по одному критерию, тоже попадает в результат, но ниже

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

**Стоимость:** ~$1.90 за полную индексацию 8000 видео (все три операции). Текущие расходы — ~$0.15/мес (5-20 новых видео в день). Глобальный бюджетный лимит $5/мес с автоматической остановкой при превышении. Подробности → [Technical Implementation: Cost & Rate Limits](#cost--rate-limits).

**Чеклист:**
- [x] Настройка Vertex AI
- [x] Pipeline визуальных embeddings
- [x] Backfill для существующих видео
- [x] `findSimilarVideos` (mode: visual + both с RRF merge) — [tool doc](./4-find-similar-videos-tool.md)
- [x] Тесты

---

### Battle Testing — `findSimilarVideos`

→ Перенесено в [tool doc](./4-find-similar-videos-tool.md#battle-testing). Visual mode (own + competitor) и Packaging mode battle-tested. Both mode (RRF merge) ещё не проверен.

← YOU ARE HERE

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

Существующие инструменты организованы в 3 слоя (подробнее: [Telescope Pattern](../README.md)):

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

**Решение: глобальная коллекция `globalVideoEmbeddings`.**

Embeddings — это поисковый индекс, а не source data. Как индекс в базе данных: хранится отдельно от таблицы, можно пересоздать из исходных данных в любой момент. Хранить их прямо в video documents — антипаттерн: каждое чтение видео (для фильтрации, отображения) тащило бы лишние ~6KB embedding данных.

**Почему глобальная, а не per-user:** embedding видео зависит только от контента видео (title, tags, thumbnail) — не от того, какой пользователь его отслеживает. Если 50 пользователей отслеживают MrBeast, embedding для каждого видео MrBeast генерируется **один раз**, а не 50. Это content-addressable index — как CDN: один blob, множество указателей.

**Как handler находит "свои" видео:** при вызове `findSimilarVideos` handler читает список `trendChannelIds` текущего пользователя из Firestore, затем использует `where("youtubeChannelId", "in", channelIds)` для pre-filter перед vector search. Firestore `in` поддерживает до 30 значений за запрос — при >30 каналах запросы batched (ceil(N/30) параллельных запросов, merge результатов по distance). Доступ через Cloud Functions (admin SDK) — security rules не нужны.

**Own-video thumbnail resolution:** для собственных видео с `custom-*` ID handler извлекает `publishedVideoId` из Firestore и использует его для скачивания YouTube thumbnail'а (visual embedding). Для custom-видео без `publishedVideoId` (черновики) — visual search недоступен, handler возвращает packaging-only fallback.

**Firestore vector storage:** embedding'и записываются через `FieldValue.vector()` (не plain `number[]`) — это обязательное условие для работы Firestore `findNearest()` vector search.

**Альтернативы, которые были рассмотрены и отклонены:**
- **Per-user embedding collection** (`users/{userId}/trendVideoEmbeddings/`) — дублирует и хранение, и API-вызовы per user. При 50 пользователях с 30% overlap каналов: 400K embedding docs вместо 8K, $96 backfill вместо $1.92. Не масштабируется
- **Vectors на video docs** — collection name `videos` слишком generic для collection group query; документы раздуваются; collection group + findNearest не задокументирован в Firebase docs
- **Внешняя vector DB (Pinecone, Weaviate)** — overkill на 8000 документов, лишняя инфраструктура и billing
- **In-memory в Cloud Function** — 8000 reads при каждом вызове, не масштабируется
- **Post-filter (findNearest без pre-filter, фильтрация в коде)** — при росте коллекции over-fetch растёт неограниченно: если юзер отслеживает 8% коллекции, нужен limit ≈ 20/0.08 = 250, чтобы надёжно получить 20 результатов. Pre-filter на уровне index — точнее и эффективнее

**Firestore security rules (defence in depth):** глобальная коллекция доступна ТОЛЬКО через Cloud Functions (admin SDK). Client-side доступ запрещён явно:
```
match /globalVideoEmbeddings/{docId} {
  allow read, write: if false;
}
```
Аналогично для `system/embeddingBudget` — admin-only.

```
Firestore path:
  globalVideoEmbeddings/{youtubeVideoId}

Глобальная top-level коллекция. Одна копия per unique video — shared
между всеми пользователями, которые отслеживают канал этого видео.
YouTube video ID глобально уникален, коллизий быть не может.

Поля:
  videoId: string                      // YouTube video ID (= document ID)
  youtubeChannelId: string             // YouTube channel ID (для pre-filter в vector search)
  channelTitle: string                 // денормализовано для результатов поиска
  title: string                        // заголовок видео (денормализовано)
  tags: string[]                       // теги (денормализовано)
  viewCount: number                    // просмотры (обновляется при sync — первый sync пишет, последующие merge)
  publishedAt: string                  // дата публикации
  thumbnailUrl: string                 // URL обложки (для re-generation визуального embedding)
  packagingEmbedding: vector(768)      // [Этап 2] из title + tags + description (gemini-embedding-001, MRL 768d)
  packagingEmbeddingVersion: number    // версия модели packaging embedding
  thumbnailDescription: string | null  // [Этап 2] текстовое описание обложки (Gemini Flash Vision, для AI-контекста)
  visualEmbedding: vector(1408)        // [Этап 3] из thumbnail напрямую (multimodalembedding@001, Vertex AI)
  visualEmbeddingVersion: number       // версия модели visual embedding
  failCount: number                    // consecutive failures (reset to 0 on success, warn at ≥3)
  updatedAt: number                    // timestamp последнего обновления
```

**Channel scoping через batched pre-filter:**

```
findSimilarVideos(userId, queryVector, mode, limit):
  1. youtubeChannelIds = getUserTrendChannelIds(userId) // [ch1, ch2, ..., chN] — YouTube channel IDs
  2. batches = chunk(youtubeChannelIds, 30)             // Firestore "in" limit = 30
  3. Параллельные запросы:
     batch.map(ids =>
       globalVideoEmbeddings
         .where("youtubeChannelId", "in", ids)
         .findNearest(field, queryVector, { limit: limit * 3 })
     )
  4. Merge all results → sort by distance → take top `limit`
```

- **≤30 каналов** (текущий дизайн): 1 запрос, zero overhead
- **31-60 каналов**: 2 параллельных запроса, merge
- **61-90 каналов**: 3 параллельных запроса, merge
- Merge корректен: distance metric одинаковая во всех batch'ах (один embedding space), sort by distance даёт глобально правильный ranking
- `limit * 3` per batch — over-fetch для качественного merge (из 3× кандидатов гарантированно хватит для top `limit`)

**Firestore vector search:**
- `findNearest()` с cosine distance — pre-filter по `youtubeChannelId` через composite vector index
- Flat index (точный KNN) — оптимален до ~50K документов. При >50K — переключение на HNSW (см. "Vector Index Scaling Plan")
- `packagingEmbedding`: 768d (`gemini-embedding-001` с `outputDimensionality: 768`, MRL). MRL позволяет использовать 768d с <2% потери качества vs 2048d — industry standard для коротких текстов (title + tags). Оставляет headroom до лимита Firestore (2048)
- `visualEmbedding`: 1408d (`multimodalembedding@001`, Vertex AI). Прямые image embeddings без текстового промежуточного шага
- Max 1000 результатов на запрос (хватает с запасом)
- Стоимость одного поиска: 20 reads × $0.06/100K = **$0.000012** — практически бесплатно

**Query vector — своё видео vs конкурентное:**

`findSimilarVideos` принимает videoId. Источник query vector зависит от того, чьё это видео:

- **Конкурентное видео** (есть в `globalVideoEmbeddings`): query vector читается из документа (~50ms Firestore read). Никаких API вызовов
- **Своё видео** (нет в `globalVideoEmbeddings`): query vector генерируется на лету:
  - `mode: packaging` → загрузить title+tags+description из Firestore → вызвать `gemini-embedding-001` (~500ms)
  - `mode: visual` → скачать thumbnail → base64 → вызвать `multimodalembedding@001` (~500ms)
  - `mode: both` → оба вызова параллельно

Latency для своего видео выше (~500ms vs ~50ms), но это незаметно для пользователя — tool call в chat и так занимает 1-3 секунды

**Денормализованные поля и синхронизация:**
- `title`, `tags`, `viewCount` дублируются — обновляются при каждом batch `embeddingSyncBatch` через `processOneVideo` (не sync pipeline — полная изоляция)
- Embedding пересоздаётся только при изменении title/tags/description (не при каждом обновлении viewCount)
- Скрытые видео (hiddenVideos): в глобальной коллекции не фильтруются — скрытие per-user. Handler фильтрует hidden videos конкретного пользователя **после** vector search, при выдаче результатов
- `packagingEmbeddingVersion` / `visualEmbeddingVersion` — раздельные версии для каждой модели. При обновлении одной модели пересоздаются только соответствующие embeddings, а не все

**Lifecycle management (глобальная коллекция):**
- **Создание + обновление:** исключительно через `scheduledEmbeddingSync`. Sync pipeline НЕ пишет в `globalVideoEmbeddings` — полная изоляция. EmbeddingSync сам обнаруживает видео (collection group query на `trendChannels` → unique channels → video docs), сам создаёт docs, сам генерирует embeddings, сам обновляет денормализованные поля. Стоимость discovery: ~8K reads/день = $0.005
- **Удаление:** НЕ удалять при удалении trend channel пользователем — другие пользователи могут отслеживать тот же канал. Periodic cleanup: отдельный scheduled job (раз в неделю):
  ```
  cleanupOrphanedEmbeddings():
    1. activeChannelIds = collection group query на trendChannels
         across ALL users → Set of unique youtubeChannelIds
    2. embeddingChannelIds = globalVideoEmbeddings
         → distinct youtubeChannelId
    3. orphaned = embeddingChannelIds - activeChannelIds
    4. For each orphaned channelId:
         → where("youtubeChannelId", "==", channelId) → batch delete
  ```
  Стоимость ошибки = 0 (doc пересоздастся при следующем запуске scheduledEmbeddingSync). **Важно:** проверяем ALL users, а не только того, кто удалил канал — другие могут отслеживать тот же канал

**View deltas в `findSimilarVideos`:** дельты (24h/7d/30d) НЕ хранятся в embedding doc — вычисляются runtime через `trendSnapshotService.getViewDeltas()` после vector search (тот же pipeline, что в `browseTrendVideos` и `getMultipleVideoDetails`). View deltas per-user (у каждого свои snapshots), embedding doc — глобальный. Это сохраняет embedding doc как чистый поисковый индекс, без дублирования delta-логики.

Graceful degradation: если канал добавлен недавно и snapshots ещё нет — deltas приходят как `null` (не `0`), чтобы LLM различал "нет данных" и "нулевой рост". Это уже реализованное поведение в `shared/viewDeltas.ts`.

**Осознанный trade-off:** дублирование минимального набора полей (title, viewCount) в обмен на чистые поисковые запросы без joins. Всё, что меняется часто или вычисляется из других источников (дельты) — обогащается в runtime. При этом API-вызовы для генерации embeddings — ровно один раз per unique video, независимо от количества пользователей.

### Cost & Rate Limits

Этап 2+3 выполняют 3 операции на каждую обложку (2 и 3 — параллельно):

| Операция | Стоимость за 1 | Backfill 8000 | Модель |
|---|---|---|---|
| Visual embedding (картинка → вектор) | $0.0001 | **$0.80** | `multimodalembedding@001` (Vertex AI) |
| Thumbnail description (картинка → текст) | ~$0.0001 | **$0.80** | Gemini 2.0 Flash (low res) |
| Packaging embedding (текст → вектор) | ~$0.00004 | **$0.30** | `gemini-embedding-001` |
| **Итого за Этапы 2+3** | | **~$1.90** | *(prices as of March 2026, [Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/pricing) / [Gemini API](https://ai.google.dev/gemini-api/docs/pricing))* |

- **Global budget safeguard:** единый Firestore-счётчик `system/embeddingBudget` отслеживает расходы всей системы (все пользователи, sync + backfill). Поля: `currentMonth`, `totalEstimatedCost` (atomic increment при каждом API call), `monthlyLimit: 5.00` (default), `alertTriggered: boolean`. При достижении **100%** лимита — автоматическая остановка (`functions.logger.error`), функция не тратит деньги до ручного сброса. При **80%** — `functions.logger.warn` + запись `alertTriggered: true` в doc. **Как увидеть alert:** сейчас — логи в Firebase Console (Functions → Logs, фильтр по severity WARNING/ERROR). В будущем, когда появится полноценный мониторинг (Production Readiness Roadmap), structured logs автоматически подхватятся Cloud Monitoring → email/Slack alerts. Стоимость одного backfill (8K unique videos) = ~$1.90 — далеко от $5, safeguard защищает от runaway при массовом re-embed или ошибки в pipeline
- **Rate limits:** `multimodalembedding@001` — 120-600 RPM (зависит от региона). При 120 RPM backfill 8000 обложек ≈ 67 минут. Backfill работает батчами с уважением к rate limits
- **Ongoing cost:** после backfill — только новые unique видео (5-20 в день across всех каналов в системе, не per user). ~$0.15/мес на все 3 операции. При 50 пользователях — те же $0.15/мес (глобальная коллекция, видео embed'ится один раз)
- **Idempotency:** backfill пропускает видео, у которых уже есть `visualEmbedding` нужной версии. Можно остановить и перезапустить безопасно
- **Partial failure:** если Vertex AI не может обработать обложку (битый URL, content policy) → `visualEmbedding: null`, embedding sync не блокируется. Видео остаётся доступным для packaging search (Этап 2), но не для visual search
- **Vertex AI setup:** разовая настройка выполнена — API enabled, IAM `Vertex AI User` granted, SDK installed

### Thumbnail download pipeline

`multimodalembedding@001` принимает **base64-encoded bytes** или **GCS URI**, но не HTTP URL. Pipeline скачивает thumbnail по HTTP, конвертирует в base64 и отправляет в Vertex AI. Используется максимальное доступное разрешение (больше деталей → точнее embedding, стоимость фиксированная за картинку):

```
Fallback chain:
  maxresdefault.jpg (1280×720)  → лучшее качество, не всегда доступен
  sddefault.jpg (640×480)       → fallback
  mqdefault.jpg (320×180)       → гарантированно есть у всех видео
```

Edge cases: 404 (удалённое видео), redirect, невалидный MIME type → `visualEmbedding: null`, видео остаётся доступным для packaging search.

### RRF Merge Details (mode: both)

Параметры Reciprocal Rank Fusion для комбинированного поиска:
- `k = 60` (standard, balances top-heavy vs uniform weighting)
- `limit_per_search = 100` (каждый поиск возвращает top-100 перед merge)
- `merge_mode = union` (результат может быть в одном ИЛИ обоих списках, чтобы не терять видео, похожие только текстово или только визуально)
- `final_limit = 20` (default, сколько возвращать пользователю)
- Formula: `score(d) = Σ 1/(k + rank_i(d))`. Если d в обоих списках: `1/(60+rank_packaging) + 1/(60+rank_visual)`. Если только в одном: `1/(60+rank_i) + 0`
- RRF не зависит от масштаба similarity scores из разных embedding spaces — математически корректнее, чем weighted average

### Vector Index Scaling Plan

**Текущее:** flat index (exact KNN) — оптимален до ~50K документов в `globalVideoEmbeddings`.

**Пороги масштабирования:**

| Документов | Index type | Latency | Действие |
|---|---|---|---|
| <50K | Flat (exact KNN) | <100ms | Как есть |
| 50K-200K | HNSW (approximate NN) | <50ms | Пересоздать index с `"hnsw":{}` вместо `"flat":"{}"` |
| 200K+ | Dedicated vector DB | <20ms | Рассмотреть Vertex AI Vector Search или Pinecone |

**Trigger для перехода:** p99 `findNearest` latency > 500ms, или > 30K docs (proactive).

**Миграция flat → HNSW:**
1. Создать новый HNSW index (Firestore поддерживает оба параллельно)
2. Benchmark recall@10 на production data — ожидаемо >98% для HNSW
3. Удалить flat index после подтверждения качества

### Embedding generation (Этап 2+)

**Decoupled от video sync.** Embedding generation — best-effort операция. Video sync — critical path (без свежих данных все инструменты показывают stale data). Смешивать их в одном execution context — антипаттерн: API slowdown или rate limit при embedding generation не должен влиять на sync.

```
scheduledSync (00:00 UTC) — БЕЗ ИЗМЕНЕНИЙ
  → SyncService.syncChannel()
    → YouTube API → save videos to Firestore
    → save snapshots, update channel stats
    → DONE (не знает про globalVideoEmbeddings)

scheduledEmbeddingSync (00:30 UTC) — ПОЛНОСТЬЮ АВТОНОМНЫЙ Cloud Scheduler
  Thin launcher → Cloud Task chain:
  1. Discovery: collection group query на trendChannels → unique YouTube channel IDs
  2. Для каждого unique канала: прочитать video docs → собрать полный список
  3. Записать `system/syncState` (channelPaths, videos[], atomic counters, coverageByChannel с totals)
  4. Enqueue первый batch → embeddingSyncBatch(offset: 0)

embeddingSyncBatch(offset) — self-chaining batch processor:
  1. Прочитать `system/syncState`, нарезать batch из 100 видео по offset
  2. Budget check → если исчерпан: update totalSkippedBudget, finalize, стоп
  3. processOneVideo(video) для каждого видео в батче (pLimit(10)):
     → download thumbnail ONCE
     → В ПАРАЛЛЕЛИ:
       ├─ generatePackagingEmbedding(title+tags+desc)     // gemini-embedding-001 (768d MRL)
       ├─ generateThumbnailDescription(videoId, buffer)   // Gemini Flash Vision
       └─ generateVisualEmbedding(videoId, buffer)        // multimodalembedding@001 (Vertex AI)
     → save to globalVideoEmbeddings/{videoId} (embeddings wrapped in `FieldValue.vector()` for Firestore vector search)
  4. Update syncState counters + per-channel coverage atomically (FieldValue.increment)
  5. If есть ещё videos → enqueue Cloud Task: embeddingSyncBatch(offset+100)
  6. If последний batch → finalize: read coverage from syncState → write embeddingStats + notifications + delete syncState
```

**Полная изоляция от sync pipeline:**
- Video sync pipeline **не меняется и не знает про embeddings** — zero coupling, zero risk
- EmbeddingSync сам обнаруживает видео, сам создаёт docs, сам генерирует embeddings
- Собственный timeout и memory — настраивается независимо от sync
- 30-минутная задержка embeddings — незаметна (chat tool call не real-time)
- Обрабатывает unique videos across ALL users — максимальная дедупликация
- Если embedding function упала — видео data свежая, все инструменты кроме `findSimilarVideos` работают нормально
- Стоимость discovery (Firestore reads): ~8K reads/день = **$0.005** — ничтожно

**Два разных SDK для embedding generation:**
- Packaging + descriptions (Этап 2): `@google/genai` (Gemini API, API key) — уже в проекте
- Visual (Этап 3): `@google-cloud/aiplatform` (Vertex AI, service account ADC)

**Self-chaining паттерн (общий для sync и backfill):**

И daily sync, и backfill используют один и тот же паттерн Cloud Task chain. Cloud Functions timeout = 540 секунд. 8000+ видео за один вызов невозможно. Решение — каждый batch обрабатывает 100 видео и ставит в очередь следующий:

```
batch(offset: 0):
  1. Взять 100 videos начиная с offset
  2. processOneVideo() для каждого (download thumbnail once, generate embeddings)
  3. Check budget safeguard → stop if limit reached
  4. If есть ещё videos → enqueue Cloud Task: batch(offset: 100)
  5. DONE (следующий batch подхватит Cloud Task worker)
```

- `processOneVideo()` — shared между sync и backfill: единая логика per-video (DRY)
- `taskQueue.ts` — shared `enqueueBatch()` + `pLimit()` (zero npm dependencies)
- Thumbnail скачивается **один раз** и передаётся buffer'ом в description + visual генераторы
- Каждый batch (~100 videos) ≈ 5 минут → укладывается в 540s timeout
- Idempotent: если batch упал, Cloud Task retry подхватит
- Budget safeguard проверяется перед каждым batch
- Стоимость Cloud Tasks: **бесплатно** (первые 1M задач/мес), Cloud Function execution: **~$0.02** total
- Запускается вручную (HTTP call), не автоматически

**Resilience (и daily, и backfill):** каждое видео обрабатывается независимо в `processOneVideo()` с `try/catch`. Если Gemini API или Vertex AI недоступен для конкретного видео → ошибка логируется, следующее видео обрабатывается нормально. Embeddings останутся null до следующего запуска. Thumbnail скачивается один раз и передаётся buffer'ом — нет двойных HTTP-запросов.

Для persistent failures: embedding doc хранит `failCount: number`. При ошибке — increment. При `failCount >= 3` → `logger.warn("processOneVideo:persistentFailure", { videoId })`. При успешной генерации — reset to 0.

### Observability (Этап 2+)

**Принцип: ни одна ситуация не должна быть "тихой". Каждый запуск пишет structured summary, аномалии пишут warning.**

**Structured summary log — каждый запуск `scheduledEmbeddingSync`:**

**Structured log — launcher (`scheduledEmbeddingSync`):**

```
logger.info("scheduledEmbeddingSync:stateWritten", { channels: 36, totalVideos: 8200 })
logger.info("scheduledEmbeddingSync:launched", { totalVideos: 8200, batchSize: 100, totalBatches: 82 })
```

**Structured log — каждый batch (`embeddingSyncBatch` / `backfillEmbeddings`):**

```
logger.info("embeddingSyncBatch:batchComplete", {
  batch: 12,                // номер batch
  batchGenerated: 15,       // успешно в этом batch
  batchFailed: 2,           // ошибки в этом batch
  totalProcessed: 1300,     // total к этому моменту
  totalRemaining: 6900,
  estimatedCost: 0.0036
})
```

**Structured log — финализация:**

```
logger.info("embeddingSync:complete", { totalProcessed: 8200, totalVideos: 8200 })
// + writes system/embeddingStats (per-channel coverage) + sends notifications
```

**Anomaly warnings (автоматические):**

| Условие | Log level | Message | Что значит |
|---|---|---|---|
| `discovered == 0` | `warn` | `scheduledEmbeddingSync:noVideosFound` | Баг в discovery query или нет trend channels |
| Video list >12K | `warn` | `scheduledEmbeddingSync:videoListLarge` | Canary: syncState doc приближается к 1MB Firestore limit |
| Channel path missing | `warn` | `embeddingSyncBatch:missingChannelPath` | Inconsistency в syncState |
| Video doc not found | `warn` | `embeddingSyncBatch:videoDocNotFound` | Видео удалено между discovery и batch |
| >10% failure rate | `warn` | `embeddingSync:highFailureRate` | Systemic issue (API outage?) — проверить логи |
| Видео падает 3+ раза | `warn` | `processOneVideo:persistentFailure` | Конкретное видео требует ручного разбора |
| Thumbnail недоступен | `warn` | `processOneVideo:thumbnailUnavailable` | Удалённое/private видео (packaging OK, visual skip) |
| Budget exhausted | `info` | `embeddingSyncBatch:budgetExhausted` | Hard stop, chain остановлена |
| Budget 80% | `warn` | `embeddingBudget:thresholdReached` | Скоро hard stop |
| Budget 100% | `error` | `embeddingBudget:limitReached` | Hard stop подтверждён |
| Backfill chain done | `info` | `backfill:complete` | Summary: total processed, total videos |

**Где смотреть:** Firebase Console → Functions → Logs. Фильтр по `embeddingSyncBatch:`, `processOneVideo:`, или `backfill:` для поиска конкретных событий. Structured fields позволяют фильтровать по severity (WARNING/ERROR) для быстрого обнаружения проблем.

### Embedding model migration (Этап 2+)

Embeddings из разных моделей **несовместимы** — нельзя сравнивать вектор из `gemini-embedding-001` с вектором из `gemini-embedding-002`. Смешанные версии в `findNearest()` = мусорные результаты.

**Стратегия при обновлении модели:**
1. Обновить константу `CURRENT_PACKAGING_MODEL_VERSION` (или `VISUAL_`)
2. Запустить backfill — re-embed все видео новой моделью (через Cloud Task chain `backfillEmbeddings`)
3. **Во время миграции:** `findNearest()` с pre-filter `where('packagingEmbeddingVersion', '==', CURRENT_VERSION)` — видео со старой версией не участвуют в поиске. Coverage metadata честно показывает `indexed: 3000, total: 8000` → LLM предупреждает пользователя о неполноте
4. После полного re-embed: все docs имеют новую версию, поиск работает на 100%

**Для `globalVideoEmbeddings`:** при смене модели — запустить `backfillEmbeddings` (Cloud Task chain). Функция видит `packagingEmbeddingVersion != CURRENT` → re-generate. Процесс идентичен initial backfill, но triggered by version mismatch. Daily `scheduledEmbeddingSync` тоже подхватит оставшиеся (если backfill не завершился)

### Firestore vector indexes (Этап 2+)

```bash
# Packaging embedding — composite index для where("youtubeChannelId", "in", [...]) + findNearest
# 768d, gemini-embedding-001 с MRL
gcloud firestore indexes composite create \
  --collection-group=globalVideoEmbeddings \
  --query-scope=COLLECTION \
  --field-config=order=ASCENDING,field-path=youtubeChannelId \
  --field-config field-path=packagingEmbedding,vector-config='{"dimension":"768","flat":"{}"}' \
  --database=DEFAULT

# Visual embedding — composite index для where("youtubeChannelId", "in", [...]) + findNearest
# 1408d, multimodalembedding@001 via Vertex AI
gcloud firestore indexes composite create \
  --collection-group=globalVideoEmbeddings \
  --query-scope=COLLECTION \
  --field-config=order=ASCENDING,field-path=youtubeChannelId \
  --field-config field-path=visualEmbedding,vector-config='{"dimension":"1408","flat":"{}"}' \
  --database=DEFAULT
```

Два индекса вместо четырёх: composite index (`youtubeChannelId` + vector) покрывает и per-channel (`where ==`), и cross-channel (`where in`) запросы. Отдельный "cross-channel without pre-filter" индекс не нужен — pre-filter по каналам пользователя обязателен.

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
- `findSimilarVideos` ищет только среди видео с embeddings в `globalVideoEmbeddings`
- Ответ содержит coverage metadata — LLM видит, что покрытие неполное:
  - `mode: packaging` → `coverage: {indexed: 7500, total: 8000}` (total = количество видео в каналах пользователя)
  - `mode: visual` → `coverage: {indexed: 7200, total: 8000}` (visual может покрывать меньше — битые thumbnail URLs)
  - `mode: both` → `coverage: {packaging: {indexed: 7500, total: 8000}, visual: {indexed: 7200, total: 8000}}`
- Видео без embeddings остаются доступными через `browseTrendVideos` (text filters), просто не участвуют в semantic search
- Coverage считается per-user: `total` = видео в каналах ЭТОГО пользователя, `indexed` = из них присутствующие в `globalVideoEmbeddings` с non-null embedding

#### Пустые результаты

- `browseTrendVideos` с фильтрами, которым ничего не соответствует → `{videos: [], totalMatched: 0}`. Не ошибка, а валидный ответ ("конкуренты ничего не публиковали в этом окне")
- `getNicheSnapshot` для даты, когда ни один конкурент не публиковал → пустой `competitorActivity`, `aggregates` с нулями. LLM сам интерпретирует: "тишина в нише"

### Связь со Stage 6 (Chat README)

В [Chat README](../../README.md) Stage 6 (RAG + Visual Context) содержит TODO:
- Visual descriptions (batch vision → thumbnail descriptions) — это наш Этап 3
- Vector search (embedding → semantic search) — это наш Этап 2

Competitive Intelligence естественно завершает Stage 6, добавляя vector search и visual descriptions конкретно для данных конкурентов из Trends.

### Файлы

**Этап 1:**
```
shared/
  percentiles.ts                ← SSOT percentile алгоритм (frontend + backend)

functions/src/services/tools/
  handlers/
    listTrendChannels.ts
    browseTrendVideos.ts
    getNicheSnapshot.ts
  utils/
    getHiddenVideoIds.ts        ← hidden video filter
    normalizeLastUpdated.ts     ← consistent dataFreshness formatting
  definitions.ts                ← tool definitions (4 Layer 4 tools)
  executor.ts                   ← tool routing

docs/features/chat/tools/layer-4-competition/
  1-list-trend-channels-tool.md
  2-browse-trend-videos-tool.md
  3-get-niche-snapshot-tool.md
```

**Этап 2:**
```
functions/src/embedding/
  types.ts                      ← EmbeddingDoc, EmbeddingStats, SyncState, BackfillState, constants
  packagingEmbedding.ts         ← text embedding generation (gemini-embedding-001, 768d MRL)
  thumbnailDescription.ts       ← thumbnail description (Gemini Flash Vision, accepts pre-downloaded buffer)
  visualEmbedding.ts            ← image embedding (multimodalembedding@001, Vertex AI, 1408d, accepts buffer)
  processOneVideo.ts            ← shared per-video logic: download thumbnail once → generate all embeddings
  embeddingSync.ts              ← discoverChannels() — collection group query → unique YouTube channels
  scheduledEmbeddingSync.ts     ← thin launcher: discovery → write syncState → enqueue first batch (cron 00:30 UTC)
  embeddingSyncBatch.ts         ← self-chaining batch processor via Cloud Tasks (batch → counters → chain/finalize)
  backfillEmbeddings.ts         ← Cloud Task chain for backfill (uses processOneVideo + taskQueue)
  taskQueue.ts                  ← shared Cloud Tasks helper (enqueueBatch, pLimit concurrency limiter)
  budgetTracker.ts              ← global budget safeguard (system/embeddingBudget, $5/month)
  vectorSearch.ts               ← batched pre-filter + findNearest + merge

functions/src/services/tools/handlers/
  findSimilarVideos.ts          ← mode: packaging

```

**Этап 3:**
```
functions/src/embedding/
  rrfMerge.ts                   ← Reciprocal Rank Fusion (pure utility)

functions/src/services/tools/handlers/
  findSimilarVideos.ts          ← расширение: mode: visual | both (RRF merge)

docs/features/chat/tools/layer-4-competition/
  4-find-similar-videos-tool.md ← tool doc (все 3 режима)
```
