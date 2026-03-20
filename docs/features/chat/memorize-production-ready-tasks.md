# Memorize Production-Ready Refactoring — Task Document

## Quick Context Recovery

При потере контекста читать в этом порядке:

1. **Этот файл** — `docs/features/chat/memorize-production-ready-tasks.md`
2. **Feature doc** — `docs/features/knowledge/knowledge-items.md` (секция saveMemory + Memorize flow)
3. **Backend handler** — `functions/src/services/tools/handlers/knowledge/saveMemory.ts`
4. **Tool definitions** — `functions/src/services/tools/definitions.ts` (строки 636–692)
5. **Frontend UI** — `src/features/Chat/ChatInput.tsx` (строки 125–195, 428–476)

---

## Key Decisions (carry forward)

1. **Always-available saveMemory** — tool переносится из `CONCLUDE_TOOL_DECLARATIONS` в `TOOL_DECLARATIONS`. Tool list никогда не меняется → cache breakpoint BP2 остаётся стабильным → нет $5 penalty за cache invalidation. `CONCLUDE_TOOL_DECLARATIONS` остаётся как пустой export `[]` для backward compat (test mocks reference его). Будет удалён в будущем cleanup pass.

2. **Deterministic doc ID + upsert** — memory doc хранится с ID = `conversationId` (вместо auto-generated). `db.doc(memoriesPath/${conversationId}).get()` → exists ? `update` : `set`. 60-секундный idempotency guard удаляется. Deterministic ID гарантирует один memory doc на conversation by design — race condition невозможен (два concurrent `set` запишут в один и тот же документ, последний победит).

3. **Full snapshot, не delta** — каждый вызов `saveMemory` пишет полный контент. LLM имеет весь контекст разговора + предыдущие tool results в истории → не нужно читать предыдущую memory перед записью.

4. **4-state button** — `isMemorizing && isStreaming` показывает Stop (Square), не Check. Позволяет пользователю прервать memorize-стрим. Mechanism abort (`stopGeneration()` в streamingSlice) уже работает для memorize — тот же dual-channel через AbortController + Firestore `abortRequested`.

5. **CONCLUDE_INSTRUCTION остаётся** — кнопка Memorize по-прежнему отправляет синтетический `CONCLUDE_INSTRUCTION` как user message. Это один из триггеров для saveMemory, но не единственный. LLM может вызвать saveMemory в любой момент разговора.

6. **Tool description обновляется** — убираем "ONLY available during memorize/conclude turns", добавляем конкретные триггеры: "Call when the conversation reaches a significant milestone worth remembering across sessions (e.g., after completing a multi-tool analysis, making a strategic decision, or reaching a conclusion about content strategy), or during memorize/conclude flow."

7. **Нет isConclude guard в handler** — handler `saveMemory.ts` не проверяет `ctx.isConclude`. Любой вызов saveMemory (conclude или обычный чат) обрабатывается одинаково.

8. **conversationTitle обновляется при upsert** — при update memory conversationTitle берётся из текущего conv doc (уже читается orphan guard). Если юзер переименовал чат — memory отразит актуальное название.

---

## Agent Orchestration Strategy

- **Main context = executor + orchestrator.** Все фазы выполняются последовательно в main context.
- **Subagent** — только для Review Gates (R1, R2 в FINAL фазе).
- Параллелизация внутри фаз возможна для независимых задач (указана в каждой фазе).
- **Memory update** — после каждой фазы обновить этот файл: отметить checkboxes, обновить статус, записать test count.

---

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| P1 | Backend: always-available saveMemory + upsert | TODO |
| P2 | Frontend: 4-state button fix | TODO |
| P3 | Test updates + cleanup | TODO |
| FINAL | Double review-fix cycle | TODO |

---

## Current Test Count

- **Frontend:** 580 (42 files)
- **Backend:** 874 (61 files)
- **Total:** 1454 (103 files)

Получено запуском `npx vitest run --project frontend` и `npx vitest run --project functions` отдельно (2026-03-20).

---

## Phase 1: Backend — Always-Available saveMemory + Upsert

### Goal
Перенести `saveMemory` в `TOOL_DECLARATIONS`, обновить handler на upsert-паттерн, удалить `CONCLUDE_TOOL_DECLARATIONS`.

### Critical Context

- ⚠️ **Cache invalidation — корень проблемы.** Сейчас tool list меняется при `isConclude=true` (17 tools → 18 tools). Breakpoint BP2 (`streamChat.ts:584-586`) ставится на последний tool в массиве. Если массив другой длины — cache miss на всю tool-секцию. При 400K контексте = ~$2.50 за cache_write × 2 (memorize + следующее обычное сообщение) = **$5 penalty**.
- ⚠️ **`CONCLUDE_TOOL_DECLARATIONS` импортируется в 4 местах:** `definitions.ts` (export), `aiChat.ts` (conditional injection), `aiChat.conclude.test.ts` (tests), `aiChat.serverPersist.test.ts` (mock — уже `[]`, но нужно verify). Все четыре нужно обновить или verify.
- ⚠️ **Executor (`executor.ts`) уже содержит handler.** `HANDLERS[TOOL_NAMES.SAVE_MEMORY]` уже зарегистрирован на строке 55. Executor работает по имени tool, не по массиву declarations → handler будет вызван вне зависимости от того, в каком массиве объявлен tool.
- ⚠️ **`console.warn` в handler** — нарушает правило "console.* banned". Заменить на `logger.*` при рефакторинге (если logger доступен в functions, иначе оставить — правило относится к application code, functions используют console по конвенции).
- ⚠️ **`aiChat.ts` строка 413** — conditional tool injection. После рефакторинга tool list всегда одинаковый: просто `TOOL_DECLARATIONS`. Condition `body.isConclude ?` для tools больше не нужен.
- ℹ️ **Tech debt (out of scope):** `executor.ts:81` использует `console.log` (banned) → заменить на `console.info` в будущем cleanup pass.

### Tasks

#### T1.1 — Move saveMemory into TOOL_DECLARATIONS (SEQUENTIAL FIRST)

- [ ] `functions/src/services/tools/definitions.ts`:
  - Переместить `saveMemory` tool definition (строки 638–665) **в массив** `TOOL_DECLARATIONS` (строка 669). Поставить после `getKnowledge` (последний KI tool).
  - Обновить `description` tool: убрать "ONLY available during memorize/conclude turns." Заменить на: `"Save or update a cross-conversation memory summarizing key decisions and insights. Call when the conversation reaches a significant milestone worth remembering across sessions (e.g., after completing a multi-tool analysis, making a strategic decision, or reaching a conclusion about content strategy), or during memorize/conclude flow. The memory should reference Knowledge Items using [Title](ki://kiId) links, NOT duplicate their content. Keep the memory concise — it's a pointer, not a copy. Include: key decisions made, open questions, action items, and KI references."`
  - Опустошить `CONCLUDE_TOOL_DECLARATIONS`: изменить на `export const CONCLUDE_TOOL_DECLARATIONS: ToolDefinition[] = [];` (сохранить пустой экспорт — `aiChat.serverPersist.test.ts` мочит его).
  - Удалить комментарий `// --- Conclude-only tools (injected when isConclude = true) ---` (строка 636) и `/** Conclude-only tools — injected into tool list when isConclude = true */` (строка 689).
  - Обновить `content` parameter description (строка 653): заменить `"Reference KI by title (not raw ID)."` на `"Reference KI using [Title](ki://kiId) links."`.
  - ⚠️ **BP2 side-effect:** после переноса `saveMemory` становится последним элементом `TOOL_DECLARATIONS`. BP2 (`streamChat.ts:584-586`) ставит `cache_control` на последний tool → теперь это `saveMemory`. Это корректно (BP2 маркирует конец tool-секции, не привязан к конкретному имени).

#### T1.2 — Simplify aiChat.ts tool injection

- [ ] `functions/src/chat/aiChat.ts`:
  - Строка 413: заменить `tools: body.isConclude ? [...TOOL_DECLARATIONS, ...CONCLUDE_TOOL_DECLARATIONS] : TOOL_DECLARATIONS` на `tools: TOOL_DECLARATIONS`.
  - Удалить import `CONCLUDE_TOOL_DECLARATIONS` из строки 19 (оставить только `TOOL_DECLARATIONS`).
  - ⚠️ **Не трогать другие `isConclude` usages** на строках 385, 411, 412, 414 — они про conclude context injection (KI list), attachments skip, и toolContext. Эти остаются.
  - **Verify** `src/core/config/concludePrompt.ts` — CONCLUDE_INSTRUCTION не содержит фразу "saveMemory is only available during conclude" (текущий текст говорит "call saveMemory" — это валидно).

#### T1.3 — Refactor saveMemory handler to deterministic ID + upsert

- [ ] `functions/src/services/tools/handlers/knowledge/saveMemory.ts`:
  - **Удалить** 60-секундный idempotency guard (строки 32–51: запрос `where("conversationId", "==", ...)` + `where("createdAt", ">=", recentCutoff)` + early return).
  - **Заменить** `db.collection(memoriesPath).add(memoryData)` на **deterministic ID**:
    ```typescript
    const memoryRef = db.doc(`${memoriesPath}/${ctx.conversationId}`);
    const existing = await memoryRef.get();
    if (existing.exists) {
        // Update: only content, updatedAt, kiRefs, conversationTitle (refreshed)
        await memoryRef.update({
            content, conversationTitle, updatedAt: FieldValue.serverTimestamp(),
            ...(validKiRefs.length > 0 ? { kiRefs: validKiRefs } : {}),
        });
        return { content: "Memory updated ...", memoryId: ctx.conversationId, updated: true };
    } else {
        // Create: full document
        await memoryRef.set({
            conversationId: ctx.conversationId, conversationTitle, content,
            createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
            ...(validKiRefs.length > 0 ? { kiRefs: validKiRefs } : {}),
        });
        return { content: "Memory saved ...", memoryId: ctx.conversationId };
    }
    ```
  - **Удалить** field `skipped` из return — теперь нет idempotency skip, есть `updated: true`.
  - **Сохранить** orphan guard (проверка что conversation exists) — `convData` уже содержит `conversationTitle`.
  - **Сохранить** KI refs validation logic (db.getAll для проверки kiRefs).
  - **Обновить** комментарий в шапке файла: убрать "Conclude-only tool" → "Cross-conversation memory tool. Deterministic doc ID (= conversationId), upsert: get → exists ? update : set."
  - ⚠️ **При update — не перезаписывать `createdAt`**. Update пишет `content`, `updatedAt`, `kiRefs`, `conversationTitle` (refreshed из conv doc). `createdAt` остаётся из оригинального документа.

#### T1.4 — Add Knowledge Item References section to system prompt + CONCLUDE_INSTRUCTION

- [ ] `src/core/config/prompts.ts` (между секцией "### Video References" (строка 44) и "### Response Quality" (строка 55)):
  - Добавить новую секцию **"### Knowledge Item References"** по аналогии с Video References:
    ```
    ### Knowledge Item References
    How to reference a Knowledge Item:
    Write `[KI Title](ki://kiId)` in your text — creates an interactive link with tooltip showing KI metadata.

    kiIds: available from saveKnowledge results, listKnowledge results, or getKnowledge results. Never invent IDs.
    ```
  - ⚠️ **Не менять Video References** — только добавить новую секцию после неё.

- [ ] `src/core/config/concludePrompt.ts`:
  - Заменить `"Reference Knowledge Items by TITLE (not raw ID)"` на `"Reference Knowledge Items using [Title](ki://kiId) links — not raw IDs"`.
  - Заменить `"In your final text response, reference Knowledge Items by TITLE (not raw ID). Example: \"Created Knowledge Item: Channel Performance Journey\" — not \"KI: jSZc2L1ctPd7xh9KLLgc\"."` на `"In your final text response, reference Knowledge Items using [Title](ki://kiId) links. Example: \"Created [Channel Performance Journey](ki://jSZc2L1ctPd7xh9KLLgc)\" — not plain text titles or raw IDs."`.
  - Строка 33: заменить `reference by ID` на `reference using [Title](ki://kiId) links`.
  - ⚠️ **Проверить все упоминания KI ссылок в файле** — заменить "by TITLE" / "by ID" на `ki://` синтаксис wherever applicable.

### Parallelization Plan

```
T1.1 — SEQUENTIAL FIRST (saveMemory → TOOL_DECLARATIONS, удаление CONCLUDE_TOOL_DECLARATIONS)
T1.2 + T1.3 — PARALLEL (aiChat.ts + saveMemory handler — независимы)
T1.4 — PARALLEL с T1.2/T1.3 (system prompt + CONCLUDE_INSTRUCTION — независимы от backend changes)
```

### Verification

```bash
# TypeScript compile
cd /Users/muramets/Documents/youtube-interface && npm run check

# Verify saveMemory is in TOOL_DECLARATIONS
grep -n "saveMemory" functions/src/services/tools/definitions.ts

# Verify CONCLUDE_TOOL_DECLARATIONS is empty
grep -A1 "CONCLUDE_TOOL_DECLARATIONS" functions/src/services/tools/definitions.ts

# Verify aiChat.ts no longer references CONCLUDE_TOOL_DECLARATIONS
grep "CONCLUDE_TOOL_DECLARATIONS" functions/src/chat/aiChat.ts  # should return nothing

# Verify KI reference syntax in prompts
grep "ki://" src/core/config/prompts.ts src/core/config/concludePrompt.ts

# Run all tests
npx vitest run --project frontend
npx vitest run --project functions
```

### MANDATORY: Update this file before proceeding
- [ ] Mark T1.1, T1.2, T1.3, T1.4 checkboxes
- [ ] Update Phase 1 status → DONE
- [ ] Record test count

---

## Phase 2: Frontend — 4-State Button Fix

### Goal
Исправить ChatInput.tsx: при `isMemorizing && isStreaming` показывать Stop button, позволяя пользователю прервать memorize-стрим.

### Critical Context

- ⚠️ **Текущий баг**: кнопки в `ChatInput.tsx` (строки 442–475) используют взаимоисключающий if-else: `isMemorizing ? (Check/Loader) : isStreaming ? (Stop) : (Send)`. Когда memorize стримит, `isMemorizing=true` проверяется первым → Check кнопка, Stop никогда не появляется.
- ⚠️ **`isMemorizeSaving` vs `isStreaming`**: `isMemorizeSaving` — локальный state в ChatInput, выставляется в `handleMemorizeSend` (строка 170). `isStreaming` — глобальный state из chatStore (streamingSlice). После вызова `memorizeConversation()`, `sendMessage()` внутри выставляет `isStreaming=true`. Оба true одновременно во время memorize стрима.
- ⚠️ **`stopGeneration()` уже работает для memorize** — тот же dual-channel (AbortController + Firestore `abortRequested`). Нужно только показать Stop button.
- ⚠️ **`disabled` на Brain button (строка 434)**: `disabled={disabled || isStreaming || isMemorizeSaving}`. Это правильно — нельзя переключить memorize mode во время стрима.

### Tasks

#### T2.1 — Fix 4-state button logic

- [ ] `src/features/Chat/ChatInput.tsx` (строки 442–475):
  - Заменить 3-way ternary на 4-state logic:
  ```tsx
  {isMemorizing && !isStreaming ? (
      // State 1: Memorize mode, not streaming → Check button (submit guidance)
      <button ... onClick={handleMemorizeSend} disabled={isMemorizeSaving}>
          {isMemorizeSaving ? <Loader2 .../> : <Check .../>}
      </button>
  ) : isStreaming ? (
      // State 2+3: Streaming (normal or memorize) → Stop button
      <button ... onClick={onStop}>
          <Square .../>
      </button>
  ) : (
      // State 4: Idle → Send button
      <button ... onClick={handleSend} disabled={disabled || !canSend}>
          {isAnyUploading ? <Loader2 .../> : <Send .../>}
      </button>
  )}
  ```
  - ⚠️ **Ключевое изменение**: условие `isMemorizing ?` заменяется на `isMemorizing && !isStreaming ?`. Если `isStreaming=true`, попадаем во второй branch (Stop button) вне зависимости от `isMemorizing`.
  - Сохранить все существующие className, onClick handlers, disabled states, icons.
  - Единственное отличие от текущего кода: добавить `&& !isStreaming` к первому условию.

#### T2.2 — Verify memorize toggle disabled state

- [ ] `src/features/Chat/ChatInput.tsx` (строка 434):
  - Убедиться, что Brain toggle button имеет `disabled={disabled || isStreaming || isMemorizeSaving}` — это уже есть, просто verify.
  - Нет изменений нужно, только проверка.

### Parallelization Plan

```
T2.1 — SEQUENTIAL (единственная задача с изменением кода)
T2.2 — VERIFY ONLY (нет изменений)
```

### Verification

```bash
# TypeScript + lint
cd /Users/muramets/Documents/youtube-interface && npm run check

# Run frontend tests
npx vitest run --project frontend
```

### MANDATORY: Update this file before proceeding
- [ ] Mark T2.1, T2.2 checkboxes
- [ ] Update Phase 2 status → DONE
- [ ] Record test count

---

## Phase 3: Test Updates + Cleanup

### Goal
Обновить существующие тесты под новое поведение (upsert, always-available tool), удалить устаревшие тесты, добавить новые для upsert-path.

### Critical Context

- ⚠️ **`aiChat.conclude.test.ts`** — тесты "TOOL_DECLARATIONS does NOT include saveMemory" и "CONCLUDE_TOOL_DECLARATIONS includes saveMemory" теперь должны быть инвертированы. saveMemory ЕСТЬ в TOOL_DECLARATIONS, CONCLUDE_TOOL_DECLARATIONS пустой.
- ⚠️ **`saveMemory.test.ts`** — тест "returns existing Memory if duplicate within 60s (idempotency)" удаляется. Добавляются тесты для deterministic ID upsert: "updates existing memory" и "creates new memory".
- ⚠️ **Mock structure** — с deterministic ID мочить нужно `db.doc(path).get()`, `db.doc(path).set()`, `db.doc(path).update()` вместо `db.collection().where().limit().get()`. Проще чем раньше.
- ⚠️ **`aiChat.conclude.test.ts` строка 33** — тест `isConclude=true produces combined tool list` больше не валиден. Tool list одинаковый вне зависимости от `isConclude`.
- ⚠️ **`aiChat.serverPersist.test.ts` строка 89** — mock `CONCLUDE_TOOL_DECLARATIONS: []` уже корректен (пустой массив). Verify only, не нужно менять.

### Tasks

#### T3.1 — Update aiChat.conclude.test.ts

- [ ] `functions/src/chat/__tests__/aiChat.conclude.test.ts`:
  - **Удалить** тест: `"TOOL_DECLARATIONS does NOT include saveMemory"` (строка 11) — теперь saveMemory IS в TOOL_DECLARATIONS.
  - **Добавить** тест: `"TOOL_DECLARATIONS includes saveMemory"` — проверить что `TOOL_DECLARATIONS.map(t => t.name)` содержит `"saveMemory"`.
  - **Обновить** тест `"CONCLUDE_TOOL_DECLARATIONS includes saveMemory"` (строка 16) → переименовать в `"CONCLUDE_TOOL_DECLARATIONS is empty"`, assert `expect(CONCLUDE_TOOL_DECLARATIONS).toHaveLength(0)`.
  - **Удалить** или обновить тест `"isConclude=true produces combined tool list with saveMemory at end"` (строка 30) — теперь tool list одинаковый. Заменить на: `"tool list is the same regardless of isConclude"` — verify `TOOL_DECLARATIONS` содержит saveMemory и `[...TOOL_DECLARATIONS, ...CONCLUDE_TOOL_DECLARATIONS]` идентичен `TOOL_DECLARATIONS`.
  - **Обновить** тест `"isConclude=false does NOT include saveMemory"` (строка 43) → удалить, так как saveMemory теперь всегда включен.
  - **Добавить** тест: `"saveMemory tool description does not mention conclude-only"` — verify tool description не содержит "ONLY available during memorize".
  - **Verify** `aiChat.serverPersist.test.ts` строка 89: mock `CONCLUDE_TOOL_DECLARATIONS: []` — уже корректен, no changes needed.

#### T3.2 — Update saveMemory.test.ts for deterministic ID upsert

- [ ] `functions/src/services/tools/handlers/knowledge/__tests__/saveMemory.test.ts`:
  - **Обновить mock structure**: заменить `db.collection().where().limit().get()` на `db.doc(path).get()`, добавить `mockDocGet`, `mockDocSet`, `mockDocUpdate`. Mock `db.doc()` должен возвращать `{ get: mockDocGet, set: mockDocSet, update: mockDocUpdate }`.
  - **Удалить** тест `"returns existing Memory if duplicate within 60s (idempotency)"` (строка 141) — 60s guard удалён.
  - **Добавить** тест: `"updates existing memory when doc exists (deterministic ID)"`:
    - Mock: `mockDocGet` returns `{ exists: true }`
    - Assert: `mockDocUpdate` called with `{ content, conversationTitle, updatedAt, kiRefs }`, `mockDocSet` NOT called
    - Assert: result has `memoryId: ctx.conversationId` and `updated: true`
  - **Добавить** тест: `"creates new memory when doc does not exist (deterministic ID)"`:
    - Mock: `mockDocGet` returns `{ exists: false }`
    - Assert: `mockDocSet` called with full data including `createdAt`, `mockDocUpdate` NOT called
    - Assert: result has `memoryId: ctx.conversationId` и НЕ имеет `updated`
  - **Добавить** тест: `"update preserves original createdAt"`:
    - Mock existing doc, call handler, verify `mockDocUpdate` args do NOT contain `createdAt`
  - **Добавить** тест: `"update refreshes conversationTitle from conv doc"`:
    - Mock existing doc + conv doc with updated title, verify `mockDocUpdate` includes new title
  - **Обновить** тест `"creates Memory doc with validated kiRefs"` — переименовать в `"creates new Memory doc with validated kiRefs"`, обновить mock на `mockDocGet → { exists: false }`.
  - **Добавить** тест: `"upsert updates kiRefs on existing memory"`:
    - Mock existing doc, call with new kiRefs, verify update includes new kiRefs

#### T3.3 — Update feature doc reference

- [ ] `docs/features/knowledge/knowledge-items.md` (строка 153):
  - Обновить описание `saveMemory.ts`: убрать "Conclude-only (`isConclude`), idempotency (60s window)".
  - Заменить на: "Always-available. Deterministic doc ID (`conversationId`), upsert: get → exists ? update : set. Orphan guard, validates `kiRefs` via `db.getAll()`."
- [ ] `docs/features/knowledge/knowledge-items.md` (строка 155):
  - Обновить описание `definitions.ts`: убрать "`CONCLUDE_TOOL_DECLARATIONS` (saveMemory, injected at `isConclude`)".
  - Заменить на: "Tool definitions. `saveMemory` always included in `TOOL_DECLARATIONS`. `CONCLUDE_TOOL_DECLARATIONS` empty (deprecated)."

### Parallelization Plan

```
T3.1 + T3.2 — PARALLEL (independent test files)
T3.3 — SEQUENTIAL LAST (doc update after code is stable)
```

### Verification

```bash
# Run ALL tests (both projects)
cd /Users/muramets/Documents/youtube-interface
npx vitest run --project frontend
npx vitest run --project functions

# Full check
npm run check
```

### Review Gate — Phase 3

Запустить subagent с промптом:

> Review the changes in Phase 1–3 of the Memorize Production-Ready Refactoring. Answer each question YES or NO with a specific finding:
>
> 1. Is `saveMemory` in `TOOL_DECLARATIONS` array and NOT in `CONCLUDE_TOOL_DECLARATIONS`?
> 2. Does `aiChat.ts` use a static `tools: TOOL_DECLARATIONS` (no conditional)?
> 3. Does the `saveMemory` handler use deterministic doc ID (`memoriesPath/${conversationId}`) with `get → exists ? update : set`?
> 4. Is the 60-second idempotency guard completely removed (no `recentCutoff`, no `60_000`, no `where("conversationId")`)?
> 5. Does the handler's update path write `content`, `updatedAt`, `conversationTitle`, and `kiRefs` but NOT `createdAt`?
> 6. Does ChatInput.tsx show Stop button when `isMemorizing && isStreaming`?
> 7. Are all tests updated: idempotency test removed, upsert tests added, conclude test inverted?
> 8. Does the saveMemory tool description NOT contain "ONLY available during memorize/conclude turns"?
> 9. Is the feature doc (`knowledge-items.md`) updated to reflect new behavior?
> 10. Are there any remaining references to `CONCLUDE_TOOL_DECLARATIONS` that expect it to be non-empty?
> 11. Does `prompts.ts` contain a "### Knowledge Item References" section teaching `[Title](ki://kiId)` syntax?
> 12. Does `concludePrompt.ts` use `ki://` syntax instead of "by TITLE (not raw ID)"?

Fix all findings before moving to FINAL phase.

### MANDATORY: Update this file before proceeding
- [ ] Mark T3.1, T3.2, T3.3 checkboxes
- [ ] Update Phase 3 status → DONE
- [ ] Record test count

---

## FINAL Phase: Double Review-Fix Cycle

### Goal
Полный архитектурный и production readiness review.

### R1: Architecture Review

Запустить subagent с промптом:

> Perform an Architecture Review of the Memorize Production-Ready Refactoring. Read these files:
>
> 1. `docs/features/chat/memorize-production-ready-tasks.md` (this task doc)
> 2. `functions/src/services/tools/definitions.ts`
> 3. `functions/src/services/tools/handlers/knowledge/saveMemory.ts`
> 4. `functions/src/chat/aiChat.ts` (lines 380–420)
> 5. `src/features/Chat/ChatInput.tsx` (lines 428–476)
> 6. `functions/src/chat/__tests__/aiChat.conclude.test.ts`
> 7. `functions/src/services/tools/handlers/knowledge/__tests__/saveMemory.test.ts`
>
> Answer each question YES/NO with specific finding:
>
> 1. **SRP**: Does `saveMemory` handler have a single responsibility (upsert memory), or does it mix concerns?
> 2. **No duplication**: Is the deterministic ID upsert pattern in `saveMemory` consistent with other handlers in `functions/src/services/tools/handlers/knowledge/`? (Other handlers use `.add()` — this is intentionally different because memory is 1:1 per conversation.)
> 3. **Shared utilities**: Are there any utilities (path builders, validation helpers) that should be extracted but aren't?
> 4. **Type safety**: Does the handler properly narrow `unknown` types from `args` without using `as` unsafely?
> 5. **Import cleanliness**: Are all dead imports removed (e.g., `CONCLUDE_TOOL_DECLARATIONS` from `aiChat.ts`)?
> 6. **Tool description quality**: Does the updated saveMemory description provide clear guidance for when the LLM should call it mid-conversation vs during conclude? Does it reference `ki://` syntax for KI links?
> 7. **Test coverage**: Do the updated tests cover: create path, update path, update-preserves-createdAt, orphan guard, missing content, missing conversationId, kiRef validation (valid, invalid, mixed)?
> 8. **Backward compatibility**: Could the empty `CONCLUDE_TOOL_DECLARATIONS` export cause issues in any consumer? (Check `aiChat.ts` — spreading empty array is a no-op, should be safe.)

Fix all findings, then proceed to R2.

### R2: Production Readiness Review

Запустить subagent с промптом:

> Perform a Production Readiness Review of the Memorize Production-Ready Refactoring. Read these files:
>
> 1. `functions/src/services/tools/handlers/knowledge/saveMemory.ts`
> 2. `functions/src/services/tools/definitions.ts`
> 3. `src/features/Chat/ChatInput.tsx`
> 4. `functions/src/chat/aiChat.ts`
>
> Answer each question YES/NO with specific finding:
>
> 1. **Error handling**: Does the saveMemory handler gracefully handle Firestore errors during upsert (both query and update/create)?
> 2. **Race condition**: With deterministic doc ID, two concurrent `saveMemory` calls write to the same doc — no duplicates possible. Verify this is implemented correctly (both paths use `db.doc(memoriesPath/${conversationId})`).
> 3. **Cost impact verification**: After the change, does the tool list remain static (same array reference or same content) across all API calls? Specifically, does `aiChat.ts` pass the same `TOOL_DECLARATIONS` array regardless of `isConclude`?
> 4. **UI state cleanup**: When memorize stream completes (or is aborted), does `isMemorizeSaving` get reset to `false`? (Check the `finally` block in `handleMemorizeSend`.)
> 5. **UI deadlock**: Is there any state combination where the user cannot interact with the chat at all (no Send, no Stop, no Cancel)? Walk through: isMemorizing=true, isStreaming=true, isMemorizeSaving=true.
> 6. **Cache breakpoint stability**: After moving saveMemory into TOOL_DECLARATIONS, verify that BP2 (last tool gets `cache_control`) still works. The last tool in the array is now `saveMemory` — is that correct?
> 7. **Logging**: Does the handler use `console.info`/`console.warn` (acceptable in Cloud Functions) or does it use banned `console.log`/`console.error`?
> 8. **CONCLUDE_INSTRUCTION compatibility**: Does the CONCLUDE_INSTRUCTION in `src/core/config/concludePrompt.ts` still correctly reference saveMemory? (It says "call saveMemory" — still valid.)
> 9. **Security**: Can a non-conclude call to saveMemory bypass the orphan guard? (No — orphan guard checks conversation existence regardless of isConclude.)

Fix all findings.

### Verification (FINAL)

```bash
cd /Users/muramets/Documents/youtube-interface

# Full lint + typecheck + doc links
npm run check

# Run all tests — SEPARATELY
npx vitest run --project frontend
npx vitest run --project functions

# Verify 0 failed in both
```

### MANDATORY: Update this file after FINAL
- [ ] Mark R1 and R2 as complete
- [ ] Update FINAL status → DONE
- [ ] Record final test count
- [ ] Update feature doc `docs/features/knowledge/knowledge-items.md` if needed
