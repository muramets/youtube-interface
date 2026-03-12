# Tool History — Tasks

## Overview

Tool results теряются между turns: `aiChat.ts` mapper и `HistoryMessage` interface игнорируют `toolCalls` при чтении из Firestore. Модель в turn 2 не видит raw данные turn 1. Параллельно, `contextBreakdown.toolResults` hardcoded в 0. Фикс: читать toolCalls, реконструировать нативный формат провайдера, обновлять contextBreakdown.

## Quick Context Recovery

1. **Этот файл** — `docs/features/chat/context/tool-history-tasks.md`
2. **Feature doc** — `docs/features/chat/context/tool-history.md`
3. **HistoryMessage interface** — `functions/src/services/ai/types.ts` (строки 60-78)
4. **aiChat.ts mapper** — `functions/src/chat/aiChat.ts` (строки 131-152, 289-304)
5. **Claude buildHistory** — `functions/src/services/claude/streamChat.ts` (строки 215-240)
6. **Gemini buildHistory** — `functions/src/services/gemini/streamChat.ts` (строки 91-137)
7. **memory.ts** — `functions/src/services/memory.ts` (строки 27-40, 110-119)

### Key Decisions (carry forward)

1. **Zero schema changes** — `toolCalls` уже хранятся в Firestore. Проблема только в reading + reconstruction. Не менять формат документов.
2. **Full results, no manual truncation** — tool results хранить в history полностью. `buildMemory()` контролирует переполнение через summarization. Ручная обрезка не нужна.
3. **Reconstruction = flatMap** — `buildHistory()` меняется с `map` на `flatMap`. Model message с `toolCalls` → 3 сообщения провайдера (assistant+tools, user+results, assistant+text).
4. **Synthetic tool_use_id для Claude** — Firestore `ToolCallRecord` не хранит `tool_use_id`. Генерируем `"hist-{msg.id}-{index}"` при реконструкции (уникально между сообщениями). Claude принимает любой string, главное — парность с `tool_result`.
5. **Truncated results в summarizer** — `formatMessageForSummary()` включает `JSON.stringify(result).slice(0, 2000)` — достаточно для Gemini Flash summarizer, не раздувает стоимость.
6. **contextBreakdown fix = post-loop computation** — `toolResults` вычисляется после `router.streamChat()` из `result.toolCalls`, не внутри agentic loop. Считаем только `result` size, не args (args typically <500 chars vs result 25K). Добавить комментарий в коде объясняющий этот выбор.

## Agent Orchestration Strategy

- **Main context = executor + orchestrator.** Все фазы выполняются последовательно.
- **Subagents** — только для Review Gates (R1, R2).
- P2 (Claude) и P3 (Gemini) **можно параллелить** как subagents, но каждый достаточно мал для sequential execution.

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| P1 | Foundation: types + reading + memory | DONE |
| P2 | Claude buildHistory reconstruction | DONE |
| P3 | Gemini buildHistory reconstruction | DONE |
| P4 | contextBreakdown fix | DONE |
| FINAL | Double review (R1 + R2) | DONE |

## Current Test Count

**Baseline (2026-03-10):** 360 frontend (25 files) + 699 backend (48 files) = 1059 total (73 files)
**Final (2026-03-12):** 384 frontend (26 files) + 747 backend (50 files) = 1131 total (76 files)
⚠️ Verify before starting: `npx vitest run --project frontend` + `npx vitest run --project functions`

---

## P1: Foundation — types + reading + memory

**Goal:** `HistoryMessage` читает `toolCalls`, `estimateTokens()` учитывает их в бюджете, `formatMessageForSummary()` включает tool info.

### Critical Context

- `HistoryMessage` в `ai/types.ts` — provider-agnostic interface. НЕ импортирует provider-specific types.
- `ToolCallRecord` уже определён в `ai/types.ts:174-178` — в том же файле. Просто добавить optional поле.
- `aiChat.ts:143-152` — mapper из Firestore. Добавить одну строку.
- `estimateTokens()` в `memory.ts:27-40` — считает `msg.text.length / 4`. Должен учитывать `JSON.stringify(msg.toolCalls).length / 4`.
- `formatMessageForSummary()` в `memory.ts:110-119` — форматирует для Gemini Flash summarizer. Добавить tool info.
- ⚠️ `estimateTokens()` влияет на `buildMemory()` trigger — после фикса summarization будет срабатывать раньше для tool-heavy conversations. Это корректное поведение.

### Tasks

- [x] **T1.1** — Добавить `toolCalls` в `HistoryMessage`
  - Modify: `functions/src/services/ai/types.ts`
  - Добавить optional поле `toolCalls?: ToolCallRecord[]` в interface `HistoryMessage` (после `appContext`)
  - `ToolCallRecord` уже в этом файле (строка 174) — импорт не нужен

- [x] **T1.2** — Читать `toolCalls` в aiChat.ts mapper
  - Modify: `functions/src/chat/aiChat.ts`
  - В mapper (строка 143-152) добавить: `toolCalls: data.toolCalls as ToolCallRecord[] | undefined`
  - Import `ToolCallRecord` из `../services/ai/types.js` (уже импортируется `HistoryMessage` оттуда)
  - ⚠️ Убедиться что import `type { ToolCallRecord }` — не value import

- [x] **T1.3** — Обновить `estimateTokens()` для toolCalls
  - Modify: `functions/src/services/memory.ts`
  - В цикле `estimateTokens()` (строка 27-40) добавить:
    ```
    if (msg.toolCalls) {
        total += Math.ceil(JSON.stringify(msg.toolCalls).length / CHARS_PER_TOKEN);
    }
    ```
  - Это влияет на `buildMemory()` budget — tool-heavy conversations будут summarized раньше

- [x] **T1.4** — Обновить `formatMessageForSummary()` для tool info
  - Modify: `functions/src/services/memory.ts`
  - В `formatMessageForSummary()` (строка 110-119) добавить после text formatting:
    ```
    if (msg.toolCalls?.length) {
        const toolLines = msg.toolCalls.map(tc => {
            const resultStr = tc.result ? JSON.stringify(tc.result) : 'no result';
            const truncated = resultStr.length > 2000
                ? resultStr.slice(0, 2000) + '...'
                : resultStr;
            return `  ${tc.name}(${JSON.stringify(tc.args)}) → ${truncated}`;
        });
        text += '\n[Tools used]\n' + toolLines.join('\n');
    }
    ```
  - Truncation 2000 chars — достаточно для summarizer, не раздувает cost

- [x] **T1.5** — Тесты для P1
  - Modify: `functions/src/services/__tests__/memory.test.ts`
  - Modify: `functions/src/chat/__tests__/aiChat.thinkingPersistence.test.ts`
  - **memory.test.ts — estimateTokens:**
    - Тест: message с toolCalls увеличивает token estimate
    - Тест: message без toolCalls — поведение не меняется (регрессия)
    - Тест: toolCalls с пустым result — корректный подсчёт
  - **memory.test.ts — formatMessageForSummary:**
    - Тест: model message с toolCalls → output содержит `[Tools used]` + tool name + args
    - Тест: result truncated при > 2000 chars
    - Тест: message без toolCalls — output не меняется (регрессия)
    - Тест: toolCall с `result: undefined` → output содержит "no result"
  - **aiChat test:**
    - Тест: mapper включает `toolCalls` в HistoryMessage когда присутствует в Firestore doc
    - Тест: mapper omits `toolCalls` когда отсутствует (undefined, не пустой массив)

### Parallelization

```
T1.1 — SEQUENTIAL FIRST (types, all depend on it)
T1.2 + T1.3 + T1.4 — PARALLEL (independent files)
T1.5 — SEQUENTIAL LAST (tests for all above)
```

### Verification

```bash
npx vitest run --project functions
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: P1 → DONE
- [ ] Record test count

### Review Gate 1

**Prompt:** "Review P1 (Foundation). Read files:
1. `functions/src/services/ai/types.ts` — HistoryMessage interface
2. `functions/src/chat/aiChat.ts` — mapper (lines 131-160)
3. `functions/src/services/memory.ts` — estimateTokens + formatMessageForSummary
4. `functions/src/services/__tests__/memory.test.ts` — new tests

Check:
1. `HistoryMessage.toolCalls` is optional and uses existing `ToolCallRecord` type
2. aiChat.ts mapper reads toolCalls without breaking existing fields
3. `estimateTokens()` correctly counts toolCalls in token budget
4. `formatMessageForSummary()` includes tool name + args + truncated result
5. Truncation limit is 2000 chars
6. All new tests pass: `npx vitest run --project functions`
7. `npm run check` passes (lint + typecheck)"

Fix all findings before moving to P2.

---

## P2: Claude buildHistory Reconstruction

**Goal:** Claude `buildHistory()` разворачивает model messages с `toolCalls` в нативные `tool_use`/`tool_result` message blocks.

### Critical Context

- Claude `buildHistory()` в `streamChat.ts:215-240` — sync function, returns `MessageParam[]`
- Текущая реализация: `messages.map(msg => ...)` → одно сообщение на один HistoryMessage
- После фикса: `messages.flatMap(msg => ...)` — model message с toolCalls → 3 MessageParam
- ⚠️ Claude **требует strict alternation**: user → assistant → user → assistant. Реконструкция сохраняет чередование:
  ```
  ...previous user msg → assistant[tool_use] → user[tool_result] → assistant[text] → next user msg...
  ```
- ⚠️ Claude **требует `tool_use_id`** в `tool_use` block и matching id в `tool_result`. Firestore не хранит id → генерируем synthetic `"hist-{i}"`.
- ⚠️ `ToolUseBlockParam` и `ToolResultBlockParam` уже импортированы (строка 25-26)
- ⚠️ **Invariant:** Firestore guarantees strict user/model alternation — one document per turn. `toolCalls` array contains ALL agentic loop iterations from that single turn (even if loop ran 5 iterations). Two consecutive model messages with toolCalls cannot occur.
- Edge case: `toolCalls` с `result: undefined` (stopped message) — пропускать tool reconstruction, оставить только text
- Edge case: model message с `toolCalls` но пустой `text` — маловероятно (agentic loop всегда заканчивается text), но если случится — не добавлять пустой text block

### Tasks

- [x] **T2.1** — Реконструкция tool blocks в Claude `buildHistory()`
  - Modify: `functions/src/services/claude/streamChat.ts`
  - Заменить `messages.map(...)` на `messages.flatMap(...)` в `buildHistory()` (строка 216)
  - Для `msg.role === 'model'` с `msg.toolCalls?.length > 0` (и все results defined):
    1. `assistant` message: attachment blocks (existing) + `tool_use` blocks
    2. `user` message: `tool_result` blocks
    3. `assistant` message: text block (if text is non-empty)
  - Для messages без toolCalls или user messages — текущая логика без изменений
  - `tool_use_id` генерация: `\`hist-${msg.id}-${index}\`` — unique per message + tool index
  - ⚠️ Если хотя бы один `toolCall.result` is undefined → fallback к текущей логике (только text). Это покрывает stopped messages.

- [x] **T2.2** — Тесты для Claude buildHistory reconstruction
  - Modify: `functions/src/services/claude/__tests__/streamChat.test.ts`
  - ⚠️ `buildHistory` — private function. Тестировать через contract tests `streamChat()`:
    - Тест: history message с toolCalls → mock Claude API получает reconstructed tool blocks. Verify **содержимое**, не только типы: `tool_use.input` содержит оригинальные args values, `tool_result.content` содержит result JSON с конкретными videoIds/данными из ToolCallRecord
    - Тест: tool_use_id matching — каждый tool_result.tool_use_id matches tool_use.id
    - Тест: message alternation — strict user/assistant/user/assistant sequence
    - Тест: multiple tool calls in one message → batched in single assistant+user pair
    - Тест: history message без toolCalls → standard single message (регрессия)
    - Тест: history message с toolCalls где result undefined → fallback to text only
    - Тест: text-only model message (no toolCalls) → unchanged behavior

### Parallelization

```
T2.1 — SEQUENTIAL FIRST
T2.2 — SEQUENTIAL LAST
```

### Verification

```bash
npx vitest run --project functions -- streamChat
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: P2 → DONE
- [ ] Record test count

### Review Gate 2

**Prompt:** "Review P2 (Claude reconstruction). Read:
1. `functions/src/services/claude/streamChat.ts` — buildHistory function
2. `functions/src/services/claude/__tests__/streamChat.test.ts` — new tests

Check:
1. `buildHistory()` uses `flatMap` (not `map`)
2. Model messages with `toolCalls` produce exactly 3 MessageParam entries (assistant+tool_use, user+tool_result, assistant+text)
3. `tool_use_id` is synthetic, unique, and matches between tool_use and tool_result
4. Message alternation is strictly user/assistant/user/assistant
5. Model messages with undefined results fallback to text-only
6. Empty text doesn't produce empty text block
7. Existing tests still pass (regression)
8. `npx vitest run --project functions -- streamChat` passes
9. `npm run check` passes"

Fix all findings before moving to P3.

---

## P3: Gemini buildHistory Reconstruction

**Goal:** Gemini `buildHistory()` разворачивает model messages с `toolCalls` в нативные `functionCall`/`functionResponse` parts.

### Critical Context

- Gemini `buildHistory()` в `streamChat.ts:91-137` — **async** function (file uploads), returns `Promise<Content[]>`
- Текущая реализация: `Promise.all(messages.map(async msg => ...))` → один Content на один HistoryMessage
- После фикса: map + flat — model message с toolCalls → 3 Content entries
- ⚠️ Gemini использует SDK helper `createPartFromFunctionCall` и `createPartFromFunctionResponse` — уже lazy-loaded в `getPartFactories()` (строки 10-26). Но `buildHistory()` не использует их — нужно добавить.
- ⚠️ `buildHistory()` принимает `apiKey` для file re-uploads. Reconstruction не требует API calls — чистая трансформация данных.
- Gemini `functionResponse` требует `name` matching `functionCall.name` — доступен в `ToolCallRecord.name`
- Gemini не требует id (в отличие от Claude)
- ⚠️ **Invariant:** Firestore guarantees strict user/model alternation — one document per turn. `toolCalls` array contains ALL agentic loop iterations from that single turn (even if loop ran 5 iterations). Two consecutive model messages with toolCalls cannot occur.
- Edge case: так же как Claude — toolCalls с undefined result → fallback to text only

### Tasks

- [x] **T3.1** — Реконструкция function parts в Gemini `buildHistory()`
  - Modify: `functions/src/services/gemini/streamChat.ts`
  - `buildHistory()` async map → async flatMap equivalent (map + Promise.all + flat)
  - Для `msg.role === 'model'` с `msg.toolCalls?.length > 0` (все results defined):
    1. `model` Content: `functionCall` parts (один part на tool call)
    2. `user` Content: `functionResponse` parts (один part на tool call)
    3. `model` Content: text part (if text is non-empty)
  - Для messages без toolCalls — текущая логика без изменений
  - Использовать `getPartFactories()` (уже lazy-loaded в модуле) для `createPartFromFunctionCall` и `createPartFromFunctionResponse`
  - ⚠️ `getPartFactories()` — async. `buildHistory()` уже async — не проблема.
  - ⚠️ Lazy import `getPartFactories()` вызывать один раз за вызов buildHistory, не per-message.

- [x] **T3.2** — Тесты для Gemini buildHistory reconstruction
  - Modify: `functions/src/services/gemini/__tests__/streamChat.contract.test.ts`
  - ⚠️ `buildHistory` — private. Тестировать через contract tests:
    - Тест: history message с toolCalls → mock Gemini API получает reconstructed function parts. Verify **содержимое**, не только типы: `functionCall.args` содержит оригинальные args values, `functionResponse.response` содержит result JSON с конкретными videoIds/данными из ToolCallRecord
    - Тест: functionCall.name matches functionResponse.name
    - Тест: model/user/model role alternation correct
    - Тест: multiple tool calls → batched in single model+user pair
    - Тест: history message без toolCalls → standard single Content (регрессия)
    - Тест: toolCalls с undefined result → fallback to text only

### Parallelization

```
T3.1 — SEQUENTIAL FIRST
T3.2 — SEQUENTIAL LAST
```

### Verification

```bash
npx vitest run --project functions -- streamChat
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: P3 → DONE
- [ ] Record test count

### Review Gate 3

**Prompt:** "Review P3 (Gemini reconstruction). Read:
1. `functions/src/services/gemini/streamChat.ts` — buildHistory function
2. `functions/src/services/gemini/__tests__/streamChat.contract.test.ts` — new tests

Check:
1. Model messages with toolCalls produce 3 Content entries
2. `createPartFromFunctionCall` and `createPartFromFunctionResponse` used correctly
3. `getPartFactories()` called once per buildHistory invocation (not per message)
4. functionCall.name matches functionResponse.name
5. Undefined results → fallback to text only
6. Existing tests still pass
7. `npx vitest run --project functions -- streamChat` passes
8. `npm run check` passes"

Fix all findings before moving to P4.

---

## P4: contextBreakdown Fix

**Goal:** `contextBreakdown.toolResults` отражает реальный размер tool data после agentic loop.

### Critical Context

- `contextBreakdown` формируется в `aiChat.ts:289-304` — **до** вызова `router.streamChat()`
- `toolResults: 0` hardcoded (строка 297)
- `router.streamChat()` возвращает `result.toolCalls` — массив `ToolCallRecord[]` с `result` objects
- Нужно обновить `contextBreakdown.toolResults` **после** `router.streamChat()`, перед отправкой `done` SSE event
- ⚠️ `contextBreakdown` — `const`, но object fields mutable. Просто присвоить новое значение `contextBreakdown.toolResults = ...`
- `scaleBreakdown()` в `tokenDisplay.ts:74` уже обрабатывает `toolResults` в `TEXT_KEYS` — UI подхватит автоматически, zero frontend changes

### Tasks

- [x] **T4.1** — Вычислить toolResults после agentic loop
  - Modify: `functions/src/chat/aiChat.ts`
  - После строки 323 (`const { text: responseText, ... } = result;`) добавить:
    ```
    // Update contextBreakdown with actual tool results size (post agentic loop).
    // NOTE: counts only result size, not args. Args are typically small (<500 chars).
    // If a tool with large args appears, consider including args in this calculation.
    if (result.toolCalls?.length) {
        contextBreakdown.toolResults = result.toolCalls.reduce(
            (sum, tc) => sum + JSON.stringify(tc.result ?? {}).length, 0
        );
    }
    ```
  - Это обновит contextBreakdown перед `writeSSE(res, { type: "done", ..., contextBreakdown })` (строка 351)

- [x] **T4.2** — Тесты для contextBreakdown fix
  - Modify: `functions/src/chat/__tests__/aiChat.thinkingPersistence.test.ts`
  - Тест: после streamChat с tool calls → contextBreakdown.toolResults > 0
  - Тест: после streamChat без tool calls → contextBreakdown.toolResults === 0
  - ⚠️ Если aiChat тестируется через integration test с mocked router — verify contextBreakdown в `done` SSE event

- [x] **T4.3** — Обновить feature doc
  - Modify: `docs/features/chat/context/tool-history.md`
  - Обновить "Текущее состояние" → реализовано
  - Обновить Roadmap checkboxes
  - Обновить Technical Implementation если появились новые файлы

### Parallelization

```
T4.1 + T4.2 — SEQUENTIAL (test depends on implementation)
T4.3 — SEQUENTIAL LAST (after verification)
```

### Verification

```bash
npx vitest run --project functions
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: P4 → DONE
- [ ] Record test count

### Review Gate 4

**Prompt:** "Review P4 (contextBreakdown). Read:
1. `functions/src/chat/aiChat.ts` — toolResults computation (after router.streamChat)
2. Test file for aiChat

Check:
1. `contextBreakdown.toolResults` computed from `result.toolCalls` AFTER router.streamChat()
2. Uses `JSON.stringify(tc.result ?? {}).length` (handles undefined results)
3. Computed BEFORE `writeSSE(res, { type: 'done' ... })` (не после)
4. scaleBreakdown() in tokenDisplay.ts already handles non-zero toolResults (no frontend changes)
5. Feature doc updated
6. `npx vitest run --project functions` passes
7. `npm run check` passes"

Fix all findings before FINAL.

---

## FINAL: Double Review

### R1: Architecture Review

**Prompt:** "Architecture review для Tool History feature. Прочитай файлы:
1. `docs/features/chat/context/tool-history.md` — feature doc
2. `functions/src/services/ai/types.ts` — HistoryMessage interface
3. `functions/src/chat/aiChat.ts` — mapper + contextBreakdown
4. `functions/src/services/claude/streamChat.ts` — buildHistory
5. `functions/src/services/gemini/streamChat.ts` — buildHistory
6. `functions/src/services/memory.ts` — estimateTokens + formatMessageForSummary

Проверить:
1. `HistoryMessage.toolCalls` — optional, uses existing `ToolCallRecord`, no new types
2. aiChat mapper reads toolCalls without breaking existing fields
3. Claude reconstruction: strict alternation, synthetic tool_use_id, correct block types
4. Gemini reconstruction: correct parts, lazy SDK import efficiency
5. Both providers: fallback to text-only when toolCall.result is undefined
6. `estimateTokens()` accounts for toolCalls correctly
7. `formatMessageForSummary()` truncates results at 2000 chars
8. `contextBreakdown.toolResults` computed after agentic loop, before SSE done event
9. No new files created (all changes in existing files)
10. Zero Firestore schema changes
11. `npx vitest run --project functions && npm run check`"

Fix all findings before proceeding to R2.

### R2: Production Readiness Review

**Prompt:** "Production readiness check для Tool History:
1. `npm run check` passes? (lint + typecheck + doc links)
2. Frontend tests pass? `npx vitest run --project frontend`
3. Backend tests pass? `npx vitest run --project functions`
4. No regressions in existing streamChat tests (Claude: 44 tests, Gemini: 35 tests)
5. No regressions in memory tests (51 tests)
6. Edge cases covered: undefined results, empty text, no toolCalls, stopped messages
7. Feature doc up to date with implementation
8. Agentic architecture doc needs update? (tool data in history is a new capability)
9. Token optimization doc needs update? (tool results add to context size)
10. No console.error or console.warn left from debugging
11. All new code follows existing patterns (no new abstractions, no new files)"

Fix all findings.

### MANDATORY: Update this file after FINAL
- [ ] Mark R1 + R2 complete
- [ ] Update Phase Status table (FINAL → DONE)
- [ ] Record final test count
- [ ] Move this file to `docs/archive/tasks/chat/` after completion
