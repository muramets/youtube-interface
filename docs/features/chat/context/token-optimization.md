# 📊 Context & Token Cost — Обзор архитектуры

## Текущее состояние ← YOU ARE HERE

**Реализовано.** Compact L1 prompt (title + key metrics, без description/tags) + on-demand details через `getMultipleVideoDetails` tool. Delta enrichment автоматически добавляет рост просмотров (24h/7d/30d). ~75% экономии на input tokens по сравнению с full context.

**Token Transparency интеграция:** каждый компонент контекста (system prompt, tool definitions, history, memory, current message, tool results, images) трекается через `ContextBreakdown` и визуализируется в Token Breakdown panel. Cost alerts предупреждают о дорогих разговорах. Подробности: `docs/features/chat/token-transparency.md`.

---

## Как формируется контекст (каждое сообщение)

Каждый раз, когда пользователь отправляет сообщение, к AI модели уходит:

```
┌─────────────────────────────────────────────────────────────┐
│  SYSTEM PROMPT (идентичный на каждое сообщение)             │
│                                                             │
│  ┌─ Settings Layer ──────────────────────────────────────┐  │
│  │  Дата, язык, стиль, custom prompt,                    │  │
│  │  agentic behavior, anti-hallucination                 │  │
│  │  ~700 токенов                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ L1: Persistent Context ─────────────────────────────┐  │
│  │  Compact: Title + key metrics (views, duration, date) │  │
│  │  Description, Tags → on-demand через tool             │  │
│  │                                                       │  │
│  │  5 видео  → ~500 токенов                             │  │
│  │  50 видео → ~5K токенов                              │  │
│  │  150 видео → ~10K токенов                            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ L4: Cross-Conversation Memory ──────────────────────┐  │
│  │  Insights из прошлых разговоров (если есть)            │  │
│  │  ~500-2K токенов                                      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ИСТОРИЯ СООБЩЕНИЙ                                         │
│                                                             │
│  ┌─ L2: Per-Message Labels ─────────────────────────────┐  │
│  │  [📎 Attached: "My Video" (your video), ...]          │  │
│  │  Метки к каждому сообщению, ~50 chars × N items       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ L3: Summarization ──────────────────────────────────┐  │
│  │  Если история > ~50K токенов → сжатие:                │  │
│  │  [summary] + последние 10 сообщений                   │  │
│  │  Остальные сообщения заменяются summary                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  User: "Сравни CTR моих последних 3 видео"                 │
└─────────────────────────────────────────────────────────────┘
```

**Historical tool results** из прошлых turns также включаются в историю (в provider-native формате) и учитываются `estimateTokens()` при расчёте бюджета. Tool-heavy conversations (~25K chars per `browseTrendVideos`) триггерят L3 summarization раньше. См. [tool-history](./tool-history.md).

---

## Проблема: L1 — главный пожиратель токенов

**System prompt отправляется ЦЕЛИКОМ с КАЖДЫМ сообщением.** Это фундамент LLM API.

| Сценарий | L1 (system prompt) | За 10 сообщений | Стоимость* |
|----------|--------------------|-----------------|-----------|
| 5 видео | ~2K токенов | 20K input tokens | ~$0.005 |
| 50 видео | ~20K токенов | 200K input tokens | ~$0.05 |
| 150 видео | ~42K токенов | 420K input tokens | ~$0.10 |

*\* Gemini 2.5 Pro pricing: $1.25/1M input tokens*

**Ключевая проблема:** Description и Tags составляют 70-80% объёма каждого видео, но AI использует их только когда пользователь спрашивает о конкретном видео.

---

## Как `getMultipleVideoDetails` решает проблему

### До оптимизации: всё в prompt (толстый L1)

```
System Prompt (каждое сообщение):
  Video: "My Awesome Video" [id: abc123]
  - Title: My Awesome Video
  - Views: 150,000
  - Published: 2024-01-15
  - Duration: 12:34
  - Description: Длинное описание на 200 слов...    ← 80% объёма
  - Tags: tag1, tag2, tag3, tag4, tag5...           ← 15% объёма
```

### После оптимизации (реализовано ✅): компактный L1 + on-demand

```
System Prompt (каждое сообщение):
  Video: "My Awesome Video" [id: abc123] — Views: 150K | 24h: +1.2K / 7d: +5.3K | Published: 2024-01-15 | Duration: 12:34
```

AI видит title + ключевые метрики + delta роста просмотров (добавляется автоматически через delta enrichment middleware). Когда нужны details:

```
AI → getMultipleVideoDetails(["abc123"])
Server → {videos: [{description: "...", tags: [...], ...}]}
AI → продолжает ответ с полными данными
```

### Экономия:

| Сценарий | До оптимизации | После (compact L1) | Экономия |
|----------|--------|-------------------|----------|
| 5 видео | ~2K | ~500 + on-demand | ~75% |
| 50 видео | ~20K | ~5K + on-demand | ~75% |
| 150 видео | ~42K | ~10K + on-demand | ~76% |

**За 10 сообщений с 50 видео:** 200K → 50K input tokens.

---

## Влияние на память

### Что НЕ меняется:
- **L2 (per-message labels)** — метки "📎 Attached" остаются
- **L3 (summarization)** — сжатие работает как раньше
- **L4 (cross-conversation)** — insights не зависят от L1

### Что улучшается:
- **L3 trigger реже** — меньший system prompt = больше места для истории → summarization срабатывает позже → больше "свежих" сообщений в контексте
- **AI видит те же данные** — просто получает их через tool call вместо prompt. Качество ответа не страдает (работает одинаково для Gemini и Claude)

### Потенциальный риск:
- **Tool call = доп. итерация** — AI тратит ~100ms на вызов tool + ожидание ответа. Если нужно 5 видео, это batch-tool call (`getMultipleVideoDetails`)

---

## Что было реализовано ✅

### Шаг 1: Компактный L1
Description и tags убраны из system prompt. Формат:
```
- Your Video: "Title" [id: videoId] — Views: 150K | 24h: +1.2K / 7d: +5.3K | Published: 2024-01-15 | Duration: 12:34
```

### Шаг 2: Delta Enrichment
Перед отправкой в AI, middleware автоматически дополняет видео данными о росте просмотров (24h/7d/30d) из trend snapshots. AI видит не только текущие views, но и динамику.

### Шаг 3: Batch tool `getMultipleVideoDetails`
AI вызывает `getMultipleVideoDetails(videoIds[])` когда нужны полные данные. Ищет в двух коллекциях (`videos/` + `cached_external_videos/`), с YouTube API fallback.

### Шаг 4: Prompt instructions
System prompt инструктирует AI, что description/tags доступны только через tool — не нужно угадывать, нужно вызвать `getMultipleVideoDetails`.

---

## Визуальная схема: до и после

```
СЕЙЧАС (каждое сообщение):
┌──────────────────────────────┐
│ System Prompt: 42K tokens    │  ← ДОРОГО
│ ┌──────────────────────────┐ │
│ │ Video 1: title+desc+tags │ │
│ │ Video 2: title+desc+tags │ │
│ │ ...                      │ │
│ │ Video 150: title+desc+tags│ │
│ └──────────────────────────┘ │
│ History: messages             │
│ User: "Compare CTR"          │
└──────────────────────────────┘

ПОСЛЕ ОПТИМИЗАЦИИ (текущее состояние):
┌──────────────────────────────┐
│ System Prompt: 10K tokens    │  ← 4x дешевле
│ ┌──────────────────────────┐ │
│ │ Video 1: title+metrics   │ │
│ │ Video 2: title+metrics   │ │
│ │ ...                      │ │
│ │ Video 150: title+metrics  │ │
│ └──────────────────────────┘ │
│ History: messages             │
│ User: "Compare tags"          │
│ AI: getMultipleVideoDetails([v1]) │ ← on-demand
│ Tool: {tags: [...]}              │
│ AI: "Your tags are..."           │
└──────────────────────────────┘
```

---

## Technical Implementation

**Compact L1:** `src/core/ai/layers/persistentContextLayer.ts` — `formatSingleVideo()` формирует компактную строку.
**Delta enrichment:** `src/core/ai/pipeline/enrichContextWithDeltas.ts` — middleware добавляет 24h/7d/30d delta views.
**Delta computation:** `src/core/utils/computeVideoDeltas.ts` — вычисление дельт из trend snapshots.
**Tool:** `functions/src/services/tools/handlers/getMultipleVideoDetails.ts` — batch fetch + YouTube API fallback.
**Prompts:** `src/core/config/prompts.ts` — `VIDEO_CONTEXT_PREAMBLE`, `TRAFFIC_SUGGESTED_HEADER`.
**Traffic formatting:** `src/core/ai/utils/formatTrafficSources.ts` — pure formatter для traffic sources.

---

## Связанные фичи

- [AI Chat README](../README.md) — общая архитектура чата и memory layers
- [Agentic Architecture](../infrastructure/agentic-architecture.md) — agentic loop, tools
- [Multi-Provider Architecture](../infrastructure/multi-provider.md) — Gemini + Claude

---

## Roadmap

### Реализовано ✅
- [x] Compact L1 (title + key metrics, без description/tags)
- [x] Delta enrichment middleware (24h/7d/30d growth)
- [x] `getMultipleVideoDetails` batch tool (on-demand details)
- [x] Prompt instructions (AI знает про on-demand)

### Следующие шаги
- [ ] **Gemini Context Caching** — при стабильном system prompt 32K+ tokens кэшировать на стороне Google → ~75% экономии на input tokens
- [ ] **Vector Search** — `searchDatabase(query)` для семантического поиска без отправки всех видео в prompt
- [ ] **Claude Auto Compaction** — серверная альтернатива L3 для Claude. Claude сам сжимает контекст внутри API-вызова (без отдельного Gemini Flash запроса). Подробности: [multi-provider.md, Stage 6](../infrastructure/multi-provider.md)
