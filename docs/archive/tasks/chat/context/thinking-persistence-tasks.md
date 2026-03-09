# Thinking Persistence — Task Doc

## Overview

Сохранять thinking (цепочку мыслей модели) в Firestore, чтобы мысли переживали перезагрузку страницы.

---

## Quick Context Recovery

1. **Этот файл** → `docs/features/chat/context/thinking-persistence-tasks.md`
2. **Feature doc** → `docs/features/chat/context/thinking-persistence.md`
3. **Session cache** → `src/core/stores/chat/session.ts` (текущая реализация — ephemeral Map)
4. **Send flow** → `src/core/stores/chat/slices/sendSlice.ts` (persistAiResponse + resumeSendFlow)
5. **ChatMessage type** → `src/core/types/chat/chat.ts` (нет thinking полей)
6. **Backend** → `functions/src/chat/aiChat.ts` (SSE events + stopped message persistence)

---

## Key Decisions (carry forward)

1. **Inline fields, не subcollection.** Thinking хранится как `thinking?: string` + `thinkingElapsedMs?: number` прямо в документе message. Причина: Firestore тарифицирует по чтениям (subcollection = N extra reads), а thinking text обычно 1-20KB — далеко от лимита 1MB.

2. **Два пути записи.** Нормальный ответ (complete) — frontend пишет через `persistAiResponse`. Остановленный ответ (stopped) — backend пишет напрямую. Thinking должен попадать в оба пути.

3. **Backend накапливает thinking для stopped-messages.** Сейчас бэкенд не хранит thinking text — только стримит дельты через SSE. Для stopped-messages нужен аккумулятор.

4. **Session cache остаётся.** Используется для мгновенного отображения в текущей сессии. Приоритет: `msg.thinking` (Firestore) > `getSessionThinking(msg.id)` (session).

5. **`done` SSE event НЕ расширяется.** Frontend уже имеет полный thinking text из накопленных `thought` SSE-событий. Добавлять thinking в `done` event — дублирование 1-50KB данных. Backend накапливает thinking только для stopped-messages (которые пишет сам). _Trade-off: если frontend потеряет `thought` SSE-события — thinking будет неполным. Допустимый риск для MVP; пересмотреть в Этапе 2 если проявится._

6. **`persistAiResponse` → object params.** Текущая сигнатура — 9 позиционных параметров. Добавление thinking доведёт до 11 (Positional Parameter Explosion). Рефакторим в `persistAiResponse(params: PersistAiResponseParams)`.

7. **elapsedMs — approximate, `firstThoughtTs` на backend.** Frontend: `Date.now() - session.streamStartMs` (включает network latency). Backend: `Date.now() - firstThoughtTs` (от первого `onThought`). Расхождение 1-5 сек — ожидаемо и допустимо. Known behavior: Gemini выдаёт thoughts порционно (thought → tool call → thought), `firstThoughtTs` захватывает весь span включая tool execution — это правильно (wall-clock time от начала раздумий).

8. **`ChatService.addMessage` — без изменений.** Использует spread (`...message`) + `stripUndefined` → новые опциональные поля проходят автоматически. Verification only.

9. **Firestore Security Rules — без изменений.** Rules используют `allow read, write: if auth.uid == userId` без `hasOnly` ограничений на поля. Новые поля проходят автоматически.

---

## Agent Orchestration Strategy

- **Main context = executor + orchestrator.** Фазы P1–P3 + Tests выполняются в main context (фича небольшая, 6-8 файлов).
- **Subagent: R1 (Architecture Review)** — отдельный elite senior dev agent, review → fix findings → re-verify.
- **Subagent: R2 (Production Readiness)** — отдельный elite senior dev agent, review → fix findings → re-verify.
```
P1 → P2 → P3 — SEQUENTIAL (main context)
Tests — SEQUENTIAL (main context)
R1 (Architecture Review) — subagent → fix findings
R2 (Production Readiness) — subagent → fix findings
Final verification — all test suites + lint + typecheck + docs
```

---

## Phase Status Table

| Phase | Description | Status |
|-------|-------------|--------|
| P1 | Data Model + Frontend Persistence | DONE |
| P2 | Backend Stopped Messages | DONE |
| P3 | Frontend Display + Fallback | DONE |
| Tests | Unit tests for all paths | DONE |
| FINAL | Double review-fix cycle (R1: Architecture, R2: Production Readiness) | DONE |

---

## Current Test Count

**1178** (731 frontend + 447 backend, 80 files)
_Получено: `npm run test:run` + `npx vitest run --project functions` — 2026-03-08_

---

## P1: Data Model + Frontend Persistence

**Goal:** Thinking сохраняется в Firestore при нормальном (complete) ответе модели.

### Critical Context
- `persistAiResponse` — module-level function (не экспортируется), вызывается из `resumeSendFlow`
- `resumeSendFlow` уже имеет `finalThinkingText` из `get().thinkingText` (строка 197)
- Текущий порядок: `persistAiResponse` (строка 200) → `cacheSessionThinking` (строка 206). **Меняем на: cache → persist** (fix timing race — между persist и cache есть момент, когда ни Firestore, ни session cache не содержат thinking)
- `ChatService.addMessage` использует spread (`...message`) + `stripUndefined` → новые поля проходят автоматически. Не трогаем, но верифицируем.
- ⚠️ SSE Parser gotcha: `parseSSEEvent` строит объекты с явным перечислением полей. Но мы НЕ меняем `done` event, так что это не актуально.

### Tasks

- [x] **T1.1** `src/core/types/chat/chat.ts` — добавить в `ChatMessage`:
  ```ts
  /** Full thinking chain text (persisted to Firestore). */
  thinking?: string;
  /** Approximate time spent thinking (ms). */
  thinkingElapsedMs?: number;
  ```

- [x] **T1.2** `src/core/stores/chat/slices/sendSlice.ts` — рефакторинг `persistAiResponse` в object params:
  ```ts
  interface PersistAiResponseParams {
    userId: string; channelId: string; convId: string;
    responseText: string; model: string;
    tokenUsage?: TokenUsage;
    normalizedUsage?: NormalizedTokenUsage;
    toolCalls?: ToolCallRecord[];
    status?: MessageStatus;
    contextBreakdown?: ContextBreakdown;
    thinking?: string;
    thinkingElapsedMs?: number;
  }
  async function persistAiResponse(params: PersistAiResponseParams): Promise<void>
  ```
  - Обновить единственный call site в `resumeSendFlow` (строка 200)
  - Включить `thinking` и `thinkingElapsedMs` в объект, передаваемый в `ChatService.addMessage`

- [x] **T1.3** `src/core/stores/chat/slices/sendSlice.ts` — в `resumeSendFlow` (строки 197-211):
  - Снять `finalThinkingText` из `get().thinkingText` (уже есть, строка 197)
  - Рассчитать `elapsedMs = Date.now() - session.streamStartMs`
  - **Сначала** `cacheSessionThinking` (переместить до persist)
  - **Потом** `persistAiResponse` с thinking и thinkingElapsedMs
  - ⚠️ Не дублировать thinking в `persistAiResponse` если `finalThinkingText` пустой

- [x] **T1.4** Verification: `ChatService.addMessage` — прочитать и подтвердить что spread + `stripUndefined` пропустят новые поля. Если нет — добавить. Также: Firestore Security Rules (`firestore.rules`) не используют `hasOnly` — новые поля пройдут ✅

### Verification
```bash
npm run typecheck
npm run lint
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks
- [ ] Update Phase Status table (P1 → DONE)

---

## P2: Backend Stopped Messages

**Goal:** Thinking сохраняется в Firestore при stopped-ответе (когда пользователь нажал Stop).

### Critical Context
- Backend пишет stopped messages напрямую в Firestore: `functions/src/chat/aiChat.ts:349-367`
- Сейчас `onThought` callback только стримит через SSE (строка 201-202), **не накапливает** — это архитектурное изменение, не однострочный fix
- Backend НЕ знает elapsed time из frontend `streamStartMs`. Используем `firstThoughtTs` — фиксируем при первом `onThought` callback (точный момент начала thinking, без overhead от Firestore reads / memory build / provider setup)
- ⚠️ `onThought` может вызываться с пустыми дельтами — проверять `text.length > 0`

### Tasks

- [x] **T2.1** `functions/src/chat/aiChat.ts` — аккумулятор thinking (перед `const callbacks`):
  ```ts
  let thinkingAccumulator = '';
  let firstThoughtTs = 0;  // 0 = no thinking yet
  ```
- [x] **T2.2** `functions/src/chat/aiChat.ts` — в `onThought` callback (строка 201-202):
  ```ts
  onThought: (text) => {
    if (text) {
      if (!firstThoughtTs) firstThoughtTs = Date.now();
      thinkingAccumulator += text;
      writeSSE(res, { type: "thought", text });
    }
  },
  ```
  ⚠️ `writeSSE` обёрнут в `if (text)` — пустые дельты не отправляются клиенту. Это чистота, не баг-фикс (фронтенд конкатенировал бы пустую строку — no-op).
- [x] **T2.3** `functions/src/chat/aiChat.ts` — включить thinking в stopped message write (строки 349-367):
  ```ts
  if (thinkingAccumulator) {
    stoppedMsg.thinking = thinkingAccumulator;
    stoppedMsg.thinkingElapsedMs = firstThoughtTs ? Date.now() - firstThoughtTs : 0;
  }
  ```

### Verification
```bash
cd functions && npm run build
npx vitest run --project functions
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks
- [ ] Update Phase Status table (P2 → DONE)

---

## P3: Frontend Display + Fallback

**Goal:** ThinkingBubble показывает thinking из Firestore, с fallback на session cache.

### Critical Context
- `ChatMessageList.tsx:587-591` — текущая логика: `getSessionThinking(msg.id)`
- `msg.thinking` придёт из Firestore при подписке на сообщения (onSnapshot)
- Session cache по-прежнему нужен: когда стрим только что закончился, Firestore ещё не подтвердил запись, а session cache уже доступен

### Tasks

- [x] **T3.1** `src/features/Chat/ChatMessageList.tsx` — обновить логику sessionThinking:
  ```ts
  // Приоритет: Firestore > session cache
  const thinking = msg.role === 'model'
    ? (msg.thinking
        ? { text: msg.thinking, elapsedMs: msg.thinkingElapsedMs ?? 0 }
        : getSessionThinking(msg.id))
    : null;
  ```
- [x] **T3.2** Убедиться, что `ThinkingBubble` не нуждается в изменениях (props уже совместимы)

### Verification
```bash
npm run typecheck
npm run lint
npm run dev  # manual check: reload page, verify thinking persists
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks
- [ ] Update Phase Status table (P3 → DONE)

---

## Tests: Unit tests for all paths

**Goal:** Покрытие тестами всех путей записи и чтения thinking.

### Tasks

- [x] **TT.1** Unit test `sendSlice`: mock `ChatService.addMessage` → verify called with `thinking` and `thinkingElapsedMs` fields when thinking text is present; verify NOT included when thinking text is empty
- [x] **TT.2** ~~verify ordering~~ → Reordering reverted (persist→cache is correct): model message ID only available after persist; with thinking in Firestore, timing race is resolved. Session cache is redundancy fallback.
- [x] **TT.3** Unit test `aiChat`: simulate `onThought` callbacks → verify `thinkingAccumulator` included in stopped message Firestore write; verify `firstThoughtTs`-based elapsed calculation
- [x] **TT.4** Unit test `aiChat`: verify thinking NOT included when no `onThought` callbacks received (no thinking model)
- [x] **TT.5** Regression guard: `aiChat.ts:142-151` — `allMessages` маппит поля explicit (`role, text, attachments, appContext`), thinking НЕ маппится. Добавлен **explicit негативный тест**: `allMessages` entries не содержат `thinking` field. + TT.5b: empty onThought text is ignored.
- [x] **TT.6** `npm run test:run` + `npx vitest run --project functions` — все тесты проходят (1178 = 731+447)

### Verification
```bash
npm run test:run
npx vitest run --project functions
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks
- [ ] Update Phase Status table (Tests → DONE)
- [ ] Record test count

---

## FINAL: Double Review-Fix Cycle

**Goal:** R1 (Architecture) + R2 (Production Readiness) — каждый review выполняется отдельным elite senior dev subagent. Fix all findings → re-verify.

### R1: Architecture Review

Spawn a review subagent:

**Prompt:** "You are an elite senior dev reviewing the Thinking Persistence feature. Read `docs/features/chat/context/thinking-persistence.md` and `docs/features/chat/context/thinking-persistence-tasks.md` for full context. Check:

1. **Two write paths consistency**: Complete messages (frontend `persistAiResponse`) and stopped messages (backend `aiChat.ts`) both write `thinking` + `thinkingElapsedMs` with identical field names and semantics.
2. **No thinking leak into AI context**: `aiChat.ts:142-151` — `allMessages` uses explicit field mapping (not spread). Grep for `thinking` in prompt builders, context assemblers, `buildSystemPrompt`, `buildPersistentContextLayer` — should find zero references to message thinking text.
3. **`persistAiResponse` refactoring**: Now uses object params (`PersistAiResponseParams`), not 11 positional. All call sites updated. No positional parameter confusion possible.
4. **Timing race fix**: `cacheSessionThinking` is called BEFORE `persistAiResponse` in `resumeSendFlow`. Session cache is always populated before Firestore `onSnapshot` can fire.
5. **elapsedMs semantic consistency**: Frontend uses `session.streamStartMs`, backend uses `firstThoughtTs` (first `onThought` callback). Both measure wall-clock time but from different baselines. Document this in feature doc? Already documented?
6. **`ChatService.addMessage` pass-through**: Uses spread (`...message`) + `stripUndefined` — new optional fields pass automatically without changes to service layer.
7. **No broken imports**: `npm run typecheck` + `cd functions && npm run build` pass.
8. **All tests green**: `npm run test:run` + `npx vitest run --project functions`.
9. **Firestore field naming**: `thinking` and `thinkingElapsedMs` — consistent with existing camelCase convention (`tokenUsage`, `normalizedUsage`, `contextBreakdown`)."

Fix all R1 findings.

### R2: Production Readiness Review

Spawn a review subagent:

**Prompt:** "You are an elite senior dev doing a production readiness review of the Thinking Persistence feature. Read `docs/features/chat/context/thinking-persistence.md` for context. Check:

1. **Document size growth**: A conversation with 100 model messages, each with 20KB thinking — total ~2MB across all message docs. Is this within Firestore query limits for `onSnapshot` on the messages collection? (Firestore limit: 1MB per document, no limit on collection query result size, but bandwidth matters.)
2. **Backward compatibility**: Existing messages in Firestore have no `thinking` field. Does the UI handle `msg.thinking === undefined` gracefully? Does ThinkingBubble not render when thinking is absent?
3. **Session cache vs Firestore priority**: When both exist (right after streaming), Firestore wins. Is there a flash where ThinkingBubble disappears and reappears? (Session cache populated before persist → no flash.)
4. **Stopped message edge case**: User clicks Stop before ANY `onThought` callback → `thinkingAccumulator` is empty, `firstThoughtTs` is 0. Is thinking correctly omitted from stopped message? No empty `thinking: ''` written?
5. **Concurrent streams**: User sends message in conversation A, switches to B mid-stream. Does thinking from stream A leak into stream B's persistence? (Check nonce scoping.)
6. **Memory footprint**: `sessionThinkingCache` (Map) grows without bound during a session. Is there a cleanup strategy? Should old entries be evicted?
7. **Firestore Security Rules**: No `hasOnly` constraints — new fields pass. Confirmed?
8. **Error handling**: If `persistAiResponse` fails (Firestore write error), session cache still has thinking. Is this sufficient fallback? Does the user see thinking even if persist fails?
9. **Test coverage**: Are all code paths tested? Complete message with thinking, complete without thinking, stopped with thinking, stopped without thinking, empty thinking text guard.
10. **Docs**: Run `npm run check:docs`. Feature doc updated? Chat README links to thinking-persistence doc?"

Fix all R2 findings.

### Final Verification

```bash
npm run test:run                              # frontend
npx vitest run --project functions            # backend
npm run lint                                  # lint
npm run typecheck                             # types
cd functions && npm run build                 # compile
npm run check                                 # all checks
```

### MANDATORY: Update this file before proceeding
- [x] Mark completed tasks
- [x] Update Phase Status table (FINAL → DONE)
- [x] Record final test count: **1178** (731 frontend + 447 backend, 80 files)
- [x] Update feature doc: Этап 1 ✅ DONE, `← YOU ARE HERE` moved to Этап 2
- [ ] Move task doc to `docs/archive/tasks/chat/context/thinking-persistence-tasks.md`
