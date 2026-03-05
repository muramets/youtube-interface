# 📊 Context & Token Cost — Обзор архитектуры

## Как формируется контекст (каждое сообщение)

Каждый раз, когда пользователь отправляет сообщение, к AI модели уходит:

```
┌─────────────────────────────────────────────────────────────┐
│  SYSTEM PROMPT (идентичный на каждое сообщение)             │
│                                                             │
│  ┌─ Settings Layer ──────────────────────────────────────┐  │
│  │  Дата, язык, стиль, custom prompt, anti-hallucination │  │
│  │  ~500 токенов                                         │  │
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
  Video: "My Awesome Video" [id: abc123]
  - Views: 150,000 | Published: 2024-01-15 | Duration: 12:34
```

AI видит title + ключевые метрики. Когда нужны details:

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
- **Gemini/Claude видит те же данные** — просто получает их через tool call вместо prompt. Качество ответа не страдает

### Потенциальный риск:
- **Tool call = доп. итерация** — AI тратит ~100ms на вызов tool + ожидание ответа. Если нужно 5 видео, это batch-tool call (`getMultipleVideoDetails`)

---

## Что было реализовано ✅

### Шаг 1: Компактный L1
`formatSingleVideo()` — description и tags убраны из system prompt:
```
- Your Video: "Title" [id: videoId] — Views: 150K | Published: 2024-01-15 | Duration: 12:34
```

### Шаг 2: Batch tool `getMultipleVideoDetails`
Gemini вызывает `getMultipleVideoDetails(videoIds[])` когда нужны полные данные. Ищет в двух коллекциях: `videos/` + `cached_external_videos/`, с YouTube API fallback.

### Шаг 3: Prompt instructions
`VIDEO_CONTEXT_PREAMBLE` и `TRAFFIC_SUGGESTED_HEADER` обновлены — Gemini знает, что description/tags доступны только через tool.

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
│ Gemini: getVideoDetails(v1)  │  ← on-demand
│ Tool: {tags: [...]}          │
│ Gemini: "Your tags are..."   │
└──────────────────────────────┘
```
