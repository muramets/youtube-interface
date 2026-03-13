# AI Tool: analyzeTrafficSources — Feature Doc

## Текущее состояние

**Реализовано.** Telescope Pattern Layer 3 — gateway. AI вызывает `analyzeTrafficSources`, получает per-source breakdown (Browse, Suggested, Search, External) с timeline и pre-computed deltas. Если Suggested traffic доминирует — LLM переходит к drill-down через `analyzeSuggestedTraffic`.

**Snapshot count denormalization:** `trafficSourceSnapshotCount` записывается на документ видео при каждом create/delete снэпшота и при входе в Traffic Sources таб (lazy sync). Tool description указывает LLM проверять это поле в `getMultipleVideoDetails` перед вызовом.

---

## Что это

Gateway-тул для анализа трафика. Отвечает на вопрос *"Откуда приходит трафик к видео?"* — агрегированная разбивка по источникам (Suggested videos, Browse features, YouTube search, External, etc.) с динамикой по снэпшотам.

### Отличие от analyzeSuggestedTraffic

| | **analyzeTrafficSources** (этот тул) | **analyzeSuggestedTraffic** |
|---|---|---|
| **Вопрос** | Откуда приходит трафик? | Рядом с какими видео YouTube рекомендует моё? |
| **Данные** | Агрегированные метрики по источникам | Конкретные видео (с video ID) |
| **Строк в CSV** | ~11 (Suggested, Browse, Search, Direct, External...) | 50-500 (каждое видео отдельно) |
| **Firestore doc** | `trafficSource/main` | `traffic/main` |
| **Роль** | Gateway — общая картина | Drill-down — если Suggested доминирует |

---

## User flow

1. Пользователь: *"Откуда приходит трафик к моему видео?"*
2. LLM проверяет `trafficSourceSnapshotCount` из `getMultipleVideoDetails` → > 0
3. LLM вызывает `analyzeTrafficSources(videoId)`
4. Handler: Firestore → Cloud Storage → parse → timeline → JSON
5. LLM видит: *"80% — Suggested, 12% — Browse, 5% — Search"*
6. Если Suggested доминирует → LLM вызывает `analyzeSuggestedTraffic` для drill-down

---

## Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `videoId` | string (required) | ID видео для анализа |

---

## Что возвращает

```typescript
{
    sourceVideo: { videoId, title },
    snapshotTimeline: [{ date, label, totalSources }],
    sources: [{
        source: string,              // "Suggested videos", "Browse features", etc.
        views: number,
        impressions: number,
        ctr: number,
        avgViewDuration: string,
        watchTimeHours: number,
        timeline: [{
            date, label,
            views, impressions, ctr, avgViewDuration, watchTimeHours,
            deltaViews, deltaImpressions,  // pre-computed vs previous snapshot
        }],
    }],
    totalTimeline?: [{               // aggregate totals per snapshot
        date, label,
        views, impressions, ctr, watchTimeHours,
        deltaViews, deltaImpressions,
    }],
}
```

---

## Связанные фичи

- [Telescope Pattern Overview](../README.md) — архитектура tool chain
- [analyzeSuggestedTraffic](./2-analyze-suggested-traffic-tool.md) — drill-down после этого gateway
- [getMultipleVideoDetails](../layer-2-detail/1-get-multiple-video-details-tool.md) — `trafficSourceSnapshotCount` для pre-check
- [Traffic Sources UI](../../../video-details/traffic-sources.md) — откуда берутся CSV

---

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### Характеристики реальных данных

Реальный CSV этого видео содержит **11 источников** (не 6-8, как предполагалось):

| Источник | Views | % total | Impressions | CTR |
|----------|------:|--------:|------------:|----:|
| Suggested videos | 33,436 | 61% | 382,266 | 3.2% |
| Browse features | 17,864 | 33% | 325,578 | 4.9% |
| Direct or unknown | 1,989 | 3.6% | — | — |
| Other YouTube features | 830 | 1.5% | — | — |
| Playlists | 293 | 0.5% | 2,070 | 6.3% |
| External | 115 | 0.2% | — | — |
| Channel pages | 111 | 0.2% | 1,594 | 5.8% |
| YouTube search | 63 | 0.1% | 500 | 7.8% |
| End screens | 33 | <0.1% | — | — |
| Notifications | 14 | <0.1% | — | — |
| Video cards | 3 | <0.1% | — | — |

**Ключевые свойства:**
- **Power law:** Suggested + Browse = **94% views**. Остальные 9 источников — длинный хвост
- **5 из 11 без impressions/CTR** (Direct, Other, External, End screens, Notifications, Video cards) — YouTube не возвращает эти метрики для этих источников
- **CTR инвертирован к объёму:** YouTube search (7.8%) >> Browse (4.9%) >> Suggested (3.2%) — маленькие источники конвертируют лучше

### Масштаб данных при 9 снэпшотах (реальный trace)

Реальный tool result: 10 источников × 9 снэпшотов:
- **90 timeline points** + **9 totalTimeline** + **9 snapshotTimeline**
- **~18,000 символов JSON ≈ 5,800 токенов** (38% контекста итерации, 7.6% context window)
- В пределах бюджета — модель не "утонула" в числах

Дельты pre-computed только между соседними снэпшотами. Модель НЕ получает:
- Share (%) — должна сама разделить source views на total views
- Агрегат "первый → последний" — должна сама посчитать общий тренд
- Rate of change (ускорение/замедление) — должна сама сравнить дельты между собой

### План проверки

| # | Сценарий | Что проверяет | Промпт-идея | Проверено |
|---|----------|---------------|-------------|-----------|
| 1 | **Happy path (1-2 snapshots)** | Базовый разбор: видит ли модель доли источников, считает ли share % | "Откуда приходит трафик к моему видео [X]?" | — |
| 2 | **Timeline (9 snapshots)** | Интерпретация длинной timeline: тренды, замедление, shift | "Как менялись источники трафика у [X] со временем?" | ✅ |
| 3 | **Gateway → drill-down** | Цепочка analyzeTrafficSources → analyzeSuggestedTraffic | "Разбери трафик [X] и покажи откуда идут рекомендации" | — |
| 4 | **No data (snapshotCount = 0)** | Проверяет ли модель trafficSourceSnapshotCount перед вызовом | "Откуда трафик у [видео без CSV]?" | ✅† |
| 5 | **Source shift detection** | Видит ли модель смену доминирующего источника в timeline | "Что изменилось в трафике [X] за последний месяц?" | — |
| 6 | **CTR analysis** | Интерпретация impressions vs CTR drift | "Почему трафик [X] замедляется?" | — |
| 7 | **Chained: getMultipleVideoDetails → analyzeTrafficSources** | Pre-check flow (snapshotCount), несколько видео | "Сравни источники трафика у моих последних 3 видео" | — |
| 8 | **Long tail sources** | Упоминает ли модель источники с <1% или игнорирует | (покрыто trace #2) | ✅ |
| 9 | **Missing impressions** | Не выдумывает ли модель CTR для источников без impressions | (покрыто trace #2) | ✅ |
| 10 | **Deceleration pattern** | Видит ли модель что дельты сжимаются | (покрыто trace #2) | ✅ |

### Ключевые вопросы для trace #2 (10+ снэпшотов)

Это центральный тест. При 10 снэпшотах модель получает полную динамику видео за ~10 недель. Что нужно проверить:

1. **Share %** — считает ли модель доли (Suggested 61%, Browse 33%)? Или оперирует только абсолютными числами?
2. **Тренд замедления** — дельты Suggested: 6300 → 5300 → 3300 → 2400 → 1700. Видит ли модель, что рост замедляется? Или говорит "стабильный рост"?
3. **Source shift** — если Browse растёт быстрее Suggested, заметит ли модель crossover point?
4. **CTR drift** — если CTR падает (4.5% → 3.2%) при растущих impressions, скажет ли модель "YouTube показывает больше, но конверсия падает"?
5. **Длинный хвост** — 9 источников с <4% views. Упомянет ли модель их или проигнорирует? Оба варианта допустимы, но cherry-picking одного маленького источника как "инсайт" — плохо
6. **Пустые impressions** — 5 источников без impressions/CTR. Не начнёт ли модель галлюцинировать CTR?
7. **Actionable output** — даст ли модель рекомендации ("сфокусируйся на Browse, CTR выше") или просто перескажет числа?

### Проверено в бою (2026-03-13)

Модель: `claude-haiku-4-5`. Видео: "quiet cottagecore vibes" (custom-1770465649308).

| # | Сценарий | Query | $ | Iter | Tools | Sources | Snaps |
|---|----------|-------|---|------|-------|---------|-------|
| 4† | no data (pre-fix) | "Как менялись источники трафика?" | .016 | 1 | (none) | 0 | 0 |
| 2 | timeline (post-fix) | то же | .023 | 2 | analyzeTrafficSources | 10 | 9 |

**† Trace #4 (pre-fix):** `trafficSourceSnapshotCount` отсутствовал в video card context → Haiku не вызвал tool, попросил "загрузите CSV". Root cause: поле денормализовано на Firestore document, но `VideoCardContext` type и `videoToCardContext()` адаптер его не включали. **Фикс:** добавлены `trafficSourceSnapshotCount` + `suggestedTrafficSnapshotCount` в `VideoCardContext`, `VideoDetails`, `videoToCardContext()`, `debugSendLog`.

**Trace #2 "Как менялись источники трафика со временем?"** — 1 tool call: `analyzeTrafficSources({ videoId: "custom-1770465649308" })`. 10 источников, 9 снэпшотов (24h → 1 month), tool result ~5.8K токенов (18K символов), context window 7.6%.

Данные: Browse features (1,192 views, 63%) доминирует, Suggested videos (553, 29%) второй. 5 из 10 источников без impressions/CTR (Direct, Other, Notifications, External, End screens). Total: 1,901 views за 1 месяц.

### Чеклист интерпретации (trace #2)

| Вопрос | Результат | Что модель сказала |
|--------|-----------|--------------------|
| Share % | ✅ Посчитал | "63% всего трафика (1,192 из 1,901)", "29% трафика" |
| Замедление | ✅ Увидел | "+283 на день 2 → +189 на день 3" (верно: totalTimeline deltas) |
| Source shift | ✅ Косвенно | "Browse доминирует", "Suggested слабеет" — без crossover point |
| CTR сравнение | ✅ Верно | "CTR даже ниже Browse (3.42% против 4.01%)" |
| Long tail | ✅ Разумно | Фокус на top-2, Direct и Search с инсайтами, остальные 6 проигнорированы |
| Missing impressions | ✅ Не галлюцинировал | Не выдумал CTR для Direct/External/Notifications |
| Actionable | ✅ Рекомендации | SEO (Search=5 views), Suggested оптимизация, промо на день 4-5 |

### Паттерны

- **`trafficSourceSnapshotCount` в video card — необходим.** Без него Haiku не начинает tool chain (trace #4†). С ним — вызывает `analyzeTrafficSources` сразу, 0 лишних tool calls. Тот же паттерн инициативы, что в getNicheSnapshot: Haiku не проявляет инициативу, но реагирует на явные сигналы в контексте
- **Share % вычислен без pre-computation.** Модель сама разделила 1192/1901 и 553/1901. Предположение "возможно стоит добавить sharePercent в handler" — не подтвердилось, модель справляется
- **Спекулятивные объяснения — характеристика модели.** "Second wind на день 5-6" — модель нарративизирует дип (day 5 delta=111) → recovery (day 6 delta=244) как "пользователи поделились ссылкой". Данные этого не подтверждают. Можно митигировать system prompt: "base conclusions only on data, do not speculate on causes"
- **5.8K токенов tool result при 10×9 — комфортно.** 38% контекста второй итерации, 7.6% context window. Потенциальная проблема "модель утонет в числах" не реализовалась
- **Все даты одинаковые ("2026-03-05").** Все 9 CSV загружены в один день. Handler выводит дату из `snapshot.timestamp` (момент загрузки). Модель правильно использовала labels (24h, 48h...), а не даты
- **Day mapping путаный.** Модель пишет "День 1-2", "День 3-4" — но labels обозначают кумулятивные периоды (24h = за первые 24 часа). Модель поняла семантику дельт, но пользователь может запутаться в терминологии

### Найденные и исправленные баги

**† trafficSourceSnapshotCount не доходил до модели** (исправлен 2026-03-13)
- **Симптом:** Haiku не вызвал tool, попросил "загрузите CSV" — хотя 9 CSV загружены
- **Root cause:** `VideoCardContext` type + `videoToCardContext()` адаптер не включали поле. Данные есть в Firestore, доходят до `VideoDetails`, но отсекаются при конвертации в video card context
- **Фикс:** добавлены `trafficSourceSnapshotCount` + `suggestedTrafficSnapshotCount` в 4 файла: `youtubeApi.ts` (тип), `appContext.ts` (тип), `videoAdapters.ts` (адаптер), `debugSendLog.ts` (debug console)
- **Урок:** денормализация поля на Firestore document бесполезна, если frontend adapter его не пробрасывает. "LLM tool awareness" должна быть end-to-end: Firestore → type → adapter → context → model

### Ещё не проверено в бою

| Сценарий | Почему важно |
|----------|-------------|
| **Happy path (1-2 snapshots)** | Дельты null — модель не может анализировать динамику, только статику |
| **Gateway → drill-down** | Вызовет ли модель `analyzeSuggestedTraffic` после Browse/Suggested split? |
| **Source shift (Browse → Suggested)** | Видео, где доминирующий источник менялся со временем |
| **CTR drift** | CTR падает при растущих impressions — заметит ли? |
| **Несколько видео** | `getMultipleVideoDetails` → цикл `analyzeTrafficSources` — сколько tool calls? |

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/analyzeTrafficSources.ts` | Handler: resolveVideosByIds → Cloud Storage → parse → timeline → JSON |
| `functions/src/services/tools/utils/resolveVideos.ts` | Shared video resolution (direct + publishedVideoId lookup) |
| `functions/src/services/tools/utils/trafficSourceCsvParser.ts` | CSV parser (Traffic Source format) |
| `functions/src/services/tools/utils/trafficSourceTimeline.ts` | `buildSourceTimeline` — per-source timelines with deltas |
| `functions/src/services/tools/definitions.ts` | Tool declaration |

### Data path

```
Firestore:  users/{uid}/channels/{channelId}/videos/{videoId}/trafficSource/main → snapshots[]
Storage:    storagePath from each snapshot entry → CSV body
```

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/analyzeTrafficSources.test.ts` | — |
| `functions/src/services/tools/utils/__tests__/trafficSourceCsvParser.test.ts` | — |
| `functions/src/services/tools/utils/__tests__/trafficSourceTimeline.test.ts` | — |
