# Server-Side Abort — Feature Doc

## Текущее состояние

← YOU ARE HERE

Server-side abort позволяет реально остановить Cloud Function при нажатии Stop в UI. Без этого механизма функция продолжает работать до полного завершения, тратя API-токены впустую.

**Проблема:** Cloud Functions v2 работает на Cloud Run с HTTP/1.1. Google Cloud Load Balancer не пробрасывает client disconnect events в контейнер — `res.on('close')` не срабатывает при отключении клиента.

**Решение:** Firestore `onSnapshot` как side-channel abort signal. Клиент пишет `abortRequested: true` в документ конверсации, сервер получает realtime-уведомление и вызывает `abortController.abort()`.

**Latency:** ~60-150ms от клика Stop до abort на сервере.

**Known bug:** после abort tool calls пропадают из persisted message. Причина — dual-writer антипаттерн: клиент пишет happy-path, сервер пишет stopped-path. SSE `writeSSE` может бросить exception после abort → server-side persist не добирается → ghost message заменяется неполным server message. Фикс: server-only writer refactor (отдельная задача).

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

### Стадия 2 — Server-Only Writer Refactor (next)
- [ ] Server persists AI response for ALL cases (not just stopped)
- [ ] Client removes `persistAiResponse` — relies on onSnapshot
- [ ] Eliminates dual-writer anti-pattern
- [ ] Fixes tool calls disappearing after abort
- [ ] Aligns with Vercel AI SDK / Firebase best practices

### Стадия 3 — Production Hardening (backlog)
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
- `functions/src/chat/aiChat.ts` — onSnapshot setup, writeSSE try/catch, abort safety net in catch
- `src/core/stores/chat/slices/streamingSlice.ts` — stopGeneration with Firestore write
- `src/core/stores/chat/slices/messageSlice.ts` — clear ghost on server message arrival
- `src/core/services/ai/chatService.ts` — requestAbort method
- `src/features/Chat/components/ToolCallSummary.tsx` — stopped prop for cancelled tool display
- `functions/src/services/claude/streamChat.ts` — abort handler in agentic loop catch
- `functions/src/services/gemini/streamChat.ts` — signal.aborted checks in agentic loop

### Why Not HTTP-Level Detection
Documented Cloud Run limitation: HTTP/1.1 does not propagate client disconnect events to the container. HTTP/2 requires h2c support which Express.js / Firebase Functions v2 cannot provide. Firestore realtime is the industry-standard side-channel for serverless abort.
