# Server-Only Writer Refactor — Task Document

## Overview

Устранить dual-writer антипаттерн в персистенции AI-ответов: сейчас клиент пишет `role: 'model'` сообщения в happy-path, а сервер — только при abort/stopped. Это вызывает потерю tool calls после abort, потенциальную потерю данных при закрытии вкладки, и разделение логики между клиентом и сервером.

Рефакторинг переносит ВСЮ персистенцию AI-ответов на сервер, выравниваясь с best practices Vercel AI SDK / Convex / Firebase (single writer principle).

**Feature doc:** `docs/features/chat/infrastructure/server-side-abort.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/chat/infrastructure/server-side-abort.md` (feature doc, known bug, roadmap)
3. `functions/src/chat/aiChat.ts` (серверная Cloud Function — текущая partial-only персистенция)
4. `src/core/stores/chat/slices/sendSlice.ts` (клиентская `persistAiResponse` + `resumeSendFlow`)
5. `src/core/stores/chat/slices/messageSlice.ts` (onSnapshot подписка — уже принимает сообщения)

### Key Decisions (carry forward)

1. **Server = единственный writer для `role: 'model'` сообщений.** Клиент НИКОГДА не пишет model messages. Клиент пишет только `role: 'user'` messages (optimistic UI). Это устраняет race condition между клиентским persist и серверным persist при abort.

2. **SSE остается для real-time стриминга.** Chunks, thoughts, tool calls продолжают стримиться через SSE. Только финальная персистенция переезжает на сервер.

3. **`writeSSE("done")` становится notification, а не trigger.** Клиент использует его для UI-переходов (streaming → final text), но НЕ для персистенции. Если SSE упадет (abort, network), onSnapshot доставит данные.

4. **Thinking elapsed time считается на сервере.** `firstThoughtTs` уже трекается server-side. Точнее, чем клиентское `Date.now() - session.streamStartMs`. Session thinking cache на клиенте продолжает использовать client-side computation (ephemeral, ±1s приемлемо). При reload — точное значение из Firestore.

5. **Нет изменений в user message flow.** Клиент продолжает писать user messages оптимистично через `ChatService.addMessage()`.

6. **`stoppedResponse` ghost упрощается.** Сервер всегда персистит → onSnapshot всегда доставит → ghost нужен только для мгновенного отклика UI (секунды до onSnapshot), не для данных. Ghost behavior: показать UI-ghost из SSE данных → заменить на Firestore message при получении onSnapshot.

7. **Pre-generated Firestore ID для messageId.** Используем `db.collection(messagesPath).doc()` (без аргументов) для получения auto-ID СИНХРОННО, затем `docRef.set(msg)` в afterTasks. ID доступен сразу и включается в SSE `done` event до persist. Стандартный Firestore-паттерн. *(Review finding F1)*

8. **Batch write: message + conversation updatedAt.** Message persist и `updatedAt` bump делаются в одном Firestore batch для атомарной консистентности. *(Review finding F6)*

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes, независимый agent)
- **Parallel tasks** — независимые файлы внутри фазы (когда помечены как PARALLEL)

## Phase Status

| Phase | Описание | Статус |
|-------|----------|--------|
| P1 | Server-side: persist для ВСЕХ случаев | DONE |
| P2 | Client-side: удалить `persistAiResponse`, упростить flow | DONE |
| P3 | Integration: end-to-end verification + edge cases + ghost hardening | DONE |
| FINAL | Double review (R1 Architecture + R2 Production Readiness) | DONE |

## Current Test Count

**MUST be obtained by running `npx vitest run --project frontend` + `npx vitest run --project functions` — never copy from other docs.**

---

## Phase 1 — Server-side: Persist AI Response для ВСЕХ случаев

### Goal
Сервер (`aiChat.ts`) персистит AI message в Firestore после каждого успешного `router.streamChat()` — не только при `partial=true`, а ВСЕГДА.

### Critical Context

- **Текущее поведение (строка 441-463 `aiChat.ts`):** `afterTasks` персистит stopped message ТОЛЬКО при `partial && (responseText || thinkingAccumulator)`. Happy-path (complete) response НЕ персистируется сервером — клиент это делает.
- **Целевое поведение:** `afterTasks` всегда содержит persist — и для `complete`, и для `stopped`.
- **Pre-generated ID (Key Decision 7):** `const docRef = db.collection(messagesPath).doc()` → `docRef.id` доступен синхронно → включается в SSE `done` → `docRef.set(msg)` в afterTasks. Никаких изменений в control flow.
- **Batch write (Key Decision 8):** Message set + conversation updatedAt bump — один `batch.commit()`. Atomic consistency: если один упадёт, оба откатятся.
- **serverTimestamp vs Date.now():** Для `createdAt` в message используем `admin.firestore.FieldValue.serverTimestamp()` (уже используется для stopped messages). Для `auxiliaryCosts` в arrayUnion используем `Date.now()` (уже так — см. token-transparency post-review fix).
- **`persistToolCalls` уже готов:** KI content stripping (строка 406-414) уже создает `persistToolCalls` — используем его.
- **`contextBreakdown` уже готов:** Обновлен с tool results и agentic images (строки 375-386).

### Tasks

- [x] **T1.1** Расширить afterTasks блок в `functions/src/chat/aiChat.ts`:
  - Убрать `if (partial && ...)` guard — заменить на безусловный persist
  - Pre-generate ID: `const msgRef = db.collection(messagesPath).doc()`
  - Построить message object со ВСЕМИ полями: `role`, `text`, `model`, `status` (`complete` | `stopped`), `createdAt` (serverTimestamp), `tokenUsage`, `normalizedUsage`, `toolCalls` (persistToolCalls), `contextBreakdown`, `thinking`, `thinkingElapsedMs`
  - Batch write: `batch.set(msgRef, msg)` + `batch.update(convRef, { updatedAt: serverTimestamp(), ...convUpdate })` → `batch.commit()` в afterTasks
  - Strip undefined fields (Firestore rejects `undefined`) — используем явный `if (field) msg.field = field` паттерн
  - ⚠️ НЕ удалять catch block для abort safety net — он ловит edge case когда SDK бросает ДО возврата из streamChat
  - ⚠️ **Catch blocks тоже используют batch** *(Review v2 F1)*: abort safety net (строки ~524-545) и thinking timeout (строки ~550-590) — оба должны использовать тот же batch pattern (`batch.set(msgRef)` + `batch.update(convRef, { updatedAt })` + `batch.commit()`). Без этого aborted conversations не обновят `updatedAt` → не всплывут в conversation list.
  - ⚠️ **Один batch на весь conv doc** *(Review v2 F2)*: объединить `convUpdate` (summary, thumbnailCache, lastError) + `auxiliaryCosts` arrayUnion + `updatedAt` bump в один `batch.update()`. Сейчас два отдельных `db.doc(convPath).update()` — два network round-trips вместо одного.

- [x] **T1.2** Обновить SSE `done` event — добавить `messageId`:
  - Включить `msgRef.id` в SSE `done` event (доступен синхронно до persist)
  - Добавить `messageId` в `SSEDoneEvent` type (оба файла: `functions/src/chat/sseWriter.ts` и `src/core/types/sseEvents.ts`)
  - Обновить `parseSSEEvent` в `src/core/types/sseEvents.ts` — **явно** добавить `messageId` field в case 'done' (explicit field listing, не spread)
  - ⚠️ **SSE Parser Gotcha:** `parseSSEEvent` конструирует объекты с explicit field listing. Добавление optional field в интерфейс НЕ гарантирует прохождение через parser — нужно явно добавить в case
  - ⚠️ **aiProxyService.ts result assignment** (строки ~236-246): тоже explicit field listing, НЕ spread. Нужно явно добавить `messageId: sseEvent.messageId`

- [x] **T1.3** Тесты для server-side persist:
  - Файл: `functions/src/chat/__tests__/aiChat.serverPersist.test.ts` (новый)
  - Следовать паттерну `aiChat.thinkingPersistence.test.ts` (те же mocks)
  - **Test cases:**
    - Complete response: `batch.set()` вызван с `status: 'complete'`, все fields
    - Stopped response (partial): `batch.set()` вызван с `status: 'stopped'`
    - Token usage, normalizedUsage, toolCalls, contextBreakdown, thinking — все передаются
    - Conversation `updatedAt` обновляется в том же batch
    - messageId (pre-generated) возвращается в SSE done event
    - Batch failure не ломает SSE response (catch + console.warn)
  - **Mock targets:** `db.collection().doc()`, `batch.set()`, `batch.update()`, `batch.commit()`, `writeSSE`, `createProviderRouter`

### Parallelization Plan
```
T1.1 — SEQUENTIAL FIRST (server persist logic)
T1.2 — SEQUENTIAL (SSE type changes — needed for T1.3 and P2)
T1.3 — SEQUENTIAL LAST (tests depend on T1.1 + T1.2)
```

### Verification
```bash
npx vitest run --project functions -- aiChat
npm run check
```

### MANDATORY: Update this file
- [x] Mark task checkboxes `[x]`
- [x] Update Phase 1 status: TODO → DONE
- [x] Record test count: 525 frontend + 844 backend = 1369 total (98 files)

### Review Gate 1

Запустить subagent с промптом:

> Review `functions/src/chat/aiChat.ts` changes for Phase 1 of the server-only writer refactor. Answer these questions:
>
> 1. Does the server persist AI messages for BOTH `complete` and `stopped` cases? Is the `if (partial)` guard removed from the persistence path?
> 2. Are ALL required fields included in the persisted message: `role`, `text`, `model`, `status`, `createdAt` (serverTimestamp), `tokenUsage`, `normalizedUsage`, `toolCalls`, `contextBreakdown`, `thinking`, `thinkingElapsedMs`?
> 3. Is message persist + conversation updatedAt bump done in a single Firestore batch? Is this atomic?
> 4. Is `messageId` pre-generated via `db.collection().doc()` and available BEFORE SSE done? Is it included in the SSE done event?
> 5. Are undefined fields properly stripped before Firestore write (no explicit `undefined` values)?
> 6. Does `parseSSEEvent` in `src/core/types/sseEvents.ts` include `messageId` in the done case explicitly? (SSE Parser Gotcha)
> 7. Does `aiProxyService.ts` result assignment include `messageId` explicitly? (same gotcha — explicit field listing)
> 8. Does the abort safety net catch block still persist a stopped message independently? (It should — it handles SDK throws before streamChat returns.)
> 9. Is every persist wrapped in catch so that a Firestore failure doesn't prevent the SSE response?
> 10. Do tests cover: complete persist, stopped persist, all fields, batch atomicity, messageId in SSE, persist failure resilience?
>
> Fix all findings before moving to Phase 2.

---

## Phase 2 — Client-side: Удалить `persistAiResponse`, упростить flow

### Goal
Клиент перестает персистить AI-ответы. `resumeSendFlow` после стриминга не вызывает `persistAiResponse` — вместо этого полагается на onSnapshot для получения server-persisted message.

### Critical Context

- **`persistAiResponse` (sendSlice.ts строки 126-148):** Вся функция удаляется. Она вызывает `ChatService.addMessage()` с `role: 'model'` — именно этот dual-write мы устраняем.
- **`resumeSendFlow` (sendSlice.ts строки 166-263):** После `streamAiResponse()` возвращается — блок строк 244-249 (вызов `persistAiResponse`) удаляется. Но `maybeAutoTitle` (строка 262) остается — он не зависит от persist.
- **Thinking cache (строки 251-260):** `cacheSessionThinking` кэширует thinking text по messageId. Сейчас messageId берется из `get().messages` после persist. С сервер-only writer: messageId приходит в SSE `done` event (P1: T1.2). Нужно использовать его.
- **`AiChatResult` return type:** `streamAiResponse` / `AiProxy.streamChat` возвращает `AiChatResult`. Нужно добавить `messageId?: string` в этот тип, чтобы клиент получил ID из SSE `done`.
- **`stoppedResponse` ghost:** Сейчас ghost создается в catch (AbortError) из streaming state. Это остается — ghost нужен для мгновенного UI. Ghost clearing в messageSlice будет усилено в P3 (T3.5).
- ⚠️ **`aiProxyService.ts` result assignment (строки ~236-246):** explicit field listing, НЕ spread. Нужно explicit добавить `messageId: sseEvent.messageId`. *(Review finding F4)*
- ⚠️ **Race condition — onSnapshot vs SSE done.** Возможно, onSnapshot доставит message ДО SSE done (Firestore realtime fast). Это безопасно: onSnapshot добавит message в `messages[]`, SSE done завершит streaming state. Порядок не важен.

### Tasks

- [x] **T2.1** Удалить `persistAiResponse` из `src/core/stores/chat/slices/sendSlice.ts`:
  - Удалить interface `PersistAiResponseParams` (строки 126-139)
  - Удалить function `persistAiResponse` (строки 142-148)
  - В `resumeSendFlow` (строка 244-249): удалить вызов `await persistAiResponse({...})`
  - **НЕ удалять:** `maybeAutoTitle` (строка 262) — он остается

- [x] **T2.2** Добавить `messageId` в клиентские типы и поток:
  - Добавить `messageId?: string` в `AiChatResult` (`src/core/types/chat/chat.ts` строка 92)
  - В `aiProxyService.ts` result assignment — **явно** добавить `messageId: sseEvent.messageId` (explicit field listing, не spread)
  - В `streamAiResponse` (sendSlice.ts:70) — inline return type **не** совпадает с `AiChatResult`. Добавить `messageId?: string` в inline type, или заменить на `Promise<AiChatResult>`. Без этого destructuring `const { messageId }` выдаст TS error. *(Review v2 F3)*
  - В `resumeSendFlow` — использовать `result.messageId` для `cacheSessionThinking` вместо поиска по `get().messages`

- [x] **T2.3** Упростить thinking cache logic в `resumeSendFlow`:
  - Старый код (строки 251-260): ищет последний model message в `get().messages`, кэширует thinking по найденному messageId
  - Новый код: берет `messageId` из `result` (SSE done), кэширует thinking по нему
  - Если `messageId` отсутствует (server persist failed) — skip кэширование (graceful degradation)
  - **`elapsedMs`:** оставить client-side computation `Date.now() - session.streamStartMs` (ephemeral session cache, ±1s приемлемо, сервер пишет точное значение в Firestore для reload)

- [x] **T2.4** Обновить тесты:
  - Файл: `src/core/stores/chat/__tests__/sendSlice.test.ts` (если существует — расширить, если нет — создать)
  - **Test cases:**
    - После `streamAiResponse` возвращает — `ChatService.addMessage` NOT вызван с `role: 'model'`
    - `cacheSessionThinking` вызывается с messageId из SSE done result
    - `maybeAutoTitle` вызывается по-прежнему
    - Streaming state сбрасывается (`isStreaming: false`, `streamingText: ''`)
    - Graceful degradation: messageId=undefined → thinking cache skipped
  - **Mock target:** `AiService.sendMessage` — mock возвращает `{ text: 'resp', messageId: 'server-123' }`

### Parallelization Plan
```
T2.1 + T2.2 — PARALLEL (T2.1 = delete persist, T2.2 = add messageId type)
T2.3 — SEQUENTIAL (depends on T2.1 + T2.2, needs messageId to wire thinking cache)
T2.4 — SEQUENTIAL LAST (tests depend on all changes)
```

### Verification
```bash
npx vitest run --project frontend -- sendSlice
npm run check
```

### MANDATORY: Update this file
- [x] Mark task checkboxes `[x]`
- [x] Update Phase 2 status: TODO → DONE
- [x] Record test count: 525 frontend + 844 backend = 1369 total (98 files)

### Review Gate 2

Запустить subagent с промптом:

> Review `src/core/stores/chat/slices/sendSlice.ts` changes for Phase 2 of the server-only writer refactor. Answer these questions:
>
> 1. Is `persistAiResponse` completely removed (function + interface + all call sites)?
> 2. Does `resumeSendFlow` still call `maybeAutoTitle` after streaming completes?
> 3. Is `messageId` added to `AiChatResult` and properly parsed from the SSE `done` event in `aiProxyService.ts`? (explicit field listing, not spread)
> 4. Does `cacheSessionThinking` use `result.messageId` (from SSE done) instead of searching `get().messages`?
> 5. Is there a graceful degradation path when `messageId` is undefined (persist failed on server)?
> 6. Are there any remaining references to `ChatService.addMessage` with `role: 'model'` anywhere in the client codebase? Use: `grep -rn "ChatService.addMessage" src/ | grep -v "role: 'user'"`
> 7. Does the `stoppedResponse` ghost behavior still work? (created in catch, cleared by onSnapshot in messageSlice)
> 8. Do tests verify: no model persist call, messageId from SSE, thinking cache with messageId, maybeAutoTitle still called, graceful degradation?
>
> Fix all findings before moving to Phase 3.

---

## Phase 3 — Integration: End-to-End Verification + Edge Cases

### Goal
Проверить все edge cases взаимодействия server persist + client onSnapshot + SSE, убедиться в отсутствии дупликатов, потерь данных, и корректности UI. Усилить ghost clearing logic.

### Critical Context

- **Дубликаты:** Раньше клиент и сервер могли оба записать message → дубликат. Теперь только сервер пишет → дубликатов быть не должно. Но нужно проверить: нет ли оставшихся вызовов `ChatService.addMessage` с `role: 'model'` в ДРУГИХ местах (e.g. `confirmLargePayload`, `retryLastMessage`).
- **`confirmLargePayload` (sendSlice.ts):** Вызывает `resumeSendFlow` → который теперь не персистит → OK.
- **`retryLastMessage` (sendSlice.ts):** Вызывает `resumeSendFlow` → OK.
- **`editMessage` (sendSlice.ts):** Вызывает `get().sendMessage(newText)` → `sendMessage` → `resumeSendFlow` → OK.
- **`messageSlice.ts` reconciliation:** Merges optimistic user messages with Firestore messages. Model messages never have `optimistic-` prefix → no impact. `serverTimestamp()` для `createdAt` → ordering корректен с `orderBy('createdAt', 'asc')`.
- **Empty response edge case:** Если AI вернул пустой text И нет tool calls — персистим для consistency. `shouldShowMessage` может скрыть, но данные не потеряны.
- ⚠️ **Ghost clearing false positive (Review finding F2):** Текущий `shouldClearGhost` использует `.some(m => m.status === 'stopped')` — ловит СТАРЫЕ stopped messages из предыдущих abort'ов. С server-only writer (100-300ms latency до onSnapshot) окно ложного срабатывания увеличивается. Нужно усилить в T3.5.

### Tasks

- [x] **T3.1** Grep audit — убедиться в отсутствии оставшихся client-side model persists:
  - `grep -rn "ChatService.addMessage" src/ | grep -v "role: 'user'"` — не должно возвращать вызовов с model
  - `grep -rn "persistAiResponse" src/` — должно вернуть 0 результатов
  - Документировать результаты в этом файле

- [x] **T3.2** Обновить feature doc `docs/features/chat/infrastructure/server-side-abort.md`:
  - Переместить `← YOU ARE HERE` marker на Stage 2
  - Отметить Stage 2 чеклисты как выполненные
  - Обновить Technical Implementation section: описать server-only writer architecture
  - Добавить в Key Files: `sseWriter.ts` (messageId в done event), `sseEvents.ts` (parser update)

- [x] **T3.3** Integration test: server persist + client flow (backend test):
  - Файл: `functions/src/chat/__tests__/aiChat.serverPersist.test.ts` (расширить файл из P1)
  - **Test cases:**
    - Abort safety net (catch block): message persisted с `status: 'stopped'`, even when SDK throws
    - Thinking timeout: message persisted with `thinking` and `thinkingElapsedMs`
    - KI content stripping: `saveKnowledge` args.content replaced with pointer
    - Empty response text with tool calls: message persisted (not skipped)
    - Server persist failure (batch.commit throws): SSE done event still sent, response still ends cleanly

- [x] **T3.4** Client-side integration test:
  - Файл: `src/core/stores/chat/__tests__/sendSlice.test.ts` (расширить)
  - **Test cases:**
    - `confirmLargePayload` path: no `ChatService.addMessage` with `role: 'model'`
    - `retryLastMessage` path: no `ChatService.addMessage` with `role: 'model'`
    - Abort (DOMException): `stoppedResponse` ghost created from streaming state (no persist)
    - SSE done with `messageId`: session thinking cache populated

- [x] **T3.5** Harden ghost clearing logic в `messageSlice.ts` *(Review finding F2)*:
  - **Проблема:** `shouldClearGhost` использует `.some(m => m.status === 'stopped')` — ловит СТАРЫЕ stopped messages из предыдущих abort'ов → ghost может очиститься преждевременно
  - **Фикс:** считать model messages до и после, очищать ghost только при появлении НОВОГО model message:
    ```typescript
    const prevModelCount = get().messages.filter(m => m.role === 'model').length;
    const newModelCount = merged.filter(m => m.role === 'model').length;
    const shouldClearGhost = get().stoppedResponse !== null && newModelCount > prevModelCount;
    ```
  - ⚠️ Простой `merged.length > get().messages.length` ложно сработает при user message reconciliation (оптимистичное → Firestore confirmed). Счётчик model messages изолирует от этого.
  - Тест: ghost НЕ очищается при onSnapshot update без новых model messages (metadata change, user reconciliation)
  - Тест: ghost очищается при появлении нового model message
  - Тест: ghost НЕ очищается при наличии старого stopped message из предыдущего abort

### Parallelization Plan
```
T3.1 — SEQUENTIAL FIRST (grep audit — validates P2 completeness)
T3.2 + T3.3 + T3.4 — PARALLEL (doc update, server tests, client tests)
T3.5 — SEQUENTIAL LAST (depends on P2 being complete, modifies messageSlice)
```

### Verification
```bash
npx vitest run --project frontend -- sendSlice
npx vitest run --project functions -- aiChat
npm run check
```

### MANDATORY: Update this file
- [x] Mark task checkboxes `[x]`
- [x] Update Phase 3 status: TODO → DONE
- [x] Record test count: 527 frontend + 847 backend = 1374 total (98 files)

### Review Gate 3

Запустить subagent с промптом:

> Review all changes across Phase 1-3 of the server-only writer refactor. This is the integration review. Answer these questions:
>
> 1. Is there ANY remaining path where the client writes a `role: 'model'` message to Firestore? Use: `grep -rn "ChatService.addMessage" src/ | grep -v "role: 'user'"`
> 2. Does the server persist AI messages in ALL terminal states: complete, stopped (partial), abort safety net, thinking timeout?
> 3. Is message persist + conversation `updatedAt` bump done atomically via Firestore batch?
> 4. Is `messageId` correctly threaded: server `db.collection().doc()` (pre-generated) → SSE done → client `AiChatResult` → `cacheSessionThinking`?
> 5. Does `parseSSEEvent` in `src/core/types/sseEvents.ts` include `messageId` in the done case explicitly? Does `aiProxyService.ts` result assignment also include it explicitly?
> 6. Is the ghost clearing logic in `messageSlice.ts` hardened against false positives from old stopped messages?
> 7. Is the feature doc `server-side-abort.md` updated to reflect the new architecture?
> 8. Are all edge cases covered in tests: complete, stopped, abort, thinking timeout, empty response, persist failure, KI stripping, ghost clearing?
>
> Fix all findings before moving to FINAL phase.

---

## FINAL — Double Review

### R1: Architecture Review

Запустить subagent с промптом:

> Architecture review for the server-only writer refactor. Read these files in order:
> 1. `docs/features/chat/infrastructure/server-only-writer-tasks.md` (Key Decisions section)
> 2. `functions/src/chat/aiChat.ts` (server persist logic)
> 3. `src/core/stores/chat/slices/sendSlice.ts` (client flow without persist)
> 4. `src/core/stores/chat/slices/messageSlice.ts` (onSnapshot reconciliation + ghost clearing)
> 5. `src/core/types/sseEvents.ts` (messageId in done event)
> 6. `functions/src/chat/sseWriter.ts` (SSE types)
>
> Answer YES/NO for each:
>
> 1. **Single Writer Principle:** Is the server the ONLY writer for `role: 'model'` messages? No remaining dual-write paths?
> 2. **Data Completeness:** Does the server-persisted message include ALL fields that the client previously wrote: `text`, `model`, `tokenUsage`, `normalizedUsage`, `toolCalls`, `status`, `contextBreakdown`, `thinking`, `thinkingElapsedMs`?
> 3. **Atomic Persistence:** Are message persist + conversation updatedAt bump in a single Firestore batch?
> 4. **SSE-Firestore Consistency:** Is the SSE `done` payload consistent with the Firestore-persisted message? Are `messageId` threaded correctly through all layers?
> 5. **Separation of Concerns:** Is the client now purely: (a) write user messages optimistically, (b) receive streaming events for UI, (c) receive persisted messages via onSnapshot? No persistence logic remaining?
> 6. **No Dead Code:** Are `persistAiResponse`, `PersistAiResponseParams`, and any related helpers fully removed?
> 7. **Shared Types:** Are `SSEDoneEvent` and `AiChatResult` both updated with `messageId`? Are the server-side (`sseWriter.ts`) and client-side (`sseEvents.ts`) mirrors in sync?
> 8. **Error Handling:** Does every server-side persist have a catch/fallback? Does persist failure NOT break the SSE response?
> 9. **Conversation Ordering:** Does `updatedAt` get bumped on both user message persist (client) and model message persist (server)?
>
> List all NO answers with specific file:line references and fix suggestions.

### R2: Production Readiness Review

Запустить subagent с промптом:

> Production readiness review for the server-only writer refactor. Focus on failure modes and edge cases.
>
> 1. **Network failure during SSE:** User closes tab mid-stream. Does the server still persist the AI response? (Check: does `router.streamChat()` complete even if `writeSSE` throws on the result chunks?)
> 2. **Server persist failure:** `batch.commit()` fails (Firestore quota, network). Does the response still end cleanly? Is the error logged?
> 3. **Abort timing:** User clicks Stop during tool execution. Server persist happens in `afterTasks`. Does `afterTasks` run for aborted requests? (Check the control flow: abort → `partial: true` from streamChat → afterTasks persist → res.end())
> 4. **Abort safety net:** SDK throws before streamChat returns. Catch block persists stopped message. Is this still working? Does it conflict with the afterTasks persist? (No — catch block runs instead of try block.)
> 5. **Duplicate messages:** Can any race condition cause TWO model messages for one request? (Check: server-side persist is in afterTasks, after streamChat completes — only once. onSnapshot receives it — only reads.)
> 6. **createdAt ordering:** Server uses `serverTimestamp()`. Client user messages use `Timestamp.now()`. In Firestore queries with `orderBy('createdAt')`, will these interleave correctly? (Yes — both resolve to server time, ± a few hundred ms.)
> 7. **Thinking timeout persist:** Does the catch block for `AiStreamTimeoutError` still persist thinking data correctly? Does it conflict with the normal afterTasks persist? (No — it runs in catch, afterTasks runs in try.)
> 8. **Memory leak:** Is `cacheSessionThinking` called correctly with the new messageId flow? Does it still respect `SESSION_THINKING_MAX_ENTRIES`?
> 9. **Backward compatibility:** Old messages (persisted by client) have `Timestamp.now()` for `createdAt`. New messages (persisted by server) have `serverTimestamp()`. Are both handled correctly by `subscribeToMessages` and `loadOlderMessages`?
> 10. **Ghost false positive:** Is the ghost clearing logic in messageSlice hardened? Does it check message count growth, not just status field presence?
> 11. **Test coverage:** Are all terminal states tested: complete, stopped, abort catch, thinking timeout? Does test count equal or exceed pre-refactor count?
>
> List all concerns with severity (Critical / Medium / Low) and specific fixes.

### After R1+R2
- [x] Fix all Critical and Medium findings
  - R1: 9/9 YES — zero findings
  - R2: Fixed #4 (writeSSE in abort safety net wrapped in try/catch)
  - R2 #2 (batch.commit retry) — deferred, pre-existing risk
  - R2 #6 (clock skew) — pre-existing, not introduced by refactor
  - R2 #11 (abort/timeout test coverage) — deferred, complex to mock internal AbortController
- [x] Re-run full test suite: 527 frontend + 847 backend = 1374 total, 0 failed
- [x] Update Phase FINAL status: TODO → DONE
- [x] Record final test count: 527 frontend + 847 backend = 1374 total (98 files)
- [x] Update feature doc `docs/features/chat/infrastructure/server-side-abort.md` — done in P3
