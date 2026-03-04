# 🤖 Agentic Architecture — как работает AI ассистент

## Простыми словами

Раньше AI работал как **переводчик**: ты даёшь текст → он даёт текст обратно.

Теперь AI работает как **ассистент с набором инструментов**: он может останавливаться посреди ответа, вызывать функции (искать видео, получать данные), видеть результат, и продолжать ответ.

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
  │  2. Gemini начинает отвечать                │
  │     Вместо текста "Видео #1" — вызывает:    │
  │     mentionVideo(videoId: "abc123")         │
  └────────────────────┬────────────────────────┘
                       ▼
  ┌─────────────────────────────────────────────┐
  │  3. Сервер выполняет tool                   │
  │     → ищет видео в Firestore                │
  │     → возвращает {title: "My Video", ...}   │
  └────────────────────┬────────────────────────┘
                       ▼
  ┌─────────────────────────────────────────────┐
  │  4. Gemini получает результат и пишет текст │
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

Этот цикл (шаги 2–4) может повторяться до **10 раз** за один ответ — Gemini может вызвать несколько tools подряд.

---

## Доступные инструменты (Tools)

| Tool | Что делает | Когда используется |
|------|-----------|-------------------|
| `mentionVideo` | Находит видео по ID, возвращает title + ownership | Каждый раз, когда Gemini ссылается на видео в тексте |
| `getMultipleVideoDetails` | Batch-запрос: description, tags, views для N видео | Когда Gemini нужна детальная информация (prompt содержит только title + метрики) |

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

| Модель | Провайдер | Параметр | Опции |
|--------|-----------|----------|-------|
| Gemini 3.1 Pro / 3 Flash | Gemini | `thinkingLevel` | Low · Medium · High |
| Gemini 2.5 Pro | Gemini | `thinkingBudget` | Auto · 1K · 8K · 24K tokens |
| Gemini 2.5 Flash | Gemini | `thinkingBudget` | Off · Auto · 1K · 8K · 24K tokens |
| Claude Sonnet 4.6 | Anthropic | `budget_tokens` | Off · Auto · 4K · 10K · 32K tokens |
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
| `toolCall` | Gemini вызвал tool | ToolCallSummary обновляет счётчик |
| `toolResult` | Результат tool | ToolCallSummary (resolved, кликабельный) |
| `done` | Ответ завершён | Сообщение сохраняется в Firestore |
| `error` | Ошибка | Сообщение об ошибке |

---

## Структура файлов

### Backend (`functions/src/`)
```
services/tools/
├── definitions.ts                  # Описания tools для Gemini API
├── executor.ts                     # Диспетчер: call → handler → result
├── types.ts                        # Общие типы (ToolContext, etc.)
├── index.ts                        # Barrel export
├── handlers/
│   ├── mentionVideo.ts             # Поиск видео по ID
│   └── getMultipleVideoDetails.ts  # Batch fetch из videos/ + cached_suggested/
```

### Frontend (`src/`)
```
core/types/sseEvents.ts           # Типы SSE событий
core/services/aiProxyService.ts   # SSE парсер + callbacks
core/services/aiService.ts        # Фасад (API → store)
core/stores/chatStore.ts          # Состояние streaming

features/Chat/components/
├── ToolCallSummary.tsx   # Consolidated pills with video previews
├── ThinkingBubble.tsx    # Collapsible thinking chain
```
