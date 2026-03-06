# 🤖 Agentic Architecture — как работает AI ассистент

## Текущее состояние

**Реализовано.** AI работает как агент с 7 инструментами. Оба провайдера (Gemini и Claude) используют одинаковый agentic loop: до 10 итераций tool calling за один ответ. Shared batch executor (`executeToolBatch`) + provider-specific image delivery. 9 SSE event types для стриминга.

---

## Простыми словами

Раньше AI работал как **переводчик**: ты даёшь текст → он даёт текст обратно.

Теперь AI работает как **ассистент с набором инструментов**: он может останавливаться посреди ответа, вызывать функции (искать видео, получать данные), видеть результат, и продолжать ответ. Это работает одинаково для обоих провайдеров — Gemini и Claude.

---

## Как это работает (шаг за шагом)

```
Пользователь: "Сравни CTR моих последних 3 видео"

  ┌─────────────────────────────────────────────┐
  │  1. Frontend отправляет сообщение + контекст │
  │     (system prompt с [id: videoId] аннотациями)│
  └────────────────────┬────────────────────────┘
                       ▼
  ┌─────────────────────────────────────────────┐
  │  2. AI начинает отвечать                    │
  │     Вместо текста "Видео #1" — вызывает:    │
  │     mentionVideo(videoId: "abc123")         │
  └────────────────────┬────────────────────────┘
                       ▼
  ┌─────────────────────────────────────────────┐
  │  3. Сервер выполняет tool (executeToolBatch)│
  │     → ищет видео в Firestore                │
  │     → возвращает {title: "My Video", ...}   │
  └────────────────────┬────────────────────────┘
                       ▼
  ┌─────────────────────────────────────────────┐
  │  4. AI получает результат и пишет текст     │
  │     "[My Video](mention://abc123) имеет     │
  │      CTR 8%, что выше среднего..."          │
  └────────────────────┬────────────────────────┘
                       ▼
  ┌─────────────────────────────────────────────┐
  │  5. Frontend парсит mention://abc123        │
  │     → рендерит интерактивный badge с tooltip │
  │     (обложка, метрики, клик = выбор видео)  │
  └─────────────────────────────────────────────┘
```

Этот цикл (шаги 2–4) может повторяться до **10 раз** за один ответ — AI может вызвать несколько tools подряд. Работает одинаково для Gemini и Claude.

---

## Доступные инструменты (Tools)

| Tool | Что делает | Когда используется |
|------|-----------|-------------------|
| `mentionVideo` | Находит видео по ID, возвращает title + ownership | Каждый раз, когда AI ссылается на видео в тексте |
| `getMultipleVideoDetails` | Batch-запрос: description, tags, views для N видео | Когда AI нужна детальная информация (prompt содержит только title + метрики) |
| `viewThumbnails` | Показывает обложки видео как изображения | Когда AI анализирует CTR, дизайн обложек или сравнивает визуально |
| `analyzeTrafficSources` | Анализ источников трафика видео | Когда пользователь спрашивает откуда приходят зрители |
| `analyzeSuggestedTraffic` | Анализ suggested traffic (рекомендации YouTube) | Когда нужен анализ какие видео приносят suggested views |
| `getChannelOverview` | Обзор YouTube канала: подписчики, видео, статистика | Когда AI исследует внешний канал (конкурент, источник трафика) |
| `browseChannelVideos` | Пагинированный список видео канала с метриками | Когда нужен детальный обзор контента канала |

Подробности по каждому tool — в отдельных docs: [Tool Index](./tools/README.md), [viewThumbnails](./tools/view-thumbnails.md), [analyzeSuggestedTraffic](./tools/analyze-suggested-traffic-tool.md).

### Как добавить новый tool:
1. Описать его в `tools/definitions.ts` (что он делает, какие параметры)
2. Написать handler в `tools/handlers/` (логика выполнения)
3. Зарегистрировать в `tools/executor.ts`

---

## Как контекст попадает к Gemini

**System prompt** автоматически формируется из прикреплённых данных:

```
## Video Metadata
### Your Videos (live on YouTube)

- Your Video: "My Awesome Video" [id: abc123] — Views: 150K | Published: 2024-01-15 | Duration: 12:34
- Your Video: "Second Video" [id: def456] — Views: 80K | Published: 2024-02-10 | Duration: 8:20
```

Контекст **компактный** — только title + ключевые метрики. Description и tags Gemini запрашивает через `getMultipleVideoDetails` tool, когда они нужны.

### Откуда берётся контекст:

| Источник | Что передаёт |
|----------|-------------|
| **Playlist / Home** | Выбранные видео (title + metrics; description/tags — через tool) |
| **Canvas** | Выделенные ноды (видео, traffic sources, sticky notes) |
| **Trends** | Competitor videos |
| **Suggested Traffic** | Source видео + suggested videos из CSV |

---

## Mentions: от regex к tool calls

### Раньше (regex):
```
Gemini пишет: "Видео #3 имеет CTR 8%"
                    ↓
Regex ищет паттерн "Видео #N" → подставляет badge
                    ↓
Проблемы: "Video 3", "Видео №3", "видео три" — regex ломается
```

### Сейчас (structured mentions):
```
Gemini вызывает: mentionVideo("abc123")
                    ↓
Gemini пишет: [My Video](mention://abc123)
                    ↓
Frontend парсит mention://abc123 → VideoReferenceTooltip
                    ↓
Детерминированный videoId — никаких проблем с языком или форматом
```

**Для пользователя ничего не изменилось** — в тексте видны те же подсвеченные badges с tooltip при ховере.

---

## Thinking (мышление)

AI может "думать вслух" перед ответом. Уровень мышления настраивается per-model:

| Модель | Провайдер | Режим | Опции |
|--------|-----------|-------|-------|
| Gemini 3.1 Pro | Gemini | level | Low · Medium · High |
| Gemini 3 Flash | Gemini | level | Minimal · Low · Medium · High |
| Gemini 2.5 Pro | Gemini | budget | Auto · 1K · 8K · 24K tokens |
| Gemini 2.5 Flash | Gemini | budget | Off · Auto · 1K · 8K · 24K tokens |
| Claude Opus 4.6 | Anthropic | adaptive | Off · Low · Medium · High · Max |
| Claude Sonnet 4.6 | Anthropic | adaptive | Off · Low · Medium · High · Max |
| Claude Haiku 4.5 | Anthropic | — | Только Off (thinking не поддерживается) |

UI dropdown адаптируется автоматически: опции читаются из `MODEL_REGISTRY.thinkingOptions`. Подробнее: [Multi-Provider Architecture](./multi-provider.md).

Мысли отображаются в **ThinkingBubble** — свёрнутый блок с иконкой мозга. Кликнул → развернулась полная цепочка рассуждений.

> **Мысли не сохраняются** — это временные данные стриминга. После перезагрузки страницы thinking bubble исчезнет.
>
> **Claude thinking leak protection:** Claude иногда "протекает" thinking content в text blocks (обёрнутый в `<think>` теги). Бэкенд автоматически фильтрует такие утечки и перенаправляет в `onThought` callback.

---

## SSE события (стриминг)

Во время ответа сервер отправляет поток событий:

| Событие | Содержание | UI эффект |
|---------|-----------|-----------|
| `chunk` | Кусок текста ответа | Текст появляется посимвольно |
| `thought` | Кусок мышления | ThinkingBubble обновляется |
| `toolCall` | AI вызвал tool | ToolCallSummary показывает pending pill |
| `toolResult` | Результат tool | ToolCallSummary (resolved, кликабельный) |
| `toolProgress` | Промежуточный статус выполнения tool | Текст под pill обновляется |
| `confirmLargePayload` | Большой batch (≥15 обложек) требует подтверждения | ConfirmLargePayloadBanner с кнопками Load/Cancel |
| `done` | Ответ завершён | Сообщение сохраняется в Firestore |
| `error` | Ошибка | Сообщение об ошибке |
| `retry` | Сервер делает retry после transient error | Статус "Retrying..." под сообщением |

---

## Структура файлов

### Backend (`functions/src/`)
```
chat/
├── aiChat.ts                       # SSE endpoint — assembles ToolContext (reads youtubeApiKey from channel settings)

services/ai/
├── toolExecution.ts                # executeToolBatch() — shared batch executor + processImages
├── retry.ts                        # withStreamRetry() — shared retry logic
├── providerRouter.ts               # model → provider dispatch

services/tools/
├── definitions.ts                  # Описания tools (provider-agnostic, 7 tools)
├── executor.ts                     # executeTool() — диспетчер: call → handler → result
├── types.ts                        # ToolContext, ToolResult
├── handlers/
│   ├── mentionVideo.ts             # Поиск видео по ID
│   ├── getMultipleVideoDetails.ts  # Batch fetch из videos/ + cached_external_videos/
│   ├── viewThumbnails.ts           # Обложки видео (dual-collection lookup)
│   ├── analyzeTrafficSources.ts    # Анализ источников трафика
│   ├── analyzeTraffic.ts           # Анализ suggested traffic
│   ├── getChannelOverview.ts       # Обзор YouTube канала
│   └── browseChannelVideos.ts      # Список видео канала
```

### Frontend (`src/`)
```
core/types/sseEvents.ts                # 9 SSE event types
core/services/aiProxyService.ts        # SSE парсер + callbacks
core/services/aiService.ts             # Фасад (API → store)
core/stores/chat/chatStore.ts          # Состояние streaming + sliced architecture

features/Chat/components/
├── ToolCallSummary.tsx                # Consolidated pills (7 tool types) + ThumbnailGrid
├── ThinkingBubble.tsx                 # Collapsible thinking chain
├── ConfirmLargePayloadBanner.tsx      # Подтверждение большого batch обложек
features/Chat/utils/
├── toolCallGrouping.ts                # Группировка tool calls по типу
```
