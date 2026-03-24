# 🔁 Chat Resilience — Stream Retry & Progressive Status

## Текущее состояние ← YOU ARE HERE

**Реализовано (v1).** Preview-модели (Gemini, Claude) могут зависнуть посреди стрима — перестать отправлять чанки на 90+ секунд без явной ошибки. Без защиты Cloud Function просто висит до таймаута в 300 секунд, пользователь видит вечный спиннер.

**Два уровня защиты:**

1. **Server-side retry (`withStreamRetry()` — shared utility):** каждая итерация agentic loop обёрнута в `withStreamRetry()` (файл `services/ai/retry.ts`). Таймер 90 секунд сбрасывается на каждом чанке. Нет чанков 90 секунд → таймаут → попытка повторяется автоматически (до 2 раз). Используется обоими провайдерами (Gemini и Claude). Если пользователь сам отменил запрос — retry не происходит.

2. **Client-side inactivity guard:** 120-секундный таймер на стороне браузера (30с буфер сверх серверных 90с, чтобы сервер успел отправить retry SSE-событие до клиентского таймаута).

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
      chat/chatStore.ts                    ← aggregator (re-exports retryAttempt; defined in types.ts line 45, initial value in slices/streamingSlice.ts line 22)
  features/
    Chat/
      components/
        StreamingStatusMessage.tsx        ← progressive status + "Reconnecting (attempt N)..."
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
