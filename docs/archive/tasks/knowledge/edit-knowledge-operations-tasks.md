# editKnowledge Operations (Patch-Based Editing) — Tasks

## Overview

Добавить параметр `operations` в существующий `editKnowledge` tool как альтернативу монолитному `content`. Вместо полной перегенерации документа (~4K output tokens на средний KI), LLM отправляет хирургические операции — replace, insert_after, insert_before (~250 tokens). Экономия: 90%+ output tokens при типичных правках.

**Feature doc:** `docs/features/knowledge/edit-knowledge.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/knowledge/edit-knowledge.md` (архитектура editKnowledge, versioning, провенанс)
3. `functions/src/services/tools/handlers/knowledge/editKnowledge.ts` (текущий handler — сюда интегрируем)
4. `functions/src/services/tools/definitions.ts` (search for `editKnowledge` definition — NOTE: line numbers shift after Phase 3)
5. `functions/src/services/tools/handlers/knowledge/__tests__/editKnowledge.test.ts` (40 тестов — паттерн тестирования, search for test sections)

### Key Decisions (carry forward)

1. **`content` и `operations` — взаимоисключающие.** Если оба переданы → ошибка. Если `content` → текущее поведение (full rewrite). Если `operations` → patch-based. Это два режима одного инструмента, не два инструмента. Альтернатива (отдельный tool) отклонена: увеличивает tool count, LLM хуже выбирает между двумя похожими tools.

2. **All-or-nothing + dry-run.** `applyOperations` сначала работает на КОПИИ строки. Если любая операция fails (old_string not found, not unique) → ни одна не применяется. Ошибка возвращается с контекстом. LLM ретраит все операции (~250 tokens — trivial vs ~4K сэкономленных). Чистая version history без промежуточного мусора.

3. **Uniqueness rule (как Claude Code Edit tool).** `old_string` найден 2+ раз → fail с "found N occurrences, provide more surrounding context". `replace_all: true` per operation — для намеренных глобальных замен. Это прямой перенос проверенной модели — LLM уже знакомы с ней.

4. **Versioning без изменений.** Operations resolve server-side в новый полный content string. Существующий механизм (save old content as snapshot, write new content to main doc) работает as-is. applyOperations — чистая функция, которая не знает о Firestore.

5. **`applyOperations` — pure function, отдельный файл.** Изолированная логика без зависимостей — легко тестировать (20+ edge cases), легко переиспользовать. Файл: `functions/src/services/tools/utils/applyOperations.ts`.

6. **Ошибки с контекстом.** При `old_string` not found ответ содержит fragment окружающего текста для отладки. При 2+ matches — количество и позиции. LLM может автоматически скорректировать и retry.

7. **Tool description обновляется.** Description направляет модель предпочитать `operations` для небольших правок, `content` для полных переписываний. Это guidance, не принуждение.

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes, независимый agent)
- Внутрифазный параллелизм минимален (3 фазы, каждая компактная)

### Phase 1 parallelization plan
```
T1.1 — SEQUENTIAL FIRST (types + pure function)
T1.2 — SEQUENTIAL LAST (unit tests)
→ Review Gate 1: subagent
```

### Phase 2 parallelization plan
```
T2.1 — SEQUENTIAL FIRST (handler integration)
T2.2 — SEQUENTIAL LAST (integration tests)
→ Review Gate 2: subagent
```

### Phase 3 parallelization plan
```
T3.1 — SEQUENTIAL (tool definition update)
→ Review Gate 3: subagent
```

### FINAL phase
```
R1 (Architecture Review) — subagent → fix findings
R2 (Production Readiness) — subagent → fix findings
Final verification — all test suites + lint + typecheck
```

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Core operations engine: pure function `applyOperations` + unit tests | DONE |
| 2 | Handler integration: wire into `editKnowledge`, mutual exclusion, integration tests | DONE |
| 3 | Tool definition: JSON Schema for `operations`, updated description | DONE |
| FINAL | Double review-fix cycle (R1: Architecture 8/8, R2: Production Readiness 10/10) | DONE |

## Current Test Count

- **Frontend: 686 tests (49 files)** — verified via `npx vitest run --project frontend` (2026-03-24)
- **Backend: 1041 tests (69 files)** — verified via `npx vitest run --project functions` (2026-03-24)
- **Total: 1727 tests (118 files)** — all passing

---

## Phase 1: Core Operations Engine

**Goal:** Создать pure function `applyOperations(content, operations)` — сердце patch-based editing — и полный набор unit tests.

### Critical Context

- ⚠️ Функция **полностью изолирована** от Firestore, handler, context. Нулевые зависимости. Это позволяет тестировать 20+ edge cases без моков.
- ⚠️ `old_string` uniqueness check должен использовать **`indexOf` + проверку второго вхождения** (не regex — regex special chars в old_string сломают поиск). Паттерн Claude Code Edit: `content.indexOf(old_string)` → если `-1`, not found. Если найден → `content.indexOf(old_string, firstIndex + 1)` → если не `-1`, multiple matches.
- ⚠️ Операции применяются **последовательно** к растущей строке (каждая следующая видит результат предыдущей). Это означает, что порядок операций имеет значение. Alternative (все операции к оригиналу + merge) отклонена — конфликты неразрешимы без пользовательского вмешательства.
- ⚠️ `insert_after` и `insert_before` — anchor это **полная строка** (или многострочный блок), не подстрока. Те же правила uniqueness, что и для `replace.old_string`.
- ⚠️ `replace_all: true` — опциональное поле, по умолчанию `false`. Применяется только к `replace` операциям. Для `insert_after`/`insert_before` с `replace_all` — **ошибка** "'replace_all' is only valid for 'replace' operations". Server-side валидация: `if (op.type !== 'replace' && 'replace_all' in op)` → fail. Молчаливое игнорирование — anti-pattern для LLM-facing API.

### Tasks

- [x] **T1.1** — Types + pure function `applyOperations`
  - Create: `functions/src/services/tools/utils/applyOperations.ts`
  - Types (в этом же файле, exported):
    ```typescript
    interface ReplaceOperation {
        type: 'replace';
        old_string: string;
        new_string: string;
        replace_all?: boolean;
    }

    interface InsertAfterOperation {
        type: 'insert_after';
        anchor: string;
        content: string;
    }

    interface InsertBeforeOperation {
        type: 'insert_before';
        anchor: string;
        content: string;
    }

    type EditOperation = ReplaceOperation | InsertAfterOperation | InsertBeforeOperation;

    interface ApplyOperationsResult {
        success: true;
        content: string;
    }

    interface ApplyOperationsError {
        success: false;
        error: string;
        operationIndex: number;
    }
    ```
  - Function signature: `applyOperations(content: string, operations: EditOperation[]): ApplyOperationsResult | ApplyOperationsError`
  - Logic (dry-run on copy):
    1. Validate operations array is non-empty and ≤ 30 (MAX_OPERATIONS). >30 → error "too many operations (N), use 'content' for full rewrites"
    2. For each operation (sequential):
       - `replace`: find `old_string` in current content via `indexOf`
         - Not found → error with **nearest partial match**: взять первые 30 символов `old_string`, найти через `indexOf`. Если найдены → показать 80 символов окружения: `"...{40 chars before}{match}{40 chars after}..."`. Если не найдены → fallback на bookends (first 100 + "..." + last 100 + total length). Пример: `"Closest match at position 3847: '...total Browse features 45% of traffic...' — your old_string: 'Browse 45%'"`
         - Found 2+ times (check via second `indexOf`) AND `replace_all !== true` → error "found N occurrences at positions X, Y, Z — provide more context"
         - `replace_all: true` → replace all occurrences via `split(old_string).join(new_string)`
         - Otherwise → single replacement at first occurrence
       - `insert_after`: find `anchor` in content
         - Not found → error
         - Found 2+ times → error (same as replace)
         - Found → insert `content` immediately after anchor
       - `insert_before`: find `anchor` in content
         - Not found → error
         - Found 2+ times → error
         - Found → insert `content` immediately before anchor
    3. If any operation fails → return error (index, message). Content is NOT modified (dry-run copy).
    4. All operations succeed → return `{ success: true, content: resultContent }`
  - ⚠️ **НЕ использовать regex** для поиска `old_string`/`anchor` — спецсимволы (`$`, `.`, `*`, `(`, `)`) в реальном markdown content сломают regex
  - ⚠️ **Empty string guard:** `old_string === ''` или `anchor === ''` → немедленная ошибка "old_string/anchor must not be empty". `indexOf('')` возвращает 0 для любой строки — без guard получим ложные "multiple matches". Проверять ДО `indexOf`.
  - ⚠️ `replace` с `old_string === new_string` — допустимо (no-op), не ошибка. Handler всё равно поймает "nothing changed" в effectiveContent comparison
  - ⚠️ Count occurrences для ошибки: пройти весь content с `indexOf` loop, собрать все позиции (для ошибки: "found 3 occurrences at character positions 145, 892, 2301")

- [x] **T1.2** — Unit tests для `applyOperations`
  - Create: `functions/src/services/tools/utils/__tests__/applyOperations.test.ts`
  - Mock targets: **NONE** — pure function, zero dependencies
  - Test groups:
    - **replace — happy path:**
      - Single replacement in middle of text
      - Replace with empty string (deletion)
      - Replace multiline old_string
      - Replace preserves surrounding whitespace
    - **replace_all:**
      - `replace_all: true` replaces all 3 occurrences
      - `replace_all: true` with single occurrence (works like normal replace)
      - `replace_all: false` (explicit) with 2 occurrences → error
    - **replace — error cases:**
      - `old_string` not found → error with operationIndex 0
      - `old_string` found 2 times → error "found 2 occurrences" with positions
      - `old_string` found 5 times → error with all 5 positions
    - **insert_after — happy path:**
      - Insert after single-line anchor
      - Insert after multiline anchor
      - Insert after last line (anchor at end of content)
    - **insert_after — error cases:**
      - Anchor not found → error
      - Anchor found 2+ times → error
    - **insert_before — happy path:**
      - Insert before single-line anchor
      - Insert before first line (anchor at start of content)
      - Insert before multiline anchor
    - **insert_before — error cases:**
      - Anchor not found → error
      - Anchor found 2+ times → error
    - **Sequential application:**
      - Two replace operations in sequence (second sees result of first)
      - replace + insert_after in sequence
      - Operation 2 fails after operation 1 succeeded → error, content UNCHANGED (dry-run)
    - **Edge cases:**
      - Empty operations array → error
      - 31 operations → error "too many operations, use content for full rewrites"
      - Empty `old_string` → error "must not be empty" (guard against `indexOf('')` bug)
      - Empty `anchor` → error "must not be empty"
      - `replace` with `old_string === new_string` → success, content unchanged (no-op)
      - `replace_all: true` on insert_after → error "'replace_all' is only valid for 'replace'"
      - `replace_all: true` on insert_before → error (same)
      - Regex special characters in old_string (e.g. `$100.00 (25%)`) → found correctly
      - Unicode content (emoji, CJK) → works
    - **Error context:**
      - Error message includes operationIndex
      - Error for "not found" — nearest partial match: first 30 chars of old_string found → shows 80 chars surrounding context
      - Error for "not found" — partial match also not found → fallback to bookends (first 100 + last 100 + total length)
      - Error for "not found" — old_string shorter than 30 chars → uses full old_string for partial search
      - Error for "multiple matches" includes occurrence count and character positions

### Verification
```bash
cd /Users/muramets/Documents/youtube-interface
npx vitest run functions/src/services/tools/utils/__tests__/applyOperations.test.ts
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark T1.1, T1.2 checkboxes `[x]`
- [ ] Update Phase 1 status: TODO → DONE
- [ ] Record test count (run `npx vitest run --project frontend` + `npx vitest run --project functions`)

---

### Review Gate 1: Core Operations Engine

**Launch a subagent with this prompt:**

> Ты ревьюер. Прочитай:
> 1. `functions/src/services/tools/utils/applyOperations.ts`
> 2. `functions/src/services/tools/utils/__tests__/applyOperations.test.ts`
>
> Ответь YES/NO на каждый вопрос:
>
> 1. Использует ли `applyOperations` regex для поиска `old_string`/`anchor`? Должен использовать `indexOf`. Regex сломается на спецсимволах в markdown.
> 2. Работает ли dry-run: если операция 2 из 3 fails, возвращается ли оригинальный content без изменений?
> 3. Содержит ли error при "not found" nearest partial match (первые 30 символов old_string → indexOf → 80 символов окружения)? Есть ли fallback на bookends когда partial match не найден?
> 4. Содержит ли error при "multiple matches" количество вхождений и их позиции?
> 5. Тестируется ли case с regex-спецсимволами в `old_string` (например `$100.00 (25%)`)?
> 6. Тестируется ли sequential application: вторая операция видит результат первой?
> 7. Тестируется ли `replace_all: true` с 3+ вхождениями?
> 8. Есть ли тест на пустой массив operations?
> 9. Типы `EditOperation`, `ApplyOperationsResult`, `ApplyOperationsError` — экспортируются из файла?
> 10. Функция 0 зависимостей (no imports кроме types)?

**Fix all findings before moving to Phase 2.**

---

## Phase 2: Handler Integration

**Goal:** Интегрировать `applyOperations` в существующий `editKnowledge` handler — добавить mutual exclusion `content` vs `operations`, wire patch-based flow.

### Critical Context

- ⚠️ **Порядок валидации:** mutual exclusion (`content` + `operations` → error) должна быть РАНЬШЕ, чем `hasUpdates` check. Иначе `{ kiId, content, operations }` пройдёт мимо mutual exclusion и попадёт в content flow.
- ⚠️ **`operations` считается update.** Строка `hasUpdates` (line 43-44) должна включить `operations !== undefined`. Без этого `{ kiId, operations: [...] }` вернёт "no fields to update".
- ⚠️ **Content-changed logic unchanged.** `applyOperations` вернёт новый content string. Этот string подставляется в `contentChanged` check (line 88): `effectiveContent.trim() !== oldContent.trim()`. Если patches привели к тому же content — early return "unchanged". Это правильное поведение.
- ⚠️ **Existing `contentChanged` flow.** Если `operations` → вызвать `applyOperations(oldContent, operations)`. Если success → использовать `result.content` как если бы пользователь передал `content: result.content`. Весь downstream (version snapshot, video ref resolution, provenance) работает без изменений.
- ⚠️ **Error от `applyOperations` — return, не throw.** Handler должен вернуть `{ error: result.error }` формат, как все остальные ошибки. Не пробрасывать exception.
- ⚠️ **Type widening.** `EditKnowledgeArgs.operations` — optional. Import `EditOperation` from `applyOperations.ts`. Не дублировать типы.
- ⚠️ **Тесты — мок Firestore, не applyOperations.** `applyOperations` — production code, не мокать. Тесты проверяют integration: `operations` → handler → batch calls.

### Tasks

- [x] **T2.1** — Handler integration
  - Modify: `functions/src/services/tools/handlers/knowledge/editKnowledge.ts`
  - Changes:
    1. Import `applyOperations` и `EditOperation` type from `../utils/applyOperations.js`
    2. Extend `EditKnowledgeArgs`:
       ```typescript
       interface EditKnowledgeArgs {
           kiId: string;
           content?: string;
           title?: string;
           summary?: string;
           videoId?: string | null;
           category?: string;
           operations?: EditOperation[];
       }
       ```
    3. After kiId validation, BEFORE hasUpdates check — add mutual exclusion:
       ```typescript
       const { kiId, content, title, summary, category, operations } = args as unknown as EditKnowledgeArgs;

       if (content !== undefined && operations !== undefined) {
           logger.warn("[editKnowledge] Validation failed: content and operations are mutually exclusive");
           return { error: "Cannot use both 'content' and 'operations'. Use 'content' for full rewrite, 'operations' for surgical edits." };
       }
       ```
    4. Update `hasUpdates` check (line 43-44) to include `operations`:
       ```typescript
       const hasUpdates = content !== undefined || operations !== undefined || title !== undefined
           || summary !== undefined || videoIdProvided || category !== undefined;
       ```
    5. After reading existing KI + extracting `oldContent` (line 73), apply operations if present:
       ```typescript
       let resolvedContent: string | undefined = content;

       if (operations !== undefined && operations.length > 0) {
           const opsResult = applyOperations(oldContent, operations);
           if (!opsResult.success) {
               logger.warn("[editKnowledge] Operations failed", {
                   kiId, operationIndex: opsResult.operationIndex, error: opsResult.error,
               });
               return { error: opsResult.error };
           }
           resolvedContent = opsResult.content;
       }
       ```
    6. Replace all downstream references to `content` with `resolvedContent` where they pertain to content-change logic:
       - `contentChanged` (line 88): `resolvedContent !== undefined && resolvedContent.trim() !== oldContent.trim()`
       - `mainUpdate.content` (line 174): `resolvedContent`
       - `effectiveContent` (line 143): `contentChanged ? resolvedContent : oldContent`
       - `resolveContentVideoRefs` call (line 244): `resolvedContent!`
       - Response `contentLength` (line 274): `effectiveContent.length`
  - ⚠️ **Minimal diff.** Не рефакторить остальную часть handler. Единственные изменения: import, type extension, mutual exclusion block, operations resolution block, `content` → `resolvedContent` переименование в 5-6 местах.

- [x] **T2.2** — Integration tests
  - Modify: `functions/src/services/tools/handlers/knowledge/__tests__/editKnowledge.test.ts`
  - Add new test section after existing tests (append, не изменять существующие):
    ```
    // =========================================================================
    // Operations-based editing (patch mode)
    // =========================================================================
    ```
  - Test cases:
    - **Mutual exclusion:**
      - `{ kiId, content: "...", operations: [...] }` → error "Cannot use both"
      - `{ kiId, operations: [] }` + no other fields → should it trigger "no fields to update"? No — empty operations array will be caught by `applyOperations` ("operations array is empty"). BUT `hasUpdates` should be true because `operations !== undefined`. So `applyOperations` returns error → handler returns error.
    - **Operations happy path (replace):**
      - `{ kiId, operations: [{ type: 'replace', old_string: '45%', new_string: '50%' }] }` → version snapshot with old content, main doc with patched content, `contentLength` updated
      - Verify batch calls match existing content-edit pattern (version snapshot + main doc update)
      - Verify `resolveContentVideoRefs` called with patched content
    - **Operations happy path (insert_after):**
      - `{ kiId, operations: [{ type: 'insert_after', anchor: 'Browse 45%...', content: '\nNew section here' }] }` → content contains new section
    - **Operations happy path (insert_before):**
      - `{ kiId, operations: [{ type: 'insert_before', anchor: '## Old Traffic', content: '## Preamble\n' }] }` → content starts with preamble
    - **Operations + metadata:**
      - `{ kiId, operations: [...], title: 'New Title' }` → both content patched AND title updated in same batch
    - **Operations error (not found):**
      - `{ kiId, operations: [{ type: 'replace', old_string: 'nonexistent text', new_string: 'x' }] }` → error, NO batch commit, NO version snapshot
    - **Operations error (multiple matches):**
      - Mock KI with content containing duplicated substring → `{ kiId, operations: [{ type: 'replace', old_string: 'duplicated', new_string: 'x' }] }` → error "found N occurrences"
    - **Operations unchanged content:**
      - `{ kiId, operations: [{ type: 'replace', old_string: '45%', new_string: '45%' }] }` → "unchanged" early return, no batch
    - **Operations provenance:**
      - Verify `lastEditSource: 'chat-edit'` and `lastEditedBy` are set correctly for operations mode
    - **Operations with conclude context:**
      - `ctx.isConclude = true` + operations → `lastEditSource: 'conclude'`
  - ⚠️ **Existing mock setup is reused.** Same `mockDocGet`, `mockBatchSet`, `mockBatchUpdate`, `mockBatchCommit`. `EXISTING_KI` fixture provides content `'## Old Traffic Analysis\nBrowse 45%...'` — design operations around this content.
  - ⚠️ **Do NOT mock `applyOperations`** — it's a pure function, test it in production mode within integration tests.

### Verification
```bash
cd /Users/muramets/Documents/youtube-interface
npx vitest run functions/src/services/tools/handlers/knowledge/__tests__/editKnowledge.test.ts
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark T2.1, T2.2 checkboxes `[x]`
- [ ] Update Phase 2 status: TODO → DONE
- [ ] Record test count (run `npx vitest run --project frontend` + `npx vitest run --project functions`)

---

### Review Gate 2: Handler Integration

**Launch a subagent with this prompt:**

> Ты ревьюер. Прочитай:
> 1. `functions/src/services/tools/handlers/knowledge/editKnowledge.ts`
> 2. `functions/src/services/tools/handlers/knowledge/__tests__/editKnowledge.test.ts` (section "Operations-based editing")
> 3. `functions/src/services/tools/utils/applyOperations.ts`
>
> Ответь YES/NO на каждый вопрос:
>
> 1. Валидация mutual exclusion (`content` + `operations`) стоит РАНЬШЕ `hasUpdates` check?
> 2. При ошибке `applyOperations` — handler возвращает `{ error }` (не throw)?
> 3. Все downstream ссылки на `content` заменены на `resolvedContent` (contentChanged, mainUpdate, effectiveContent, resolveContentVideoRefs, response)?
> 4. `operations !== undefined` включён в `hasUpdates` check?
> 5. Существующие 40 тестов НЕ изменены (только добавлены новые)?
> 6. Тест mutual exclusion проверяет что batch НЕ вызван?
> 7. Тест operations happy path проверяет version snapshot содержит OLD content (не patched)?
> 8. Тест operations error проверяет что batch НЕ вызван при failed operations?
> 9. `applyOperations` НЕ замокан в integration tests?
> 10. Type `EditOperation` импортируется из `applyOperations.ts`, не дублируется?

**Fix all findings before moving to Phase 3.**

---

## Phase 3: Tool Definition Update

**Goal:** Обновить JSON Schema и description в `definitions.ts` — LLM видит `operations` параметр и знает когда его использовать.

### Critical Context

- ⚠️ **JSON Schema `oneOf` vs separate properties.** Не использовать `oneOf` на верхнем уровне — Gemini плохо его обрабатывает. Вместо этого: `content` и `operations` как отдельные optional properties. Mutual exclusion enforced server-side (handler validation), не JSON Schema. Та же стратегия, что `videoId` (optional, validated in handler).
- ⚠️ **`operations` — массив объектов с discriminator `type`.** JSON Schema для heterogeneous array: `items: { oneOf: [replaceSchema, insertAfterSchema, insertBeforeSchema] }`. `oneOf` внутри `items` — OK (это per-item, не per-request).
- ⚠️ **Description — guidance, не enforcement.** Текст описания должен объяснить КОГДА использовать `operations` (small edits, specific changes) vs КОГДА `content` (complete rewrite, major restructuring). LLM делает выбор.
- ⚠️ **`replace_all` property.** В JSON Schema `replace_all` — optional boolean, default false. Присутствует ТОЛЬКО в replace schema, не в insert schemas.
- ⚠️ **Не менять `required: ["kiId"]`.** `operations` — optional, как и `content`.

### Tasks

- [x] **T3.1** — Update tool definition
  - Modify: `functions/src/services/tools/definitions.ts` (lines 613-663)
  - Changes:
    1. Update `description` (top-level tool description):
       ```
       "Update an existing Knowledge Item. Two modes: (1) SURGICAL EDITS via 'operations' — " +
       "preferred for small, targeted changes (saves tokens and preserves unchanged text). " +
       "(2) FULL REWRITE via 'content' — for complete restructuring or major rewrites. " +
       "Cannot use both 'content' and 'operations' in the same call. " +
       "Pass only the fields you want to change — omitted fields stay unchanged. " +
       "Set videoId to null to unlink from a video (converts to channel-level). " +
       "Scope is derived automatically from videoId. " +
       "Content changes are versioned (old content preserved in history). " +
       "Call getKnowledge first to read the current state. " +
       "OPERATIONS: Each operation specifies an exact string to find and what to do with it. " +
       "old_string/anchor must be unique in the document — if it appears multiple times, " +
       "include more surrounding context to disambiguate. " +
       "PARALLEL EDITING: When updating multiple KIs, call editKnowledge for each one " +
       "in the same response — they execute in parallel, saving time and cost.",
       ```
    2. Add `operations` property to `parametersJsonSchema.properties`:
       ```json
       operations: {
           type: "array",
           description:
               "Array of surgical edit operations. Each operation finds an exact string " +
               "and replaces, inserts before, or inserts after it. Operations are applied " +
               "sequentially — each sees the result of the previous one. " +
               "If any operation fails, none are applied. " +
               "Preferred over 'content' for targeted edits (saves ~90% output tokens). " +
               "Cannot be used together with 'content'.",
           items: {
               type: "object",
               oneOf: [
                   {
                       properties: {
                           type: { type: "string", enum: ["replace"], description: "Replace exact text match" },
                           old_string: { type: "string", description: "Exact text to find (must be unique in document unless replace_all is true)" },
                           new_string: { type: "string", description: "Text to replace with" },
                           replace_all: { type: "boolean", description: "Replace all occurrences (default: false)" },
                       },
                       required: ["type", "old_string", "new_string"],
                   },
                   {
                       properties: {
                           type: { type: "string", enum: ["insert_after"], description: "Insert content after anchor" },
                           anchor: { type: "string", description: "Exact text to find (must be unique)" },
                           content: { type: "string", description: "Text to insert after the anchor" },
                       },
                       required: ["type", "anchor", "content"],
                   },
                   {
                       properties: {
                           type: { type: "string", enum: ["insert_before"], description: "Insert content before anchor" },
                           anchor: { type: "string", description: "Exact text to find (must be unique)" },
                           content: { type: "string", description: "Text to insert before the anchor" },
                       },
                       required: ["type", "anchor", "content"],
                   },
               ],
           },
       },
       ```
    3. Update `content` property description to mention operations alternative:
       ```
       "Updated markdown content (FULL REWRITE mode). Replaces the entire content field. " +
       "For small targeted edits, prefer 'operations' instead — it saves ~90% output tokens. " +
       "When referencing videos, use [video title](vid://VIDEO_ID) links.",
       ```
  - ⚠️ Не менять `required`, не менять имя tool, не менять другие properties
  - ⚠️ `oneOf` внутри `items` — это per-item discriminated union, работает корректно с Gemini и Claude

### Verification
```bash
cd /Users/muramets/Documents/youtube-interface
npm run check
# Manual verification: read the updated definition and confirm JSON Schema is valid
npx vitest run --project functions
npx vitest run --project frontend
```

### MANDATORY: Update this file before proceeding
- [ ] Mark T3.1 checkbox `[x]`
- [ ] Update Phase 3 status: TODO → DONE
- [ ] Record test count (run `npx vitest run --project frontend` + `npx vitest run --project functions`)

---

### Review Gate 3: Tool Definition

**Launch a subagent with this prompt:**

> Ты ревьюер. Прочитай:
> 1. `functions/src/services/tools/definitions.ts` (editKnowledge definition)
>
> Ответь YES/NO на каждый вопрос:
>
> 1. `operations` — optional property (не в `required`)?
> 2. `oneOf` используется ТОЛЬКО внутри `items` (per-item), не на верхнем уровне properties?
> 3. `replace_all` присутствует ТОЛЬКО в replace schema, не в insert schemas?
> 4. Description направляет модель предпочитать `operations` для small edits?
> 5. Description явно указывает что `content` и `operations` нельзя использовать вместе?
> 6. `content` property description обновлён — упоминает `operations` как альтернативу?
> 7. `required` массив по-прежнему содержит только `["kiId"]`?
> 8. Каждый operation type в `oneOf` имеет корректный `required` массив?

**Fix all findings before moving to FINAL.**

---

## FINAL: Double Review-Fix Cycle

### R1: Architecture Review

**Launch a subagent with this prompt:**

> Ты старший архитектор. Прочитай ВСЕ изменённые/созданные файлы:
> 1. `functions/src/services/tools/utils/applyOperations.ts`
> 2. `functions/src/services/tools/utils/__tests__/applyOperations.test.ts`
> 3. `functions/src/services/tools/handlers/knowledge/editKnowledge.ts`
> 4. `functions/src/services/tools/handlers/knowledge/__tests__/editKnowledge.test.ts`
> 5. `functions/src/services/tools/definitions.ts` (editKnowledge definition)
>
> Проверь:
>
> 1. **SRP.** `applyOperations` — чистая функция без side effects? Handler не дублирует логику из `applyOperations`?
> 2. **Type reuse.** `EditOperation` определён в одном месте (`applyOperations.ts`) и импортируется в handler? Нет дублирования типов?
> 3. **Error flow consistency.** Все ошибки (validation, applyOperations, Firestore) возвращаются в формате `{ error: string }`, не throw? Исключение: `batch.commit()` failure — propagates as uncaught (existing pattern).
> 4. **Backward compatibility.** Все 40 существующих тестов проходят без изменений? `content`-only вызовы работают идентично?
> 5. **Naming.** `resolvedContent` vs `content` — переименование не пропущено ни в одном downstream usage?
> 6. **No dead code.** Нет закомментированного кода, TODO, unused imports?
> 7. **Shared utility placement.** `applyOperations.ts` в `utils/` — правильное расположение (рядом с `firestoreHelpers.ts`, `resolveContentVideoRefs.ts`)?
> 8. **JSON Schema validity.** `oneOf` per-item structure корректна? Все `required` arrays полные?

**Fix all findings before R2.**

### R2: Production Readiness Review

**Launch a subagent с этим промптом:**

> Ты production engineer. Прочитай все изменённые/созданные файлы (список в R1).
>
> Проверь:
>
> 1. **Edge case: empty `old_string`.** Guard для пустых `old_string`/`anchor` добавлен в Phase 1. Убедись что: (a) guard стоит ДО `indexOf`, (b) тесты для empty string есть в unit tests, (c) error message чёткий: "old_string must not be empty" / "anchor must not be empty".
> 2. **Edge case: very long content.** KI content может быть 30K+ chars. `applyOperations` с 10 операциями — performance OK? (Должно быть OK — `indexOf` is O(n*m) но для text это fine.)
> 3. **Edge case: `operations: []` (empty array).** Handler должен вернуть error, не "nothing changed".
> 4. **Error message safety.** Ошибки `applyOperations` содержат snippet content. Нет ли risk of leaking sensitive data? (В нашем случае content = KI, принадлежит пользователю, видит только LLM того же пользователя — безопасно.)
> 5. **Logger usage.** Все логи через `logger.warn`/`logger.info`, не `console.log`?
> 6. **Type narrowing.** `args as unknown as EditKnowledgeArgs` — единственное место `as` assertion? Все downstream — typed?
> 7. **Test coverage.** Есть ли untested paths? Mutual exclusion, all 3 operation types, error cases, sequential application, unchanged content, provenance — всё покрыто?
> 8. **Firestore operations count.** Operations mode не добавляет extra Firestore reads/writes vs content mode? (Не должен — `applyOperations` is pure, Firestore flow идентичен.)
> 9. **Tool definition size.** `operations` schema добавляет ~30 lines to definition. Это увеличивает prompt tokens. Убедись что descriptions лаконичные, без повторений.
> 10. **`replace_all` + `insert_*`.** Если LLM передаст `{ type: 'insert_after', anchor: '...', content: '...', replace_all: true }` — `applyOperations` возвращает ошибку "'replace_all' is only valid for 'replace' operations"? (Молчаливое игнорирование — anti-pattern для LLM-facing API.) Есть ли test case для этого?

**Fix all findings. Then run final verification:**

```bash
cd /Users/muramets/Documents/youtube-interface
npm run check
npx vitest run --project frontend
npx vitest run --project functions
```

### MANDATORY: Final update
- [ ] Update FINAL status: TODO → DONE
- [ ] Record final test count
- [ ] Update `docs/features/knowledge/edit-knowledge.md`:
  - Add roadmap entry: `[x] Phase 7: Operations — patch-based editing via operations parameter`
  - Update "Текущее состояние" — mention operations mode
  - Update Technical Implementation — add `applyOperations.ts` to file table
  - Update Architectural Decisions — add operations decisions
