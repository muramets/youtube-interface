# Server-Side Abort — Feature Doc

## Текущее состояние

Server-side abort позволяет реально остановить Cloud Function при нажатии Stop в UI. Без этого механизма функция продолжает работать до полного завершения, тратя API-токены впустую.

**Решение:** Firestore `onSnapshot` как side-channel abort signal. Клиент пишет `abortRequested: true` в документ конверсации, сервер получает realtime-уведомление и вызывает `abortController.abort()`.

**Latency:** ~60-150ms от клика Stop до abort на сервере.

**Server-only writer (Stage 2 — DONE):** Сервер — единственный writer для `role: 'model'` сообщений. Клиент пишет только user messages. AI-ответы персистятся сервером через atomic Firestore batch (message + conversation updatedAt). Dual-writer anti-pattern полностью устранён — tool calls после abort больше не пропадают.

---

## Roadmap

### Стадия 1 — Firestore Abort Signal ✅
- [x] Server: `onSnapshot` listener на документ конверсации
- [x] Server: `abortController.abort()` при получении `abortRequested: true`
- [x] Client: `ChatService.requestAbort()` — Firestore write
- [x] Client: `stopGeneration()` вызывает requestAbort ДО abort fetch
- [x] Cleanup: listener unsubscribe в finally блоке
- [x] Cleanup: удаление поля `abortRequested` при старте нового запроса
- [x] Gemini: `signal?.aborted` checks before/after tool execution
- [x] Claude: graceful partial return on abort (same pattern as thinking timeout)
- [x] Client: ghost stoppedResponse cleared when server message arrives via onSnapshot
- [x] Client: stopped tool calls show "Cancelled" icon instead of spinner
- [x] Server: writeSSE wrapped in try/catch (best-effort notification)

### Стадия 2 — Server-Only Writer Refactor ✅ ← YOU ARE HERE
- [x] Server persists AI response for ALL cases (not just stopped)
- [x] Client removes `persistAiResponse` — relies on onSnapshot
- [x] Eliminates dual-writer anti-pattern
- [x] Fixes tool calls disappearing after abort
- [x] Aligns with Vercel AI SDK / Firebase best practices
- [x] Pre-generated messageId via `db.collection().doc()` — included in SSE done
- [x] Atomic Firestore batch: message persist + conversation updatedAt + convUpdate
- [x] Ghost clearing hardened: count-based (newModelCount > prevModelCount)

### Стадия 3 — Stopped Message Context Preservation ✅ ← YOU ARE HERE
- [x] `aiChat.ts`: stopped-сообщения с контентом (text или toolCalls) включаются в историю
- [x] Пустые stopped-сообщения (safety-net abort, thinking timeout) исключаются — не тратят токены
- [x] Claude `buildHistory()`: `.every()` → `.some()` для tool result validation; прерванные tool calls → `is_error: true`
- [x] Gemini `buildHistory()`: `.every()` → `.some()`; прерванные tool calls → `{ error: "..." }` object fallback
- [x] Тесты: mixed partial/complete tool results для обоих провайдеров

### Стадия 4 — Production Hardening (backlog)
- [ ] Metric: how many requests actually aborted vs completed before abort
- [ ] Monitoring: alert if abort latency > 500ms

---

## Technical Implementation

### Signal Flow
```
UI Stop → ChatService.requestAbort() → Firestore write {abortRequested: true}
                                              ↓
                              Cloud Function onSnapshot listener
                                              ↓
                              abortController.abort() → signal fires
                                              ↓
                    Provider streamChat (Gemini/Claude) → stream terminated
```

### Abort Handling by Provider
- **Gemini:** poll-based. `signal?.aborted` checked at 3 points in agentic loop (after iteration, before tools, after tools). SDK does not support mid-stream cancel.
- **Claude:** event-driven. SDK throws via `onSignalAbort` → caught in agentic loop catch → graceful partial return with accumulated toolCalls. Same pattern as thinking timeout handler.

### Key Files
- `functions/src/chat/aiChat.ts` — onSnapshot setup, server-only writer (batch persist), abort safety net
- `functions/src/chat/sseWriter.ts` — SSE types (messageId in SSEDoneEvent)
- `src/core/types/sseEvents.ts` — client SSE parser (messageId in done case)
- `src/core/services/ai/aiProxyService.ts` — SSE stream consumer (messageId threading)
- `src/core/stores/chat/slices/sendSlice.ts` — client send flow (no model persist)
- `src/core/stores/chat/slices/messageSlice.ts` — ghost clearing (count-based)
- `src/core/stores/chat/slices/streamingSlice.ts` — stopGeneration with Firestore write
- `src/core/services/ai/chatService.ts` — requestAbort method
- `src/features/Chat/components/ToolCallSummary.tsx` — stopped prop for cancelled tool display
- `functions/src/services/claude/streamChat.ts` — abort handler in agentic loop catch
- `functions/src/services/gemini/streamChat.ts` — signal.aborted checks in agentic loop

### Stopped Message Context Preservation

До Stage 3 stopped-сообщения полностью исключались из истории: `aiChat.ts` фильтровал по `status === 'complete'`. Модель теряла весь контекст (анализы, tool results) при abort — вынуждена была начинать заново.

**Фикс:** stopped-сообщения с контентом включаются в историю. Обработка partial tool results:

| Сценарий | Claude | Gemini |
|---|---|---|
| Все tool results есть | Полная реконструкция | Полная реконструкция |
| Часть есть, часть прервана | `is_error: true` + string message | `{ error: "..." }` object fallback |
| Все прерваны | Fallback на text-only | Fallback на text-only |
| Пустое stopped (text="" + no tools) | Исключается фильтром | Исключается фильтром |

`toolIterations` path (Claude) не требует изменений: он хранит только завершённые итерации — прерванная итерация не попадает в `allToolIterations`.

### Why Not HTTP-Level Detection
Documented Cloud Run limitation: HTTP/1.1 does not propagate client disconnect events to the container. HTTP/2 requires h2c support which Express.js / Firebase Functions v2 cannot provide. Firestore realtime is the industry-standard side-channel for serverless abort.
