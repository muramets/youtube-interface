# 🔁 Chat Resilience — Stream Retry, Progressive Status & Page Reload Recovery

## Текущее состояние ← YOU ARE HERE

**Реализовано (v3).** Четыре уровня защиты стриминга:

**1. Server-side retry (`withStreamRetry()`):** каждая итерация agentic loop обёрнута в `withStreamRetry()` (`services/ai/retry.ts`). Таймер 90 секунд сбрасывается на каждом чанке. Нет чанков 90с → таймаут → retry (до 2 раз). Оба провайдера (Gemini, Claude).

**2. Client-side inactivity guard:** 120-секундный таймер в браузере (30с буфер сверх серверных 90с).

**3. Page reload recovery (`activeStream` indicator):** сервер пишет `activeStream: { startedAt, model }` в conversation doc при старте генерации, удаляет при завершении/ошибке. Если страница перезагружается во время стриминга — клиент видит индикатор через Firestore `onSnapshot`, блокирует повторную отправку и ждёт ответ. Пользователь может нажать Stop (Firestore abort channel работает без HTTP-соединения). Staleness guard: 10 минут.

**Frontend progressive status (`StreamingStatusMessage.tsx`):**
- 0–10 сек: ничего
- 10–30 сек: "Processing your request..."
- 30–60 сек: "Complex request — model is taking longer than usual..."
- 60+ сек: "Still thinking, this may take a moment longer..."
- При retry: "Reconnecting (attempt N)..."
- При page reload recovery: прогрессивный — "Picking up response..." → "Model is still working..." → "Complex request..." → "Still processing..."

**4. Image Download Fallback (Claude only):** Claude API загружает image URL напрямую. Если YouTube CDN блокирует запрос с серверов Anthropic — ошибка 400 `"Unable to download the file"` роняет весь запрос. Fallback: наш сервер сам скачивает все URL images, конвертирует в base64, подставляет в сообщения и повторяет stream. Работает для всех image blocks: контекстные thumbnails, tool_result images (viewThumbnails, findSimilarVideos и т.д.). Неудавшиеся downloads заменяются на текст `[Thumbnail unavailable]`.

**После исчерпания retries:** ошибка в `ChatErrorBanner`.

---

## Как работает под капотом

```
User sends message
       │
       ▼
[aiChat Cloud Function]
  ─ вызывает streamChat()
       │
       ▼
[streamChat — agentic loop (до 10 итераций)]
       │
       ▼
[per-iteration retry loop — for attempt = 1..3]
  ─ NOTE: диаграмма показывает Gemini flow. Claude использует
  ─ AiStreamTimeoutError с аналогичным паттерном (см. различия ниже).
  ─ создаёт свежий AbortController (iterationAbort)
  ─ propagates caller signal → iterationAbort (user cancel)
  ─ стартует inactivity timer (90s)
  ─ вызывает ai.models.generateContentStream()
       │
       ├─── любой streamEvent (чанк, delta, content_block_*) → resetTimer() → продолжаем
       │
       ├─── GeminiTimeoutError / AiStreamTimeoutError (90s без чанков)
       │         │
       │         ├─ signal?.aborted (user cancel) → throw немедленно
       │         │
       │         └─ attempt <= MAX_STREAM_RETRIES (2)?
       │               ─ да: onRetry?.(attempt) → SSE: { type: "retry", attempt }
       │                      → chatStore: retryAttempt = attempt, streamingText = ''
       │                      → UI: "Reconnecting (attempt N)..."
       │                      → continue (next attempt)
       │               ─ нет: throw GeminiTimeoutError (exhausted)
       │
       └─── non-timeout error → throw немедленно
```

```
[aiChat — onRetry callback]
  ─ writeSSE(res, { type: "retry", attempt })
       │
       ▼
[aiProxyService.ts — SSE parser]
  ─ case 'retry': onRetry?.(sseEvent.attempt)
       │
       ▼
[chatStore.ts — sendMessage opts]
  ─ scopedSet({ retryAttempt: attempt, streamingText: '', thinkingText: '' })
       │
       ▼
[StreamingStatusMessage.tsx]
  ─ retryAttempt > 0 → "Reconnecting (attempt N)..."
  ─ useEffect на retryAttempt → сбрасывает elapsedSecs = 0
```

```
[Page Reload Recovery — activeStream indicator]

aiChat start
       │
       ▼
[convRef.update({ activeStream: { startedAt, model } })]
       │
       ▼                                       Page reload!
[SSE streaming...]                                  │
       │                                            ▼
       │                              [subscribeToConversations delivers
       │                               conv with activeStream present]
       │                                            │
       │                                            ▼
       │                              [subscribeToMessages — first load]
       │                              conv.activeStream.startedAt < 10min?
       │                                 ─ yes → isWaitingForServerResponse = true
       │                                         → dots + "Reconnecting to response..."
       │                                         → send blocked, stop button visible
       │                                 ─ no  → stale, clear activeStream
       │
       ▼
[aiChat finish — batch write]
  msg + convUpdate: { activeStream: delete }
       │
       ▼
[onSnapshot fires — new model message]
  → isWaitingForServerResponse = false
  → message appears in chat
```

```
[Image Download Fallback — Claude only]

[streamIteration() via withStreamRetry()]
       │
       ├─── success → continue as normal
       │
       └─── APIError 400 "Unable to download the file"
              │
              ▼
        isImageDownloadError(err) = true
              │
              ▼
        convertUrlImagesToBase64(agenticMessages)
          ─ walks all messages + nested tool_result.content
          ─ finds ImageBlockParam with source.type === "url"
          ─ downloads each URL from our server (Promise.all)
              │
              ├── download OK → replace source with { type: "base64", data, media_type }
              └── download FAIL → replace block with { type: "text", text: "[Thumbnail unavailable]" }
              │
              ▼
        retry runStream() once with base64 images
              │
              ├── success → continue agentic loop
              └── fail → propagate error
```

---

## Константы

| Константа | Значение | Где определена |
|---|---|---|
| `STREAM_INACTIVITY_TIMEOUT_MS` | 90 000 ms (90 сек) | Provider-specific: используется внутри provider-specific iteration function (не передаётся в `withStreamRetry()` напрямую). При таймауте бросает `GeminiTimeoutError` / `AiStreamTimeoutError`, которые `withStreamRetry` ловит через `isTransient` |
| `MAX_STREAM_RETRIES` | 2 (итого 3 попытки) | Provider-specific: передаётся в `withStreamRetry()` из каждого провайдера |
| `STREAM_TIMEOUT_MS` | 120 000 ms (120 сек, клиент) | `src/core/services/ai/aiProxyService.ts` — 30с буфер сверх серверных 90с |

### Различия провайдеров при retry

| Провайдер | Transient errors (retry) | Уникальное |
|---|---|---|
| Gemini | 503 (UNAVAILABLE) + inactivity timeout | String fallback: `err.message.includes('503')` |
| Claude | 529, 500, 503 + inactivity timeout | Также retry на rate limit (529) и server error (500) |
| Claude | 400 "Unable to download the file" | Image fallback: URL→base64 конвертация + retry (не через `isTransient`, а через отдельный catch) |

### Client-side HTTP retry (до SSE)

Перед стартом SSE стрима браузер делает обычный HTTP-запрос. При transient ошибке (429, 500, 502, 503) — автоматический retry с exponential backoff (1с → 2с), до 2 попыток.

---

## Расположение файлов

```
functions/src/
  services/
    ai/
      retry.ts                            ← withStreamRetry() — shared by Gemini & Claude
      __tests__/
        retry.test.ts                     ← unit tests (retry logic, cancel, exhaustion, delay timing)
    claude/
      streamChat.ts                       ← isImageDownloadError(), convertUrlImagesToBase64(), downloadImageAsBase64()
      __tests__/
        imageFallback.test.ts             ← unit tests (error detection, URL→base64, nested tool_result)

  chat/
    aiChat.ts                             ← activeStream write/clear, onRetry → SSE retry event
    sseWriter.ts                          ← SSEEvent types (SSERetryEvent)

src/
  core/
    types/
      chat/chat.ts                        ← ChatConversation.activeStream type
      sseEvents.ts                        ← SSERetryEvent type (client-side mirror)
    services/
      ai/
        chatService.ts                    ← clearActiveStream() — stale cleanup
      aiProxyService.ts                   ← inactivity guard + SSE 'retry' handler
    stores/
      chat/
        types.ts                          ← ChatState.isWaitingForServerResponse
        slices/
          streamingSlice.ts               ← initial value + stopGeneration clears waiting state
          messageSlice.ts                 ← detects activeStream on first load, clears on new model msg
          sendSlice.ts                    ← guard: blocks send when isWaitingForServerResponse
          navigationSlice.ts              ← clears on conversation switch
  features/
    Chat/
      ChatInput.tsx                       ← stop button visible during page-reload recovery
      ChatMessageList.tsx                 ← streaming bubble shown during recovery
      components/
        StreamingStatusMessage.tsx         ← "Reconnecting to response..." + progressive status
        ChatErrorBanner.tsx               ← shown when all retries exhausted
```

---

## Связанные фичи

- [Agentic Architecture](./agentic-architecture.md) — agentic loop, внутри которого живёт retry
- [AI Chat README](../README.md) — общая архитектура чата

---

## Roadmap

### Стадия 1 — Реализовано ✅

Server-side inactivity timeout + per-iteration retry loop + frontend progressive status.

- [x] `AiStreamTimeoutError` custom error class (shared, provider-agnostic)
- [x] 90-секундный inactivity timer per attempt (сбрасывается на каждом `streamEvent` — покрывает все типы событий вкл. `input_json_delta`)
- [x] `MAX_STREAM_RETRIES = 2` — до 3 попыток total
- [x] Caller cancel пропускает retry (нет retry на `signal.aborted`)
- [x] SSE event `{ type: "retry", attempt }` → frontend знает о каждой попытке
- [x] `chatStore.retryAttempt` + `StreamingStatusMessage`: "Reconnecting (attempt N)..."
- [x] Reset `streamingText` + `thinkingText` на retry (чистый UI-старт)
- [x] Client-side inactivity guard (aiProxyService, 120s — 30s буфер сверх серверных 90s)
- [x] Client-side HTTP retry (429, 500, 502, 503 — exponential backoff до SSE стрима)
- [x] Provider-specific transient detection (Gemini: 503; Claude: 529/500/503)
- [x] Unit tests для retry logic

**Расширение:** [Thinking Timeout Resilience](./thinking-timeout-resilience.md) — dynamic timeout 90s→600s при extended thinking, SSE heartbeat, partial thinking persistence.

### Стадия 1.5 — Page Reload Recovery ✅

**Бизнес-цель:** если пользователь перезагружает страницу во время стриминга — не терять ответ и не допускать дубликатов.

- [x] Server пишет `activeStream: { startedAt, model }` в conversation doc при старте `aiChat`
- [x] Server удаляет `activeStream` во всех путях завершения (success, abort, timeout, error)
- [x] Client детектит `activeStream` при загрузке conversation → `isWaitingForServerResponse: true`
- [x] Streaming bubble + "Reconnecting to response..." + stop-кнопка (Firestore abort channel)
- [x] Guard: `sendMessage` заблокирован при `isWaitingForServerResponse` — дубликаты невозможны
- [x] Staleness guard: `activeStream` старше 10 минут → очистка (сервер умер без cleanup)
- [x] `onSnapshot` доставляет финальное сообщение → `isWaitingForServerResponse: false`

### Стадия 1.7 — Image Download Fallback (Claude) ✅

**Бизнес-цель:** Claude API загружает image URL напрямую. YouTube CDN может блокировать запросы с серверов Anthropic → 400 ошибка убивает весь стрим. Fallback не теряет анализ — модель продолжает работу с текстовыми данными.

**Архитектурное отличие от Gemini:** Gemini использует Files API (бэкенд загружает файл → передаёт ref). Claude принимает URL и качает сам. Поэтому fallback нужен только для Claude.

- [x] `isImageDownloadError(err)` — детектит 400 "Unable to download the file"
- [x] `downloadImageAsBase64(url)` — скачивает image с нашего сервера, возвращает base64 + media_type
- [x] `convertUrlImagesToBase64(messages)` — обходит все MessageParam (включая nested tool_result.content), заменяет URL images на base64 in-place
- [x] Catch в agentic loop: image download error → конвертация → retry один раз
- [x] Graceful degradation: failed downloads → `[Thumbnail unavailable]` (текстовый placeholder)
- [x] Параллельная загрузка всех images (Promise.all)
- [x] 13 unit tests (error detection, conversion, nested blocks, parallel download)

### Стадия 2 — Telemetry & Alerting

**Бизнес-цель:** знать, как часто и какие модели зависают, до того как это заметит пользователь.

- [ ] Логировать retry-события в Cloud Logging с моделью и номером попытки
- [ ] Метрики в Cloud Monitoring: `stream_retry_count` per model
- [ ] Алерт, если retry rate > 5% за последний час

### Стадия 3 — Configurable Retry & Fallback Model

**Бизнес-цель:** автоматически переключаться на стабильную модель при систематических сбоях preview.

- [ ] Конфигурируемый `MAX_STREAM_RETRIES` (сейчас hardcoded в константе)
- [ ] Fallback model: после исчерпания retries попробовать `gemini-2.5-flash` вместо preview
- [ ] UI: показывать пользователю, что использована fallback-модель
