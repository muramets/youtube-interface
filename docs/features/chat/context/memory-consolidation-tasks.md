# Memory Consolidation — Tasks

## Overview

User-triggered объединение L4 cross-conversation memories через AI. Пользователь выбирает memories в Settings → AI Memory, выбирает модель, опционально задаёт intention → LLM синтезирует N memories в меньшее количество топических → preview/edit → atomic batch save.

**Feature doc:** `docs/features/chat/context/memory-consolidation.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/chat/context/memory-consolidation.md` (архитектура, решения, prompt, schema, user flow)
3. `functions/src/services/ai/types.ts` (AiProvider interface — расширяем `generateText`)
4. `functions/src/services/ai/providerRouter.ts` (router dispatch — расширяем для `generateText`)
5. `src/core/services/ai/chatService.ts` (frontend memory CRUD — добавляем `applyConsolidation`)
6. `src/core/services/ai/aiProxyService.ts` (CF callers — добавляем `callConsolidation`)
7. `src/features/Settings/components/AiAssistantSettings.tsx` (AI Memory UI — добавляем protected toggle + Consolidate button)

### Key Decisions (carry forward)

1. **`generateText()` = optional method на `AiProvider`.** `generateText?(opts): Promise<GenerateTextResult>`. Optional для обратной совместимости. Provider router проверяет наличие через `if (!provider.generateText)` → HttpsError. Gemini: `ai.models.generateContent()` + `responseMimeType` + `responseSchema`. Claude: `messages.create()` + synthetic tool + `tool_choice: { type: "tool", name: "respond" }`.
2. **CF = pure AI, Frontend = CRUD.** CF `consolidateMemories` — stateless `onCall`. Принимает memories как текст в request body, отдаёт JSON. Не читает/пишет Firestore. Frontend владеет записью через `applyConsolidation()` — `writeBatch()` с atomic deletes + creates.
3. **`CONSOLIDATION_SCHEMA` = shared const.** Один JSON Schema объект, используемый и в system prompt (как guidance), и в native structured output (Gemini `responseSchema` / Claude tool schema). Живёт в CF module рядом с prompt.
4. **`ConversationMemory.source` расширяется** `'chat' | 'manual'` → `'chat' | 'manual' | 'consolidated'`. `ConversationMemory.protected?: boolean` — новое поле.
5. **Content limits = `MODEL_REGISTRY.contextLimit × CHARS_PER_TOKEN × 0.7`.** Один SSOT: `CHARS_PER_TOKEN = 4` (уже есть в `memory.ts`), 30% резерв. Проверка до LLM-вызова (zero cost on overflow).
6. **Backlog #19: `generateConcludeSummary` НЕ удаляем в этом feature.** Хотя `generateText` может его заменить, это отдельная задача. Не смешивать scope.
7. **`kiRefs[]` не наследуются.** Consolidated memories создаются без `kiRefs`. KI остаются intact.

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes, независимый agent)
- **Parallel tasks** — независимые файлы внутри фазы

**Cross-phase parallelism:** Phase 0 (`generateText`) и Phase 1 (protected flag) — **полностью независимы** (разные файлы, разные фичи, zero shared code). Могут выполняться параллельно. Phase 2 зависит от обоих (CF использует `generateText` + UI нуждается в `protected`). Phase 3 зависит от Phase 2.

### Phase 0 parallelization plan
```
T0.1 — SEQUENTIAL FIRST (AiProvider interface)
T0.2 + T0.3 — PARALLEL (Gemini generateText + Claude generateText)
T0.4 — SEQUENTIAL (provider router extension)
T0.5 — SEQUENTIAL LAST (tests)
→ Review Gate 0: subagent
```

### Phase 1 parallelization plan
```
T1.1 — SEQUENTIAL FIRST (type changes)
T1.2 + T1.3 — PARALLEL (chatService + settingsSlice)
T1.4 — SEQUENTIAL (UI toggle)
T1.5 — SEQUENTIAL LAST (tests)
→ Review Gate 1: subagent
```

### Phase 2 parallelization plan
```
T2.1 — SEQUENTIAL FIRST (prompt + schema + validation utils)
T2.2 — SEQUENTIAL (CF consolidateMemories)
T2.3 — SEQUENTIAL (export + frontend caller)
T2.4 — SEQUENTIAL LAST (tests)
→ Review Gate 2: subagent
```

### Phase 3 parallelization plan
```
T3.1 — SEQUENTIAL FIRST (ConsolidationModal — selection step)
T3.2 — SEQUENTIAL (preview/edit step)
T3.3 — SEQUENTIAL (wiring: button in AiAssistantSettings + store action)
T3.4 — SEQUENTIAL LAST (tests)
→ Review Gate 3: subagent
```

### FINAL phase
```
R1 (Architecture Review) — subagent → fix findings
R2 (Production Readiness) — subagent → fix findings
Final verification — all test suites + lint + typecheck + docs
```

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 0 | `generateText()` in AiProvider: interface + Gemini + Claude + router | TODO |
| 1 | Protected flag: type + Firestore field + UI toggle | TODO |
| 2 | Consolidation CF: prompt, schema, validation, `onCall` endpoint | TODO |
| 3 | Consolidation UI: modal (selection → generate → preview/edit → save) | TODO |
| FINAL | Double review-fix cycle (R1: Architecture, R2: Production Readiness) | TODO |

## Current Test Count

- **Frontend: 671 tests (48 files)** — verified via `npx vitest run --project frontend` (2026-03-23)
- **Backend: 911 tests (62 files)** — verified via `npx vitest run --project functions` (2026-03-23)
- **Total: 1582 tests (110 files)** — all passing

---

## Phase 0: `generateText()` in AiProvider

**Goal:** Добавить one-shot text generation метод в core AI contract — provider-agnostic, с native structured output per provider.

### Critical Context

- ⚠️ `AiProvider` interface живёт в `functions/src/services/ai/types.ts`. Менять осторожно — это core contract.
- ⚠️ `generateText` = **optional method** (`generateText?`). Существующие провайдеры не ломаются. Не добавлять в `ProviderFactory` — factory возвращает `AiProvider`, optional method появляется в конкретных реализациях.
- ⚠️ Gemini SDK: `responseSchema` использует **uppercase enum strings** (`"OBJECT"`, `"STRING"`, `"ARRAY"`). Паттерн уже есть в `generateConcludeSummary` (`functions/src/services/memory.ts:430-441`). Наша schema использует lowercase JSON Schema стандарт (`"object"`, `"string"`, `"array"`) — конвертировать в Gemini-формат внутри Gemini `generateText`.
- ⚠️ Claude SDK: structured output через tool_use. Создаём synthetic tool `respond` из переданной schema, форсируем `tool_choice: { type: "tool", name: "respond" }`. Результат в `response.content[0]` с `type: "tool_use"` → `input` содержит parsed JSON. Без schema — plain `messages.create()`.
- ⚠️ Claude `max_tokens` обязателен. Использовать `ModelConfig.maxOutputTokens` из `MODEL_REGISTRY` с fallback 16384.
- Паттерн Gemini client: `const { getClient } = await import("./gemini/index.js")` — lazy import.
- Паттерн Claude client: `import { getClaudeClient } from "./client.js"` — lazy import внутри.
- `providerRouter.ts` сейчас проксирует только `streamChat()`. Нужно добавить `generateText()` с dispatch по той же `resolveProvider` → `getOrCreateProvider` → вызов.

### Tasks

- [ ] **T0.1** — Расширить `AiProvider` interface + добавить новые типы
  - File: `functions/src/services/ai/types.ts`
  - Добавить `GenerateTextOpts` interface:
    ```
    model: string
    systemPrompt?: string
    text: string
    responseSchema?: Record<string, unknown>  // JSON Schema (standard lowercase)
    ```
  - Добавить `GenerateTextResult` interface:
    ```
    text: string
    tokenUsage?: TokenUsage
    parsed?: unknown  // structured output (when responseSchema provided)
    ```
  - Добавить optional method в `AiProvider`: `generateText?(opts: GenerateTextOpts): Promise<GenerateTextResult>`
  - Export новые типы

- [ ] **T0.2** — Gemini `generateText` implementation
  - File: `functions/src/services/gemini/factory.ts`
  - Добавить `generateText` method в return object `geminiFactory`
  - Implementation:
    - `const { getClient } = await import("./index.js")` → `ai.models.generateContent()`
    - Когда `opts.responseSchema` задана: `config.responseMimeType = "application/json"`, конвертировать JSON Schema → Gemini schema (uppercase types)
    - Parse response: `response.text` → `JSON.parse()` для `parsed`, raw text для `text`
    - Token usage: `response.usageMetadata` → `TokenUsage`
  - ⚠️ Gemini schema conversion: написать helper `toGeminiSchema(schema)` рекурсивно. `"object"` → `"OBJECT"`, `"string"` → `"STRING"`, `"array"` → `"ARRAY"`, `"boolean"` → `"BOOLEAN"`, `"number"` → `"NUMBER"`. Обработать `properties`, `items`, `required`. Поместить в `functions/src/services/gemini/schemaUtils.ts`.
  - ⚠️ Не забыть: `systemInstruction` (не `systemPrompt`) — так Gemini SDK называет системный prompt

- [ ] **T0.3** — Claude `generateText` implementation
  - File: `functions/src/services/claude/factory.ts`
  - Добавить `generateText` method в return object `claudeFactory`
  - Implementation:
    - `import { getClaudeClient } from "./client.js"` → `client.messages.create()`
    - Когда `opts.responseSchema` задана: создать synthetic tool `{ name: "respond", description: "Return structured result", input_schema: opts.responseSchema }`, установить `tool_choice: { type: "tool", name: "respond" }`. Результат: `response.content.find(b => b.type === 'tool_use')?.input`.
    - Без schema: `response.content.filter(b => b.type === 'text')` → join text
    - `max_tokens`: lookup `MODEL_REGISTRY.find(m.id === opts.model)?.maxOutputTokens ?? 16384`
    - Token usage: `response.usage` → `TokenUsage`
  - ⚠️ Claude tool_use response: `content` — массив blocks. `tool_use` block имеет `.input` (already parsed JSON, не string). Не нужен `JSON.parse()`.

- [ ] **T0.4** — Provider Router: добавить `generateText` dispatch
  - File: `functions/src/services/ai/providerRouter.ts`
  - Добавить `generateText` method в return object `createProviderRouter`:
    ```typescript
    async generateText(opts: GenerateTextOpts): Promise<GenerateTextResult> {
        const providerName = resolveProvider(opts.model);
        if (!providerName) throw new Error(...);
        const provider = getOrCreateProvider(providerName);
        if (!provider.generateText) {
            throw new Error(`Provider "${providerName}" does not support generateText`);
        }
        return provider.generateText(opts);
    }
    ```
  - ⚠️ **TypeScript return type caveat:** `createProviderRouter` возвращает `AiProvider`. `generateText` — optional на interface → caller должен проверять наличие (`router.generateText?.()` или `if (router.generateText)`). Router гарантирует что метод есть (он в return object literal), но type annotation скрывает это. Решение при имплементации: либо убрать explicit return type annotation (TypeScript infers literal type с non-optional `generateText`), либо создать `AiProviderWithGenerate` extended interface. Не решать заранее — зависит от того, что чище выглядит в реальном коде.

- [ ] **T0.5** — Tests
  - **T0.5a** — `functions/src/services/gemini/__tests__/generateText.test.ts`
    - Mock: `getClient` → mock `ai.models.generateContent()`
    - Cases:
      - Plain text (no schema) → returns text + tokenUsage
      - With responseSchema → returns text + parsed + tokenUsage
      - Schema conversion: lowercase → uppercase (verify `toGeminiSchema`)
      - JSON parse error → throw with descriptive message
    - Mock target: `await import("./index.js")` → `{ getClient: vi.fn() }`

  - **T0.5b** — `functions/src/services/claude/__tests__/generateText.test.ts`
    - Mock: `getClaudeClient` → mock `client.messages.create()`
    - Cases:
      - Plain text (no schema) → returns text + tokenUsage
      - With responseSchema → tool_use flow, returns parsed + tokenUsage
      - tool_use block missing in response → throw error
      - Max tokens resolution: known model → model's maxOutputTokens, unknown → 16384
    - Mock target: `"./client.js"` → `{ getClaudeClient: vi.fn() }`

  - **T0.5c** — `functions/src/services/ai/__tests__/providerRouter.test.ts` (extend existing)
    - Add tests for `generateText`:
      - Routes to correct provider
      - Throws if provider doesn't support generateText
      - Throws for unknown model

  - **T0.5d** — `functions/src/services/gemini/__tests__/schemaUtils.test.ts`
    - Test `toGeminiSchema()`:
      - Simple object with string/number/boolean properties
      - Nested objects
      - Arrays with items
      - Required fields preserved
      - Unknown types left as-is (defensive)

### Verification

```bash
npx vitest run --project functions -- generateText
npx vitest run --project functions -- schemaUtils
npx vitest run --project functions -- providerRouter
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark tasks ✅ in this section
- [ ] Update Phase Status table: Phase 0 → DONE
- [ ] Record test count from `npx vitest run --project frontend` + `npx vitest run --project functions`

### Review Gate 0

Запустить subagent с prompt:

> Review Phase 0 of Memory Consolidation. Read these files:
> 1. `docs/features/chat/context/memory-consolidation-tasks.md` (this task doc, Phase 0 section)
> 2. `functions/src/services/ai/types.ts` — verify `GenerateTextOpts` / `GenerateTextResult` / optional `generateText` on `AiProvider`
> 3. `functions/src/services/gemini/factory.ts` — verify Gemini `generateText` impl
> 4. `functions/src/services/gemini/schemaUtils.ts` — verify `toGeminiSchema` handles all JSON Schema types
> 5. `functions/src/services/claude/factory.ts` — verify Claude `generateText` impl (tool_use pattern)
> 6. `functions/src/services/ai/providerRouter.ts` — verify `generateText` dispatch
>
> Answer YES/NO for each:
> 1. Does `GenerateTextOpts.responseSchema` accept standard JSON Schema (lowercase types)?
> 2. Does Gemini impl convert lowercase → uppercase schema types recursively (including nested objects and arrays)?
> 3. Does Claude impl use `tool_choice: { type: "tool", name: "respond" }` to force structured output?
> 4. Does Claude impl handle the case when `responseSchema` is NOT provided (plain text response)?
> 5. Does Claude impl read `.input` from `tool_use` block (already parsed JSON), NOT `JSON.parse(text)`?
> 6. Does provider router throw a clear error when provider doesn't support `generateText`?
> 7. Are `max_tokens` for Claude resolved from `MODEL_REGISTRY` with fallback?
> 8. Do all test files mock at the SDK boundary (not internal functions)?

Fix all findings before moving to Phase 1.

---

## Phase 1: Protected Flag

**Goal:** Добавить `protected` boolean на memory doc + UI toggle + исключение protected memories из consolidation selection.

### Critical Context

- ⚠️ `ConversationMemory` interface в `src/core/types/chat/chat.ts:111-121`. Добавить `protected?: boolean` и расширить `source`.
- ⚠️ `ChatService` в `src/core/services/ai/chatService.ts` — добавить `toggleMemoryProtected()` method.
- ⚠️ `settingsSlice.ts` в `src/core/stores/chat/slices/settingsSlice.ts` — добавить `toggleMemoryProtected` action.
- ⚠️ Store types: `src/core/stores/chat/types.ts` — добавить `toggleMemoryProtected` в `ChatState` interface.
- ⚠️ UI: `AiAssistantSettings.tsx` — добавить иконку замка на каждую memory card. Protected memories визуально отличаются (muted, lock icon).
- ⚠️ `source` type union — менять в `src/core/types/chat/chat.ts:117`. Текущий: `source?: 'chat' | 'manual'`. Новый: `source?: 'chat' | 'manual' | 'consolidated'`.
- Firestore: `protected: boolean` — optional field, defaults to `false`. Нет нужды мигрировать существующие docs.

### Tasks

- [ ] **T1.1** — Type changes
  - File: `src/core/types/chat/chat.ts`
    - Расширить `ConversationMemory`:
      - `source?: 'chat' | 'manual' | 'consolidated'` (line ~117)
      - `protected?: boolean` (new field)
  - File: `src/core/stores/chat/types.ts`
    - Добавить `toggleMemoryProtected: (memoryId: string) => Promise<void>` в `ChatState`

- [ ] **T1.2** — ChatService: `toggleMemoryProtected` method
  - File: `src/core/services/ai/chatService.ts`
  - Добавить в `ChatService` object:
    ```typescript
    async toggleMemoryProtected(userId: string, channelId: string, memoryId: string, isProtected: boolean) {
        await updateDocument(memoriesPath(userId, channelId), memoryId, {
            protected: isProtected,
            updatedAt: Timestamp.now(),
        });
    }
    ```

- [ ] **T1.3** — settingsSlice: `toggleMemoryProtected` action
  - File: `src/core/stores/chat/slices/settingsSlice.ts`
  - Добавить `toggleMemoryProtected` в Pick type и в return object:
    ```typescript
    toggleMemoryProtected: async (memoryId: string) => {
        const { userId, channelId } = requireContext(get);
        const memory = get().memories.find(m => m.id === memoryId);
        if (!memory) return;
        await ChatService.toggleMemoryProtected(userId, channelId, memoryId, !memory.protected);
    }
    ```

- [ ] **T1.4** — UI: protected toggle на memory card
  - File: `src/features/Settings/components/AiAssistantSettings.tsx`
  - На каждой memory card добавить кнопку с иконкой замка (Lock / Unlock из lucide-react):
    - Protected: `Lock` icon, accent color, tooltip "Unprotect — allow consolidation"
    - Unprotected: `Unlock` icon, muted color, tooltip "Protect — exclude from consolidation"
  - Click → `toggleMemoryProtected(mem.id)`
  - Protected memories визуально: добавить subtle border или badge "Protected"
  - Расположение: рядом с Edit и Delete кнопками в header memory card

- [ ] **T1.5** — Tests
  - **T1.5a** — `src/core/services/ai/__tests__/chatService.test.ts` (extend existing)
    - Add test: `toggleMemoryProtected` calls updateDocument with correct args
    - Mock target: `updateDocument` from `'../firestore'`

  - **T1.5b** — `src/core/stores/chat/__tests__/settingsSlice.test.ts` (create new)
    - Test: `toggleMemoryProtected` flips `protected` field
    - Test: `toggleMemoryProtected` with non-existent memoryId — no-op (no throw)
    - Mock target: `ChatService.toggleMemoryProtected`

### Verification

```bash
npx vitest run --project frontend -- chatService settingsSlice
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark tasks ✅ in this section
- [ ] Update Phase Status table: Phase 1 → DONE
- [ ] Record test count

### Review Gate 1

Запустить subagent с prompt:

> Review Phase 1 of Memory Consolidation. Read these files:
> 1. `docs/features/chat/context/memory-consolidation-tasks.md` (Phase 1 section)
> 2. `src/core/types/chat/chat.ts` — verify `ConversationMemory` has `protected?: boolean` and extended `source`
> 3. `src/core/services/ai/chatService.ts` — verify `toggleMemoryProtected` method
> 4. `src/core/stores/chat/slices/settingsSlice.ts` — verify `toggleMemoryProtected` action
> 5. `src/features/Settings/components/AiAssistantSettings.tsx` — verify lock icon on memory cards
>
> Answer YES/NO for each:
> 1. Is `protected` field optional with `?: boolean` (backward compatible with existing docs)?
> 2. Does `source` union include `'consolidated'` alongside `'chat' | 'manual'`?
> 3. Does `toggleMemoryProtected` in settingsSlice correctly flip the current value (NOT always set to true)?
> 4. Is the protected toggle visually distinct from edit/delete buttons?
> 5. Does the toggle call `ChatService.toggleMemoryProtected` with the negated current value?

Fix all findings before moving to Phase 2.

---

## Phase 2: Consolidation Cloud Function

**Goal:** Создать CF `consolidateMemories` — stateless one-shot endpoint: принимает memories + model + intention, возвращает consolidated JSON.

### Critical Context

- ⚠️ CF pattern: `onCall` (не `onRequest`). Consolidation — не streaming. Паттерн: `functions/src/chat/generateChatTitle.ts`.
- ⚠️ Secrets: `GEMINI_API_KEY` + `ANTHROPIC_API_KEY` — нужны оба (пользователь выбирает модель).
- ⚠️ Provider router: создавать как в `aiChat.ts` — `createProviderRouter({ registry, modelToProvider })` с обоими factories. Вызывать `router.generateText()` (Phase 0).
- ⚠️ Input validation ORDER: auth → model whitelist → content limits → LLM call. Content limits check BEFORE LLM call (zero cost on overflow).
- ⚠️ `CHARS_PER_TOKEN = 4` — уже определён в `functions/src/services/memory.ts`. НЕ дублировать — extract в shared const или import.
- ⚠️ `noChangesNeeded: true` → `memories[]` игнорируется. `noChangesNeeded: false` + `memories.length === 0` → error.
- ⚠️ Gemini schema: `responseSchema` needs uppercase types. Gemini factory (Phase 0) handles conversion.
- ⚠️ `onCall` timeout: default 60s может быть мало для большого набора memories с мощной моделью. Установить `timeoutSeconds: 300`.
- ⚠️ CF memory: consolidation prompt может быть длинным. `memory: "512MiB"` должно хватить.
- ⚠️ Frontend caller: использовать `httpsCallable` из Firebase SDK (как `generateChatTitle`).

### Tasks

- [ ] **T2.1** — Prompt, schema, validation utils
  - Create: `functions/src/chat/consolidation/prompt.ts`
    - Export `CONSOLIDATION_SYSTEM_PROMPT` — полный system prompt из feature doc
    - Export `CONSOLIDATION_SCHEMA` — JSON Schema object (standard lowercase):
      ```typescript
      export const CONSOLIDATION_SCHEMA = {
          type: "object",
          properties: {
              memories: {
                  type: "array",
                  items: {
                      type: "object",
                      properties: {
                          title: { type: "string" },
                          content: { type: "string" },
                      },
                      required: ["title", "content"],
                  },
              },
              reasoning: { type: "string" },
              noChangesNeeded: { type: "boolean" },
          },
          required: ["memories", "reasoning", "noChangesNeeded"],
      } as const;
      ```
    - Export `ConsolidationResult` type:
      ```typescript
      interface ConsolidationResult {
          memories: Array<{ title: string; content: string }>;
          reasoning: string;
          noChangesNeeded: boolean;
      }
      ```
    - Export `buildUserPrompt(memories, intention?)` — форматирует user prompt:
      - Memories в формате `### "Title" (date)\n{content}` (как `crossConversationLayer`)
      - Intention добавляется в конец только если задан
      - ⚠️ **Sort guarantee:** memories в request body приходят от frontend sorted by `createdAt asc` (Firestore subscription `orderBy`). `buildUserPrompt` форматирует as-is, НЕ пересортирует. LLM использует позицию как recency proxy (последняя = самая актуальная).
    - Export `validateConsolidationResult(parsed)` — runtime validation:
      - `noChangesNeeded === true` → return `{ noChangesNeeded: true, memories: [], reasoning }` (ignore memories array)
      - `noChangesNeeded === false` + `memories.length === 0` → throw error "Model returned empty result"
      - `noChangesNeeded === false` + memories present → validate each has non-empty `title` и `content`

  - Create: `functions/src/chat/consolidation/validation.ts`
    - Export `validateContentLimits(memoriesText, modelId)`:
      - Lookup `contextLimit` from `MODEL_REGISTRY`
      - `maxInputChars = contextLimit × CHARS_PER_TOKEN × 0.7`
      - If `memoriesText.length > maxInputChars` → throw HttpsError("invalid-argument", human-readable message)
    - Import `CHARS_PER_TOKEN` from `functions/src/services/memory.ts`
    - ⚠️ **Sub-task:** `CHARS_PER_TOKEN` в `memory.ts:14` сейчас `const` (не export). Сделать `export const CHARS_PER_TOKEN = 4;` — одна строка, не architectural change.

- [ ] **T2.2** — CF `consolidateMemories`
  - Create: `functions/src/chat/consolidation/consolidateMemories.ts`
  - Pattern: `onCall` (like `generateChatTitle.ts`)
  - Config: `secrets: [geminiApiKey, anthropicApiKey]`, `timeoutSeconds: 300`, `memory: "512MiB"`, `maxInstances: 3`
  - Request schema:
    ```typescript
    interface ConsolidateRequest {
        model: string;
        memories: Array<{ id: string; title: string; content: string; createdAt: string }>;
        intention?: string;
    }
    ```
  - Implementation flow:
    1. Auth guard: `if (!request.auth) throw HttpsError("unauthenticated")`
    2. Validate required fields: `model`, `memories` (array, length >= 2)
    3. Model whitelist: `ALLOWED_MODEL_IDS.has(model)` — else HttpsError
    4. Build user prompt text → `validateContentLimits(text, model)`
    5. Create provider router (same pattern as aiChat.ts):
       ```typescript
       const router = createProviderRouter({
           registry: {
               gemini: { factory: geminiFactory, config: { apiKey: geminiApiKey.value() } },
               anthropic: { factory: claudeFactory, config: { apiKey: anthropicApiKey.value() } },
           },
           modelToProvider: { gemini: "gemini", claude: "anthropic" },
       });
       ```
    6. Call `router.generateText({ model, systemPrompt, text: userPrompt, responseSchema: CONSOLIDATION_SCHEMA })`
    7. Parse + validate result → return `ConsolidationResult`
  - Error handling:
    - LLM timeout/rate limit → HttpsError("unavailable", descriptive message)
    - JSON parse failure (despite native enforcement) → HttpsError("internal", "Model returned invalid structure")
    - Wrap LLM call in try/catch

- [ ] **T2.3** — Export CF + frontend caller + Firestore batch
  - File: `functions/src/index.ts`
    - Add: `export { consolidateMemories } from "./chat/consolidation/consolidateMemories.js";`
  - File: `src/core/services/ai/aiProxyService.ts` ← CF caller (consistent with `generateChatTitle`, `geminiUpload`)
    - Add inline response type + `callConsolidation` function:
      ```typescript
      /** Mirrors CF response — defined inline, NOT imported from functions/ (separate TS project). */
      interface ConsolidationResponse {
          memories: Array<{ title: string; content: string }>;
          reasoning: string;
          noChangesNeeded: boolean;
      }

      export async function callConsolidation(params: {
          model: string;
          memories: Array<{ id: string; title: string; content: string; createdAt: string }>;
          intention?: string;
      }): Promise<ConsolidationResponse> {
          const fn = httpsCallable<typeof params, ConsolidationResponse>(functions, 'consolidateMemories');
          const result = await fn(params);
          return result.data;
      }
      ```
    - ⚠️ `httpsCallable` и `functions` уже импортированы в `aiProxyService.ts` (line 5).
    - ⚠️ **Cross-project type boundary:** `ConsolidationResult` определён в `functions/src/` — frontend не может его импортировать. Inline `ConsolidationResponse` — тот же паттерн что `generateChatTitle` (defines `{ title: string }` inline at line 313).
  - File: `src/core/services/ai/chatService.ts` ← Firestore CRUD (consistent with `createMemory`, `deleteMemory`)
    - Add `applyConsolidation` method to `ChatService`:
      ```typescript
      async applyConsolidation(
          userId: string,
          channelId: string,
          toDelete: string[],
          toCreate: Array<{ title: string; content: string }>,
      ): Promise<void> {
          const batch = writeBatch(db);
          const memPath = memoriesPath(userId, channelId);
          for (const id of toDelete) {
              batch.delete(firestoreDoc(db, memPath, id));
          }
          for (const memory of toCreate) {
              const id = uuidv4(); // consistent with createMemory pattern
              batch.set(firestoreDoc(db, memPath, id), {
                  conversationTitle: memory.title,
                  content: memory.content,
                  source: 'consolidated' as const,
                  createdAt: Timestamp.now(),
                  updatedAt: Timestamp.now(),
              });
          }
          await batch.commit();
      }
      ```
    - ⚠️ Auto-ID: `createMemory` использует `uuidv4()` + `setDocument` — тот же pattern для batch. НЕ использовать `doc(collection(...))` — inconsistent с existing code.

- [ ] **T2.4** — Tests
  - **T2.4a** — `functions/src/chat/consolidation/__tests__/prompt.test.ts`
    - Test `buildUserPrompt`: format matches crossConversationLayer pattern, intention appended correctly, no intention → no section
    - Test `validateConsolidationResult`:
      - `noChangesNeeded: true` → returns normalized result with empty memories
      - `noChangesNeeded: false` + empty memories → throws
      - `noChangesNeeded: false` + valid memories → passes through
      - Memory with empty title → throws
      - Memory with empty content → throws

  - **T2.4b** — `functions/src/chat/consolidation/__tests__/validation.test.ts`
    - Test `validateContentLimits`:
      - Short text + known model → passes
      - Very long text → throws HttpsError with model name in message
      - Unknown model → throws (model not in registry)

  - **T2.4c** — `functions/src/chat/consolidation/__tests__/consolidateMemories.test.ts`
    - Mock: `createProviderRouter` → mock `generateText`
    - Cases:
      - Happy path: 3 memories → consolidated to 2 → returns result
      - Auth missing → unauthenticated error
      - Invalid model → invalid-argument error
      - Less than 2 memories → invalid-argument error
      - Content too long → invalid-argument error (validateContentLimits)
      - noChangesNeeded: true → passthrough
      - LLM error → unavailable error
    - Mock targets:
      - `"../../services/ai/providerRouter.js"` → `{ createProviderRouter: vi.fn() }`
      - `"../../services/gemini/factory.js"` → `{ geminiFactory: vi.fn() }`
      - `"../../services/claude/factory.js"` → `{ claudeFactory: vi.fn() }`
      - `"firebase-functions/v2/https"` → `{ onCall: (config, handler) => handler, HttpsError: class }` (standard pattern)
      - `"firebase-functions/params"` → `{ defineSecret: vi.fn() }`

  - **T2.4d** — `src/core/services/ai/__tests__/chatService.test.ts` (extend existing)
    - Test `applyConsolidation`:
      - Creates batch with correct deletes and creates
      - Uses `uuidv4()` for auto-ID (consistent with `createMemory`)
      - Sets `source: 'consolidated'` on created docs
      - Calls `batch.commit()`
    - Mock targets: `writeBatch`, `firestoreDoc`, `uuidv4`

  - **T2.4e** — `src/core/services/ai/__tests__/aiProxyService.test.ts` (extend existing or create)
    - Test `callConsolidation`:
      - Calls `httpsCallable` with function name `'consolidateMemories'`
      - Returns `result.data`
    - Mock targets: `httpsCallable`

### Verification

```bash
npx vitest run --project functions -- consolidat
npx vitest run --project functions -- prompt
npx vitest run --project functions -- validation
npx vitest run --project frontend -- chatService
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark tasks ✅ in this section
- [ ] Update Phase Status table: Phase 2 → DONE
- [ ] Record test count

### Review Gate 2

Запустить subagent с prompt:

> Review Phase 2 of Memory Consolidation. Read these files:
> 1. `docs/features/chat/context/memory-consolidation-tasks.md` (Phase 2 section)
> 2. `functions/src/chat/consolidation/prompt.ts` — verify prompt, schema, validators
> 3. `functions/src/chat/consolidation/validation.ts` — verify content limits
> 4. `functions/src/chat/consolidation/consolidateMemories.ts` — verify CF
> 5. `src/core/services/ai/chatService.ts` — verify `applyConsolidation`
> 6. `src/core/services/ai/aiProxyService.ts` — verify `callConsolidation`
> 7. `functions/src/index.ts` — verify export
>
> Answer YES/NO for each:
> 1. Does CF validate auth FIRST, then model whitelist, then content limits, then LLM call? (zero-cost fail-fast order)
> 2. Does `validateContentLimits` use `MODEL_REGISTRY.contextLimit` (not hardcoded)?
> 3. Does `CONSOLIDATION_SCHEMA` use standard lowercase JSON Schema types?
> 4. Does `validateConsolidationResult` handle the `noChangesNeeded: true` → ignore `memories[]` rule?
> 5. Does `validateConsolidationResult` reject `noChangesNeeded: false` + empty `memories[]`?
> 6. Does `applyConsolidation` use `writeBatch` for atomic deletes + creates?
> 7. Does `applyConsolidation` set `source: 'consolidated'` on new memory docs?
> 8. Does CF set `timeoutSeconds: 300` (not default 60s)?
> 9. Is `CHARS_PER_TOKEN` shared (not duplicated) between `memory.ts` and `validation.ts`?
> 10. Does the CF create the provider router with both gemini and anthropic in registry?

Fix all findings before moving to Phase 3.

---

## Phase 3: Consolidation UI

**Goal:** Создать ConsolidationModal — пошаговый flow: selection → generation → preview/edit → save.

### Critical Context

- ⚠️ Modal pattern: проект использует modal overlay с `z-modal`. Смотреть `src/features/Settings/SettingsModal.tsx` для general pattern.
- ⚠️ Model picker: переиспользовать `MODEL_REGISTRY` из `src/core/types/chat/chat.ts`. Default model = текущая модель чата из `aiSettings.defaultModel`.
- ⚠️ Protected memories: checkbox disabled, визуально muted, lock icon. Unprotected = checkable.
- ⚠️ Minimum 2 selected memories для активации Generate button.
- ⚠️ Store integration: `settingsSlice` — добавить `consolidateMemories` async action. Action flow: call `callConsolidation` → return result. Save flow: call `ChatService.applyConsolidation` → Firestore subscription auto-updates `memories` state.
- ⚠️ Loading state: Generate может занять 5-30 секунд. Показывать spinner + "Analyzing N memories...".
- ⚠️ Error state: показывать toast + allow retry.
- ⚠️ Preview editing: каждая новая memory — editable textarea (title + content). Inline editing, не отдельный modal.
- ⚠️ Before/After visual: "Before" = selected memories с strikethrough. "After" = new memories editable cards.
- ⚠️ `noChangesNeeded: true` → показать message "These memories don't overlap enough to consolidate" + Close button.
- ⚠️ Все UI text — на английском (project convention).
- ⚠️ Не использовать `RichTextEditor` для preview editing — overkill. Простой `textarea` с Tailwind styling.

### Tasks

- [ ] **T3.1** — ConsolidationModal: selection step
  - Create: `src/features/Settings/components/ConsolidationModal.tsx`
  - Props: `isOpen: boolean`, `onClose: () => void`
  - State machine: `'selection' | 'loading' | 'preview' | 'noChanges' | 'error'`
  - Selection step UI:
    - Header: "Consolidate Memories"
    - Memory list with checkboxes:
      - Protected memories: checkbox disabled, muted, lock icon, tooltip "Protected"
      - Unprotected: checkbox enabled, default checked
    - Each item: checkbox + title + date + first 2 lines of content (truncated)
    - "Select All" / "Deselect All" toggle (operates on unprotected only)
    - Model picker: Dropdown with `MODEL_REGISTRY` (default = `aiSettings.defaultModel`)
    - Intention textarea: placeholder "What should the AI focus on? E.g.: merge session summaries, keep only current decisions..."
    - Footer: [Cancel] + [Generate] button (disabled if < 2 selected)
    - Counter: "N of M memories selected"
  - State: `selectedIds: Set<string>`, `model: string`, `intention: string`

- [ ] **T3.2** — ConsolidationModal: preview/edit step
  - Extend `ConsolidationModal.tsx`
  - Loading step: spinner + "Analyzing N memories with {model}..."
  - noChanges step: message "These memories don't overlap enough to consolidate. They're already well-organized." + [Close]
  - Preview step UI:
    - **Reasoning** section: muted text block showing LLM reasoning
    - **Before** section: list of selected memories with strikethrough title + first 2 lines
    - **After** section: editable cards for new memories:
      - Each card: title input + content textarea (auto-resize)
      - Content pre-filled from LLM response, user can edit
    - Footer: [Cancel] (returns to selection) + [Save] (applies consolidation)
  - Save flow:
    1. Collect edited memories from state
    2. Call `applyConsolidation(userId, channelId, selectedIds, editedMemories)`
    3. On success: close modal + toast "Consolidated N memories into M"
    4. On error: toast error + keep modal open
  - Error step: error message + [Try Again] (returns to selection) + [Close]

- [ ] **T3.3** — Wiring: button + store action
  - File: `src/features/Settings/components/AiAssistantSettings.tsx`
    - Add [Consolidate] button next to [Add Memory] button:
      - Icon: `Combine` from lucide-react (или `Layers`)
      - Label: "Consolidate"
      - Disabled: `memories.length < 2`
      - Click: open ConsolidationModal
    - Import and render `ConsolidationModal`
    - ⚠️ Consolidation button — рядом с Add Memory, не внутри каждой card
  - ⚠️ **No store action needed.** Modal — self-contained UI component. Вызывает `callConsolidation` (из `aiProxyService`) и `ChatService.applyConsolidation` напрямую. userId получает через `useAuth()`, channelId через `useChannelStore()` — стандартный Settings pattern. Firestore subscription на `conversationMemories` автоматически обновит `memories` в store после batch commit.

- [ ] **T3.4** — Tests
  - **T3.4a** — `src/features/Settings/__tests__/ConsolidationModal.test.tsx` (create new) — **Selection step**
    - Test rendering: selection step shows memories with checkboxes
    - Test: protected memories have disabled checkboxes
    - Test: Generate button disabled with < 2 selections
    - Test: selecting/deselecting memories updates count
    - Test: Select All / Deselect All
    - Test: model picker changes model state

  - **T3.4b** — Same file — **Preview/Save/Error steps**
    - Test: loading state shows spinner + model name + memory count
    - Test: `noChangesNeeded: true` → shows "no overlap" message + Close button
    - Test: preview step renders reasoning text, Before section (strikethrough), After section (editable)
    - Test: user edits preview memory title/content → edited values pass to `applyConsolidation` (not raw LLM output)
    - Test: Save calls `ChatService.applyConsolidation` with correct `toDelete` IDs and `toCreate` array
    - Test: error state renders error message + retry button
    - Test: retry returns to selection step

  - Mock targets (shared across T3.4a + T3.4b):
      - `useChatStore` → mock `memories`, `aiSettings`
      - `useAuth` → mock `user`
      - `useChannelStore` → mock `currentChannel`
      - `callConsolidation` from `aiProxyService` → mock resolved value (for preview tests: return merge result; for no-op: return `noChangesNeeded: true`; for error: reject)
      - `ChatService.applyConsolidation` → mock resolved

### Verification

```bash
npx vitest run --project frontend -- ConsolidationModal
npx vitest run --project frontend -- AiAssistantSettings
npm run check
```

### MANDATORY: Update this file before proceeding
- [ ] Mark tasks ✅ in this section
- [ ] Update Phase Status table: Phase 3 → DONE
- [ ] Record test count

### Review Gate 3

Запустить subagent с prompt:

> Review Phase 3 of Memory Consolidation. Read these files:
> 1. `docs/features/chat/context/memory-consolidation-tasks.md` (Phase 3 section)
> 2. `src/features/Settings/components/ConsolidationModal.tsx` — full component
> 3. `src/features/Settings/components/AiAssistantSettings.tsx` — verify Consolidate button
> 4. `src/core/services/ai/chatService.ts` — verify `applyConsolidation` is used
> 5. `src/core/services/ai/aiProxyService.ts` — verify `callConsolidation` is used
>
> Answer YES/NO for each:
> 1. Does the modal handle all states: selection → loading → preview/noChanges/error?
> 2. Are protected memories shown with disabled checkboxes and lock icon?
> 3. Is the Generate button disabled when fewer than 2 memories are selected?
> 4. Does the preview step allow editing title and content of each new memory?
> 5. Does Save use `applyConsolidation` (atomic batch, not individual creates/deletes)?
> 6. Does `noChangesNeeded: true` show a descriptive message (not just close)?
> 7. Is the loading state showing model name and memory count?
> 8. Are all UI strings in English?
> 9. Does error handling show a toast and allow retry?
> 10. Is the Consolidate button disabled when total memories < 2?

Fix all findings before moving to FINAL.

---

## FINAL: Double Review-Fix Cycle

**Goal:** Финальная проверка архитектуры и production readiness.

### R1: Architecture Review

Запустить subagent с prompt:

> Perform an Architecture Review of the Memory Consolidation feature. Read files in this order:
> 1. `docs/features/chat/context/memory-consolidation.md` (feature doc — source of truth)
> 2. `docs/features/chat/context/memory-consolidation-tasks.md` (task doc)
> 3. `functions/src/services/ai/types.ts` (AiProvider interface with generateText)
> 4. `functions/src/services/gemini/factory.ts` + `functions/src/services/gemini/schemaUtils.ts`
> 5. `functions/src/services/claude/factory.ts`
> 6. `functions/src/services/ai/providerRouter.ts`
> 7. `functions/src/chat/consolidation/prompt.ts` + `validation.ts` + `consolidateMemories.ts`
> 8. `src/core/types/chat/chat.ts` (ConversationMemory)
> 9. `src/core/services/ai/chatService.ts` (applyConsolidation, toggleMemoryProtected)
> 10. `src/core/services/ai/aiProxyService.ts` (callConsolidation — CF caller)
> 11. `src/features/Settings/components/ConsolidationModal.tsx`
> 12. `src/features/Settings/components/AiAssistantSettings.tsx`
>
> Answer YES/NO for each question. For NO — provide exact file and line:
>
> **Provider abstraction:**
> 1. Does `GenerateTextOpts` / `GenerateTextResult` live in `ai/types.ts` (not provider-specific)?
> 2. Is schema conversion (lowercase → Gemini uppercase) isolated in `schemaUtils.ts` (not leaked into factory)?
> 3. Does the provider router `generateText` use the same `resolveProvider` + `getOrCreateProvider` as `streamChat`?
>
> **Separation of concerns:**
> 4. Is the CF stateless (no Firestore reads/writes)?
> 5. Is `applyConsolidation` in ChatService (frontend CRUD owner), not in CF?
> 6. Is prompt/schema/validation separated from CF handler?
>
> **Consistency:**
> 7. Does `buildUserPrompt` format match `crossConversationLayer.ts` format (`### "Title" (date)\n{content}`)?
> 8. Does `CONSOLIDATION_SCHEMA` use standard JSON Schema (lowercase types)?
> 9. Does `ConversationMemory.source` include `'consolidated'`?
>
> **No duplication:**
> 10. Is `CHARS_PER_TOKEN` shared (not redefined)?
> 11. Is `MODEL_REGISTRY` the single source for model validation (not hardcoded list)?
>
> **SRP:**
> 12. Does ConsolidationModal interact with Firestore ONLY through ChatService methods (not raw Firestore SDK calls)?
> 13. Is the modal state machine clear (selection → loading → preview/noChanges/error)?

### R2: Production Readiness Review

Запустить subagent с prompt:

> Perform a Production Readiness Review of the Memory Consolidation feature. Read the same files as R1.
>
> Answer YES/NO for each:
>
> **Error handling:**
> 1. Does the CF catch LLM errors and return HttpsError (not raw exceptions)?
> 2. Does `validateConsolidationResult` handle malformed LLM output (despite native enforcement)?
> 3. Does the UI show user-friendly error messages (not raw error strings)?
> 4. Does the Save operation handle Firestore batch failures?
>
> **Edge cases:**
> 5. Does `validateContentLimits` handle unknown model IDs?
> 6. Does the CF reject requests with < 2 memories?
> 7. Does `noChangesNeeded: true` path work end-to-end (CF → UI)?
> 8. What happens if user edits preview memory to empty content? Is it prevented?
>
> **Security:**
> 9. Does the CF require authentication?
> 10. Does the CF validate model against `ALLOWED_MODEL_IDS`?
> 11. Is `applyConsolidation` writing with Firestore SDK (respects security rules)?
>
> **Performance:**
> 12. Are both API keys loaded via `defineSecret` (not hardcoded)?
> 13. Is the CF timeout sufficient for large memory sets (300s)?
> 14. Does the modal handle slow LLM responses gracefully (loading state)?
>
> **Test coverage:**
> 15. Are all validation paths tested (auth, model whitelist, content limits)?
> 16. Is `applyConsolidation` atomic batch tested?
> 17. Is the modal state machine tested (selection, loading, preview, error)?

### After Both Reviews

- [ ] Fix all R1 findings
- [ ] Fix all R2 findings
- [ ] Run full test suite:
  ```bash
  npx vitest run --project frontend
  npx vitest run --project functions
  npm run check
  ```
- [ ] Update feature doc: `docs/features/chat/context/memory-consolidation.md`
  - Move `← YOU ARE HERE` marker after Phase 3
  - Update "Текущее состояние"
  - Update Technical Implementation section with actual file paths
- [ ] Record final test count in this doc

### MANDATORY: Update this file
- [ ] Update Phase Status table: FINAL → DONE
- [ ] Record final test count
