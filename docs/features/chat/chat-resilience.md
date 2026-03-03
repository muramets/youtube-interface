# 🔁 Chat Resilience — Stream Retry & Progressive Status

## Текущее состояние ← YOU ARE HERE

**Реализовано (v1).** Gemini preview-модели могут зависнуть посреди стрима — перестать отправлять чанки на 90+ секунд без явной ошибки. Без защиты Cloud Function просто висит до таймаута в 300 секунд, пользователь видит вечный спиннер.

**Два уровня защиты:**

1. **Server-side retry (functions/src/services/gemini/streamChat.ts):** внутри каждой итерации agentic-цикла обёрнут `for (attempt = 1..MAX_STREAM_RETRIES+1)`. Таймер 90 секунд сбрасывается на каждом чанке. Нет чанков 90 секунд → `AbortController` получает `GeminiTimeoutError` → попытка повторяется автоматически (до 2 раз). Если пользователь сам отменил запрос — retry не происходит.

2. **Client-side inactivity guard (src/core/services/aiProxyService.ts):** аналогичный 90-секундный таймер на стороне браузера — защита от ситуации, когда SSE-соединение зависло раньше, чем сервер обнаружил проблему.

**Frontend progressive status (src/features/Chat/components/StreamingStatusMessage.tsx):**
- 0–10 сек: ничего не показываем (большинство запросов завершается раньше)
- 10–30 сек: "Processing your request..."
- 30–60 сек: "Complex request — model is taking longer than usual..."
- 60+ сек: "Still thinking, this may take a moment longer..."
- При retry: счётчик `retryAttempt` в `chatStore` → "Reconnecting (attempt N)..."
- На retry: `streamingText` и `thinkingText` сбрасываются (чистый старт отображения)

**После исчерпания retries:** ошибка всплывает к пользователю в стандартном `ChatErrorBanner`.

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
  ─ создаёт свежий AbortController (iterationAbort)
  ─ propagates caller signal → iterationAbort (user cancel)
  ─ стартует inactivity timer (90s)
  ─ вызывает ai.models.generateContentStream()
       │
       ├─── чанк пришёл → resetTimer() → продолжаем
       │
       ├─── GeminiTimeoutError (90s без чанков)
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

---

## Константы

| Константа | Значение | Где определена |
|---|---|---|
| `STREAM_INACTIVITY_TIMEOUT_MS` | 90 000 ms (90 сек) | `functions/src/services/gemini/streamChat.ts` |
| `MAX_STREAM_RETRIES` | 2 (итого 3 попытки) | `functions/src/services/gemini/streamChat.ts` |
| `STREAM_TIMEOUT_MS` | 90 000 ms (клиент) | `src/core/services/aiProxyService.ts` |

---

## Расположение файлов

```
functions/src/
  services/
    gemini/
      streamChat.ts                       ← retry loop, GeminiTimeoutError, inactivity timer
      __tests__/
        streamChat.retry.test.ts          ← 3 unit tests (retry logic, cancel, exhaustion)

  chat/
    aiChat.ts                             ← onRetry → writeSSE({ type: "retry", attempt })
    sseWriter.ts                          ← SSEEvent types (SSERetryEvent)

src/
  core/
    types/
      sseEvents.ts                        ← SSERetryEvent type (client-side mirror)
    services/
      aiProxyService.ts                   ← inactivity guard + SSE 'retry' handler
    stores/
      chatStore.ts                        ← retryAttempt state field
  features/
    Chat/
      components/
        StreamingStatusMessage.tsx        ← progressive status + "Reconnecting (attempt N)..."
        ChatErrorBanner.tsx               ← shown when all retries exhausted
```

---

## Связанные фичи

- [Agentic Architecture](./agentic-architecture.md) — agentic loop, внутри которого живёт retry
- [AI Chat README](./README.md) — общая архитектура чата

---

## Roadmap

### Стадия 1 — Реализовано ✅

Server-side inactivity timeout + per-iteration retry loop + frontend progressive status.

- [x] `GeminiTimeoutError` custom error class
- [x] 90-секундный inactivity timer per attempt (сбрасывается на каждом чанке)
- [x] `MAX_STREAM_RETRIES = 2` — до 3 попыток total
- [x] Caller cancel пропускает retry (нет retry на `signal.aborted`)
- [x] SSE event `{ type: "retry", attempt }` → frontend знает о каждой попытке
- [x] `chatStore.retryAttempt` + `StreamingStatusMessage`: "Reconnecting (attempt N)..."
- [x] Reset `streamingText` + `thinkingText` на retry (чистый UI-старт)
- [x] Client-side inactivity guard (aiProxyService, 90s)
- [x] Unit tests для retry logic (3 теста)

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
