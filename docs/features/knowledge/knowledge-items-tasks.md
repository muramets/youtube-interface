# Knowledge Items — Task Doc

## Overview

Система долговременного хранения результатов AI-анализа видео и канала. LLM создаёт Knowledge Items (KI) через tool calls, будущие LLM потребляют их через discovery flags + retrieval tools. UI: Watch Page (video KI), Lab Page (channel KI), Zen Mode (просмотр), Edit Modal (редактирование).

**Feature doc:** `docs/features/knowledge/knowledge-items.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/knowledge/knowledge-items.md` (архитектура, решения, data model, UI flows)
3. `functions/src/services/tools/definitions.ts` (существующие tool definitions — паттерн `ToolDefinition`)
4. `functions/src/services/tools/executor.ts` (регистрация handlers — `HANDLERS` map, `TOOL_NAMES`)
5. `src/core/ai/layers/persistentContextLayer.ts` (как video/channel context доставляется в LLM)
6. `src/core/ai/systemPrompt.ts` (`buildSystemPrompt()` — сборка system prompt из слоёв)
7. `functions/src/chat/aiChat.ts` (главный chat endpoint — tool flow, SSE streaming)
8. `src/core/stores/chat/slices/sendSlice.ts` (`streamAiResponse` — frontend→backend message flow)

### Key Decisions (carry forward)

1. **Flat Firestore collection with `scope` discriminator.** `knowledgeItems/{id}` — video + channel в одной коллекции. `scope: 'video' | 'channel'`. Запросы: `where('videoId', '==', x)` для video, `where('scope', '==', 'channel')` для channel. Альтернатива (subcollections) отклонена — хуже для cross-entity queries.
2. **Category registry: Firestore map, не array.** `{[slug]: {label, level, description}}`. Atomic per-field updates без transactions. Concurrent writes с разными slugs не конфликтуют.
3. **Slug validation: kebab-case regex.** `/^[a-z0-9]+(-[a-z0-9]+)*$/`. Slug = ключ Firestore map → часть field path. Точка в slug = structural corruption.
4. **Auto-supersede: code-driven, не LLM.** `saveKnowledge` handler ищет старый KI с тем же `videoId + category` → ставит `supersededBy = newKiId`. Детерминистично.
5. **Нет `dataAsOf`, только `createdAt`.** Backend ставит `serverTimestamp`. Для snapshot-based данных дата snapshot — в content markdown.
6. **Conditional tool availability.** `saveKnowledge` — всегда доступен. `saveMemory` — только при `isConclude: true` (инжектится в tool list).
7. **Conclude = last turn чата.** Кнопка Memorize отправляет synthetic message через `aiChat`, не отдельный Cloud Function. Кэш тёплый, модель та же.
8. **Strip KI content при persist.** `saveKnowledge` args.content → `[Saved as KI ${id}]` перед записью message в Firestore. Паттерн из `stripInternalHints`.
9. **LLM-as-author.** Модель, глубоко погрузившаяся в анализ, создаёт KI. Не post-processing и не utility Flash модель.

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes)
- **Parallel tasks** — независимые файлы внутри фазы (UI components, handlers)

### Phase parallelization plans

```
Phase 1: Data Layer
  T1.1 (types) — SEQUENTIAL FIRST
  T1.2 + T1.3 (services + hook) — PARALLEL
  T1.4 (tests) — SEQUENTIAL LAST
  → Review Gate 1

Phase 2: Backend Handlers
  T2.1 (saveKnowledge) — SEQUENTIAL FIRST (foundation, complex)
  T2.2 + T2.3 (listKnowledge + getKnowledge) — PARALLEL
  T2.4 (tool definitions + executor registration) — after T2.1-T2.3
  T2.5 (tests) — SEQUENTIAL LAST
  → Review Gate 2

Phase 3: Conclude Migration
  T3.1 (saveMemory handler) — SEQUENTIAL FIRST
  T3.2 (isConclude flag: frontend + backend) — after T3.1
  T3.3 (CONCLUDE_INSTRUCTION + strip content) — after T3.2
  T3.4 (tests) — SEQUENTIAL LAST
  → Review Gate 3

Phase 4: Context Integration
  T4.1 (formatChannelContext) — SEQUENTIAL FIRST
  T4.2 + T4.3 + T4.4 (formatSingleVideo + buildSystemPrompt + getMultipleVideoDetails handler) — PARALLEL
  T4.5 (category registry injection) — after T4.2-T4.4
  T4.6 (debugSendLog) — PARALLEL with T4.5
  T4.7 (tests) — SEQUENTIAL LAST
  → Review Gate 4

Phase 5: UI Foundation (MonkeyLearn port)
  T5.0 (npm install Tiptap deps) — SEQUENTIAL FIRST
  T5.1 + T5.2 + T5.3 (RichTextEditor + RichTextViewer + ZenMode) — PARALLEL subagents
  T5.4 (KnowledgeCard + KnowledgeList) — after T5.2
  T5.5 (KnowledgeItemModal) — after T5.1
  → Review Gate 5

Phase 6: Video UI (Watch Page)
  T6.1 (useKnowledgeItems hook) — SEQUENTIAL FIRST
  T6.2 (WatchPageKnowledge tab) — after T6.1
  T6.3 (integration: tab bar + WatchPage) — after T6.2
  → Review Gate 6

Phase 7: Channel UI (Lab Page)
  T7.1 (knowledgeStore — Zustand) — SEQUENTIAL FIRST
  T7.2 (LabPage + route + sidebar) — after T7.1
  T7.3 (manual KI creation — [+ Add] button) — after T7.2
  → Review Gate 7

FINAL:
  R1 (Architecture Review) — subagent → fix findings
  R2 (Production Readiness) — subagent → fix findings
  Final verification — all test suites + lint + typecheck + docs
```

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Data Layer: types, services, hooks, seed categories | TODO |
| 2 | Backend Handlers: saveKnowledge, listKnowledge, getKnowledge + tool defs | TODO |
| 3 | Conclude Migration: saveMemory, isConclude, strip content | TODO |
| 4 | Context Integration: discovery flags, system prompt, channel context | TODO |
| 5 | UI Foundation: MonkeyLearn port (RichTextEditor, Zen Mode, Edit Modal) | TODO |
| 6 | Video UI: Watch Page tab AI Research | TODO |
| 7 | Channel UI: Lab Page + sidebar + filters | TODO |
| FINAL | Double review-fix cycle (R1: Architecture, R2: Production Readiness) | TODO |

## Current Test Count

- **Frontend: 384 tests (26 files)** — verified via `npx vitest run --project frontend` (2026-03-13)
- **Backend: 750 tests (50 files)** — verified via `npx vitest run --project functions` (2026-03-13)
- **Total: 1134 tests (76 files)** — all passing

---

## Phase 1: Data Layer

**Goal:** Создать типы, Firestore services и TanStack Query hooks — фундамент для всех последующих фаз.

### Critical Context

- KI collection path: `users/{uid}/channels/{chId}/knowledgeItems/{itemId}` (flat, video + channel)
- Category registry path: `users/{uid}/channels/{chId}/knowledgeCategories` (один документ, map structure)
- Frontend types в `src/core/types/knowledge.ts`
- Services в `src/core/services/knowledge/` (domain-driven folder)
- Hooks в `src/core/hooks/` (project convention)
- ⚠️ `KnowledgeCategoryRegistry.categories` = `Record<string, ...>` (map), не array. Agent-ы тянутся писать arrays — сверяться с feature doc
- ⚠️ Firestore `undefined` в полях → ошибка. Strip undefined перед write (см. memory `sync.test.ts` gotcha)

### Tasks

- [ ] **T1.1** — Types
  - Create: `src/core/types/knowledge.ts`
  - Interfaces (точные поля — см. feature doc "Technical Implementation > Типы"):
    - `KnowledgeItem` — id, category, title, content, summary, conversationId, model, toolsUsed, scope, videoId?, videoRefs?, createdAt, updatedAt?, supersededBy?, source
    - `KnowledgeCategoryEntry` — slug, label, level, description
    - `KnowledgeCategoryRegistry` — `categories: Record<string, Omit<KnowledgeCategoryEntry, 'slug'>>`
    - `KnowledgeFlags` — knowledgeItemCount?, knowledgeCategories?, lastAnalyzedAt?
  - Constants:
    - `SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/`
    - `SEED_CATEGORIES: Record<string, Omit<KnowledgeCategoryEntry, 'slug'>>` — 10 seed categories from feature doc (5 video + 5 channel)
  - 0 I/O, 0 dependencies
  - ⚠️ Типы должны быть exportable для backend. Проверить, что `shared/` symlink или прямой import работает. Если нет — дублировать типы в `functions/src/` (как `ToolCallRecord`)

- [ ] **T1.2** — Frontend Services
  - Create: `src/core/services/knowledge/knowledgeService.ts`
    - `getKnowledgeItems(channelId, videoId?): Promise<KnowledgeItem[]>` — query `knowledgeItems` collection, optional videoId filter
    - `getChannelKnowledgeItems(channelId): Promise<KnowledgeItem[]>` — `where('scope', '==', 'channel')`
    - `updateKnowledgeItem(channelId, itemId, updates): Promise<void>` — partial update (user edits content)
    - `deleteKnowledgeItem(channelId, itemId): Promise<void>`
    - `createManualKnowledgeItem(channelId, item): Promise<string>` — manual creation from Lab [+ Add]
  - Create: `src/core/services/knowledge/knowledgeCategoryService.ts`
    - `getCategories(channelId): Promise<KnowledgeCategoryEntry[]>` — read registry doc, convert map to array
    - `ensureSeedCategories(channelId): Promise<void>` — create registry doc with seed if not exists (`set merge`)
  - ⚠️ Pattern: follow `src/core/services/suggestedTraffic/` folder structure
  - ⚠️ Firestore paths: `users/${userId}/channels/${channelId}/knowledgeItems`, `users/${userId}/channels/${channelId}/knowledgeCategories`

- [ ] **T1.3** — TanStack Query Hooks
  - Create: `src/core/hooks/useKnowledgeItems.ts`
    - `useKnowledgeItems(channelId, videoId?)` — query KI for video or all
    - `useChannelKnowledgeItems(channelId)` — query channel-level KI
    - `useKnowledgeCategories(channelId)` — query category registry
    - `useUpdateKnowledgeItem()` — mutation with optimistic update
    - `useDeleteKnowledgeItem()` — mutation with invalidation
    - `useCreateKnowledgeItem()` — mutation for manual creation
  - ⚠️ Pattern: follow `src/core/hooks/useConversationMemories.ts` for TanStack Query conventions
  - ⚠️ Query keys: `['knowledgeItems', channelId, videoId]`, `['knowledgeCategories', channelId]`

- [ ] **T1.4** — Tests
  - Create: `src/core/services/knowledge/__tests__/knowledgeService.test.ts`
  - Create: `src/core/services/knowledge/__tests__/knowledgeCategoryService.test.ts`
  - Mock: Firestore (`vi.mock('firebase/firestore')`)
  - Cases:
    - `getKnowledgeItems`: with videoId filter, without filter, empty result
    - `getChannelKnowledgeItems`: returns only scope='channel'
    - `updateKnowledgeItem`: sets updatedAt
    - `getCategories`: converts map to array correctly
    - `ensureSeedCategories`: creates seed if not exists, no-op if exists

### Verification

```bash
npx vitest run --project frontend     # frontend tests pass (incl. new)
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 1 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 1

**Prompt:** "Review Phase 1 of Knowledge Items (data layer). Read `docs/features/knowledge/knowledge-items.md` for full context. Check:
1. Does `src/core/types/knowledge.ts` match the KnowledgeItem schema in feature doc? All fields? Correct types?
2. Is `KnowledgeCategoryRegistry.categories` a `Record` (map), not an array?
3. Are SEED_CATEGORIES complete (5 video + 5 channel from feature doc)?
4. Is `SLUG_PATTERN` regex exported as constant?
5. Do services follow domain-driven folder structure (`services/knowledge/`)?
6. Do hooks follow TanStack Query conventions (query keys, mutations, invalidation)?
7. Are Firestore paths correct (`users/{uid}/channels/{chId}/knowledgeItems`)?
8. Do services strip undefined before Firestore writes?
9. Run `npx vitest run --project frontend && npm run check`."

Fix all findings before moving to Phase 2.

---

## Phase 2: Backend Handlers

**Goal:** Создать tool handlers для LLM (saveKnowledge, listKnowledge, getKnowledge), зарегистрировать в tool system.

### Critical Context

- Handlers: `functions/src/services/tools/handlers/knowledge/` (новая папка)
- Tool definitions: добавить в `functions/src/services/tools/definitions.ts` (`TOOL_NAMES` + `ToolDefinition` objects + `TOOL_DECLARATIONS` array)
- Executor: добавить в `functions/src/services/tools/executor.ts` (`HANDLERS` map)
- ⚠️ `saveKnowledge` — самый сложный handler. Atomic batch: KI doc + discovery flags + registry update + auto-supersede. Порядок: validate → idempotency check → write KI → update flags → update registry → supersede old
- ⚠️ `ToolContext` содержит `userId`, `channelId`, `conversationId` — использовать для Firestore paths и provenance
- ⚠️ Composite index нужен: `knowledgeItems` collection с `conversationId + category` для idempotency guard
- ⚠️ Discovery flags: `FieldValue.increment(1)` для count, `FieldValue.arrayUnion(category)` для categories, `FieldValue.serverTimestamp()` для lastAnalyzedAt — на документе видео (scope='video') или канала (scope='channel')
- ⚠️ Handler return format: `{ content: string }` или `{ error: string }` — см. существующие handlers

### Tasks

- [ ] **T2.1** — `saveKnowledge` handler
  - Create: `functions/src/services/tools/handlers/knowledge/saveKnowledge.ts`
  - Signature: `handleSaveKnowledge(args: SaveKnowledgeArgs, ctx: ToolContext): Promise<FunctionCallResult>`
  - Args from LLM: `{ category, title, content, summary, scope, videoId?, videoRefs?, toolsUsed }`
  - Logic:
    1. **Slug validation:** `SLUG_PATTERN.test(category)` → reject with descriptive error if invalid
    2. **Idempotency guard:** query `knowledgeItems` where `conversationId == ctx.conversationId AND category == category AND videoId == videoId` → if exists, return existing ID (skip)
    3. **Firestore batch:**
       - `batch.set(kiRef, { ...kiData, createdAt: serverTimestamp() })` — KI doc
       - `batch.update(entityRef, { knowledgeItemCount: increment(1), knowledgeCategories: arrayUnion(category), lastAnalyzedAt: serverTimestamp() })` — discovery flags on video or channel doc
    4. **Registry update (outside batch):** `db.doc(registryPath).set({ [`categories.${category}`]: { label, level, description } }, { merge: true })` — atomic map merge
    5. **Auto-supersede (outside batch):** query old KI with same `videoId + category + supersededBy == null` → update each with `supersededBy = newKiId`
  - Return: `{ content: "Knowledge Item saved: ${title} [id: ${kiId}]" }`
  - ⚠️ `conversationId` и `model` берутся из `ctx`, не из LLM args (LLM не должен передавать)
  - ⚠️ `source` field: determine from context — `'chat-tool'` for explicit saves, `'conclude'` for conclude flow (pass via ctx or flag)
  - ⚠️ Strip undefined fields before `batch.set()` — Firestore throws on undefined

- [ ] **T2.2** — `listKnowledge` handler
  - Create: `functions/src/services/tools/handlers/knowledge/listKnowledge.ts`
  - Args: `{ videoId?, scope?, category? }` — all optional filters
  - Logic:
    1. Build Firestore query with optional filters
    2. Exclude superseded KI: `where('supersededBy', '==', null)`
    3. Order by `createdAt desc`
    4. Return summary + meta (NOT full content)
  - Return: `{ content: JSON.stringify(items.map(i => ({ id, title, summary, category, model, createdAt, toolsUsed, source }))) }`
  - ⚠️ Lightweight: ~500 tokens per response. DO NOT include `content` field

- [ ] **T2.3** — `getKnowledge` handler
  - Create: `functions/src/services/tools/handlers/knowledge/getKnowledge.ts`
  - Args: `{ ids?: string[], videoId?, categories?: string[] }` — fetch by IDs or by filters
  - Logic:
    1. If `ids` provided: `db.getAll(...refs)` (batch read)
    2. If filters: query with `videoId + categories` filter
    3. Return full content
  - Return: `{ content: JSON.stringify(items) }` — includes full `content` field
  - ⚠️ This is the heavy operation: ~3-5K tokens per KI. LLM should use `listKnowledge` first to decide which to fetch

- [ ] **T2.4** — Tool definitions + executor registration
  - Modify: `functions/src/services/tools/definitions.ts`
    - Add to `TOOL_NAMES`: `SAVE_KNOWLEDGE`, `LIST_KNOWLEDGE`, `GET_KNOWLEDGE`
    - Create `ToolDefinition` objects with detailed descriptions (guide LLM on when/how to use)
    - Add to `TOOL_DECLARATIONS` array: `saveKnowledge`, `listKnowledge`, `getKnowledge`
    - ⚠️ `saveMemory` NOT added here — it's conclude-only (Phase 3)
  - Modify: `functions/src/services/tools/executor.ts`
    - Import handlers
    - Add to `HANDLERS` map
  - ⚠️ Tool descriptions are critical — LLM relies on them to decide when to call. Include:
    - `saveKnowledge`: "Save a structured analysis result as a Knowledge Item. Call when user asks to save analysis or when you have a significant finding worth preserving..."
    - `listKnowledge`: "List existing Knowledge Items for a video or channel. Returns summaries, not full content. Use to check what analysis already exists..."
    - `getKnowledge`: "Retrieve full content of specific Knowledge Items. Use after listKnowledge to fetch items you need..."

- [ ] **T2.5** — Tests
  - Create: `functions/src/services/tools/handlers/knowledge/__tests__/saveKnowledge.test.ts`
    - Mock: `db` (Firestore admin), batch operations
    - Cases:
      - Happy path: creates KI doc + updates discovery flags + updates registry
      - Slug validation: rejects invalid slug (with dots, spaces, uppercase)
      - Idempotency: returns existing ID if same conversationId + category + videoId
      - Auto-supersede: marks old KI with `supersededBy`
      - Channel-level KI: no videoId, scope='channel', updates channel doc flags
      - Strip undefined: no crash on optional fields being undefined
  - Create: `functions/src/services/tools/handlers/knowledge/__tests__/listKnowledge.test.ts`
    - Cases: with filters, without filters, empty result, excludes superseded
  - Create: `functions/src/services/tools/handlers/knowledge/__tests__/getKnowledge.test.ts`
    - Cases: by IDs (batch read), by filters, mixed, empty result

### Verification

```bash
npx vitest run --project functions     # backend tests pass (incl. new)
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 2 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 2

**Prompt:** "Review Phase 2 of Knowledge Items (backend handlers). Read `docs/features/knowledge/knowledge-items.md` for context. Check:
1. Does `saveKnowledge` handler perform atomic batch (KI doc + discovery flags)?
2. Is slug validation using the `SLUG_PATTERN` regex from types?
3. Does idempotency guard check `conversationId + category + videoId`?
4. Does auto-supersede query for `supersededBy == null` before updating?
5. Does registry update use map merge (`set({ merge: true })`) with dot notation?
6. Are discovery flags using `FieldValue.increment` + `FieldValue.arrayUnion` (not read-modify-write)?
7. Does `listKnowledge` exclude superseded KI?
8. Does `listKnowledge` return summary but NOT content?
9. Are tool definitions descriptive enough for LLM guidance?
10. Is `saveMemory` correctly EXCLUDED from TOOL_DECLARATIONS (conclude-only)?
11. Do tests cover slug validation edge cases (dots, spaces, uppercase)?
12. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 3.

---

## Phase 3: Conclude Migration

**Goal:** Реализовать Memorize как последний turn чата: `saveMemory` handler, `isConclude` flag, strip content при persist.

### Critical Context

- ⚠️ `isConclude` НЕ существует в текущем codebase — нужно добавить end-to-end: frontend flag → backend tool injection
- Current Memorize: `concludeConversation.ts` (отдельный Cloud Function, Gemini Flash) — оставить как legacy fallback
- New Memorize: synthetic message через `aiChat` endpoint с `isConclude: true`
- `saveMemory` tool: conclude-only, инжектится в tool list при `isConclude`
- Strip content: в `persistAiResponse` (или эквивалент), перед записью message в Firestore
- ⚠️ `CONCLUDE_INSTRUCTION` — synthetic user message с инструкциями для LLM. Не system prompt — обычный user turn
- ⚠️ `stripInternalHints` pattern уже существует — найти и расширить для `saveKnowledge` content stripping
- ⚠️ SSE events: conclude turn использует тот же streaming pipeline — tool calls отображаются как badges в чате

### Tasks

- [ ] **T3.1** — `saveMemory` handler
  - Create: `functions/src/services/tools/handlers/knowledge/saveMemory.ts`
  - Args: `{ content, kiRefs?: string[] }` — content = Memory text, kiRefs = IDs of KI created in this conclude
  - Logic:
    1. Idempotency: check duplicate Memory for this conversationId in last 60s (existing pattern from `concludeConversation.ts`)
    2. Conversation still exists guard (existing pattern)
    3. Write Memory doc to `conversationMemories` collection
    4. Include `kiRefs` in Memory doc (for cross-reference)
  - Return: `{ content: "Memory saved with ${kiRefs?.length || 0} Knowledge Item references" }`
  - ⚠️ Reuse logic from `concludeConversation.ts` — extract idempotency and orphan guards into shared helper if needed

- [ ] **T3.2** — `isConclude` flag: frontend + backend
  - Modify: `functions/src/services/tools/definitions.ts`
    - Add `SAVE_MEMORY` to `TOOL_NAMES`
    - Create `saveMemory` ToolDefinition (separate from `TOOL_DECLARATIONS`)
    - Export: `CONCLUDE_TOOL_DECLARATIONS = [saveMemoryDefinition]`
  - Modify: `functions/src/chat/aiChat.ts`
    - Extract `isConclude` from request data
    - Compose tool list: `const tools = isConclude ? [...TOOL_DECLARATIONS, ...CONCLUDE_TOOL_DECLARATIONS] : TOOL_DECLARATIONS`
    - Pass to provider streamChat
  - Modify: `functions/src/services/tools/executor.ts`
    - Import `handleSaveMemory`
    - Add to `HANDLERS` map
  - Modify: `src/core/stores/chat/slices/sendSlice.ts`
    - `streamAiResponse` accepts `isConclude?: boolean` param
    - Pass through to `aiChat` callable
  - ⚠️ Verify SSE parser (`sseEvents.ts`) passes through all fields — `isConclude` may need explicit handling if it affects message display

- [ ] **T3.3** — CONCLUDE_INSTRUCTION + strip content
  - Create: `src/core/config/concludePrompt.ts`
    - Export `CONCLUDE_INSTRUCTION: string` — synthetic user message text (see feature doc "Conclude instructions")
  - Modify: frontend Memorize button handler
    - Find current Memorize button (calls `concludeConversation` CF)
    - Replace with: `chatStore.sendMessage({ text: CONCLUDE_INSTRUCTION, isConclude: true })`
    - ⚠️ Keep old CF call as fallback during migration (feature flag or try/catch)
  - Modify: `functions/src/chat/aiChat.ts` — provider-agnostic strip before persist
    - Location: after `const { text, tokenUsage, normalizedUsage, toolCalls, ... } = result` (~line 331), before SSE done event / Firestore write (~line 367)
    - Add strip logic — works for both Gemini and Claude providers:
    ```typescript
    // Strip large KI content from toolCalls before persisting to Firestore
    const persistToolCalls = toolCalls?.map(tc => {
      if (tc.name === 'saveKnowledge' && tc.args?.content) {
        return { ...tc, args: { ...tc.args, content: `[Saved as KI ${tc.result?.id}]` } };
      }
      return tc;
    });
    ```
    - Use `persistToolCalls` instead of `toolCalls` in SSE done event and Firestore write
    - ⚠️ `stripInternalHints` (Gemini-only, strips `result` fields) is unrelated — do NOT extend it
    - ⚠️ Keep `summary` in args (lightweight, useful for history reconstruction)

- [ ] **T3.4** — Tests
  - Create: `functions/src/services/tools/handlers/knowledge/__tests__/saveMemory.test.ts`
    - Cases:
      - Happy path: creates Memory doc with kiRefs
      - Idempotency: returns existing Memory if created <60s ago
      - Orphan prevention: fails if conversation deleted during execution
      - Empty kiRefs: creates Memory without KI references
  - Create: `functions/src/chat/__tests__/aiChat.conclude.test.ts` (or extend existing)
    - Cases:
      - `isConclude: true` → tool list includes saveMemory
      - `isConclude: false` (default) → tool list excludes saveMemory
  - Extend: frontend tests for sendSlice (if applicable)
    - Case: `isConclude` param passes through to callable

### Verification

```bash
npx vitest run --project functions     # backend tests pass
npx vitest run --project frontend      # frontend tests pass
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 3 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 3

**Prompt:** "Review Phase 3 of Knowledge Items (conclude migration). Read `docs/features/knowledge/knowledge-items.md` for context. Check:
1. Does `saveMemory` handler reuse idempotency pattern from `concludeConversation.ts`?
2. Is `saveMemory` tool definition EXCLUDED from `TOOL_DECLARATIONS` and in separate `CONCLUDE_TOOL_DECLARATIONS`?
3. Does `aiChat.ts` compose tool list correctly based on `isConclude` flag?
4. Does strip content replace `saveKnowledge` args.content but preserve summary?
5. Does `CONCLUDE_INSTRUCTION` guide LLM to call `saveKnowledge` first, then `saveMemory`?
6. Is `isConclude` flag passed end-to-end (frontend sendSlice → aiChat → tool injection)?
7. Is legacy `concludeConversation.ts` preserved as fallback (not deleted)?
8. Do tests verify conditional tool availability (saveMemory present/absent)?
9. Run `npx vitest run && npm run check`."

Fix all findings before moving to Phase 4.

---

## Phase 4: Context Integration

**Goal:** Сделать KI видимыми для будущих LLM: discovery flags в system prompt, channel metadata секция, category registry injection.

### Critical Context

- `persistentContextLayer.ts` — `formatSingleVideo()` уже форматирует видео с metrics + deltas. Расширить: + KI flags
- `buildSystemPrompt()` в `systemPrompt.ts` — текущая сигнатура: `(aiSettings, projects, activeProjectId, appContext?, memories?)`. Нужен новый параметр для channel metadata
- `sendSlice.ts` — вызывает `buildSystemPrompt()`, нужно передать channel metadata из `channelStore`
- ⚠️ Channel metadata в system prompt — новая секция, не существует. Создаётся `formatChannelContext()` в persistentContextLayer
- ⚠️ VideoCardContext тип (`src/core/types/appContext.ts`) нуждается в расширении: + KI flags
- ⚠️ `getMultipleVideoDetails` handler — тоже нужно расширить для KI flags в ответе
- ⚠️ Category registry injection — ~500 tokens в system prompt, при старте каждого чата

### Tasks

- [ ] **T4.1** — `formatChannelContext()` + channel metadata
  - Modify: `src/core/types/appContext.ts`
    - Add `ChannelMetadata` type: `{ name, handle, subscriberCount, videoCount, knowledgeItemCount?, knowledgeCategories?, lastAnalyzedAt? }`
  - Modify: `src/core/ai/layers/persistentContextLayer.ts`
    - Add `formatChannelContext(channel: ChannelMetadata): string`
    - Output: `### Channel\n- "slow life mode" (@slowlifemode) — 1720 subscribers, 58 videos\n- AI Research: 2 items (channel-journey, strategy-period), last analyzed Mar 6, 2026`
    - Call from `buildPersistentContextLayer()` — before video context

- [ ] **T4.2** — `formatSingleVideo()` KI extension
  - Modify: `src/core/types/appContext.ts`
    - Extend `VideoCardContext`: + `knowledgeItemCount?: number`, `knowledgeCategories?: string[]`, `lastAnalyzedAt?: string`
  - Modify: `src/core/ai/layers/persistentContextLayer.ts`
    - In `formatSingleVideo()`: append KI line if flags present
    - Format: `— KI: 3 items (traffic-analysis, packaging-audit), last: Mar 10, 2026`
  - Modify: middleware that enriches video cards (find where `VideoCardContext` is constructed — likely in `sendSlice.ts` or a middleware)
    - Read KI flags from video document, pass to `VideoCardContext`

- [ ] **T4.3** — `buildSystemPrompt()` extension
  - Modify: `src/core/ai/systemPrompt.ts`
    - Add `channelMetadata?: ChannelMetadata` parameter
    - Pass to `buildPersistentContextLayer()`
  - Modify: `src/core/stores/chat/slices/sendSlice.ts`
    - Read channel metadata from `channelStore` (name, handle, subscribers, video count)
    - Read KI flags from channel document (if available)
    - Pass as `channelMetadata` to `buildSystemPrompt()`

- [ ] **T4.4** — `getMultipleVideoDetails` handler KI extension
  - Modify: `functions/src/services/tools/handlers/getMultipleVideoDetails.ts`
    - After resolving video docs, query KI discovery flags for each video
    - Extend response per video: + `knowledgeItemCount?: number`, `knowledgeCategories?: string[]`, `lastAnalyzedAt?: string`
    - ⚠️ Batch read KI flags — don't N+1 query. Use `db.getAll()` or read from video doc if flags are denormalized there
    - ⚠️ Only add fields when KI exists (don't pollute response with `0` / `[]` for videos without KI)

- [ ] **T4.5** — Category registry injection
  - Modify: `src/core/ai/systemPrompt.ts` or `persistentContextLayer.ts`
    - Add category registry as system prompt section (~500 tokens)
    - Format: list of available categories with descriptions (for LLM to choose from when creating KI)
  - ⚠️ Registry is loaded via `useKnowledgeCategories` hook — pass to buildSystemPrompt or format in sendSlice

- [ ] **T4.6** — `debugSendLog.ts` extension
  - Modify: `src/core/ai/pipeline/debugSendLog.ts`
    - Add explicit log line for channel metadata presence + KI flags count
    - Add log line for category registry token count

- [ ] **T4.7** — Tests
  - Create/extend: `src/core/ai/layers/__tests__/persistentContextLayer.test.ts`
    - Cases:
      - `formatChannelContext`: with KI flags, without KI flags, empty channel
      - `formatSingleVideo` with KI flags: correct format string
      - `formatSingleVideo` without KI flags: no KI line (backward compatible)
  - Extend: `src/core/ai/__tests__/systemPrompt.test.ts` (if exists)
    - Cases: buildSystemPrompt with channelMetadata, without channelMetadata

### Verification

```bash
npx vitest run --project frontend     # frontend tests pass
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 4 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 4

**Prompt:** "Review Phase 4 of Knowledge Items (context integration). Read `docs/features/knowledge/knowledge-items.md` for context. Check:
1. Does `formatChannelContext()` output match the format specified in feature doc?
2. Does `formatSingleVideo()` append KI line only when flags are present (backward compatible)?
3. Is `buildSystemPrompt()` extended with optional `channelMetadata` param (not breaking)?
4. Does `sendSlice.ts` correctly read channel metadata and KI flags?
5. Does `getMultipleVideoDetails` handler include KI flags in response? Batch reads, no N+1?
6. Is category registry injected as ~500 token system prompt section?
7. Does `debugSendLog.ts` log channel + KI metadata?
8. Are discovery flags passed via `FieldValue.increment`/`arrayUnion` (not read-modify-write)?
9. Run `npx vitest run --project frontend && npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 5.

---

## Phase 5: UI Foundation (MonkeyLearn Port)

**Goal:** Портировать shared UI компоненты из MonkeyLearn: RichTextEditor, RichTextViewer, Zen Mode, KnowledgeCard, KnowledgeItemModal.

### Critical Context

- MonkeyLearn source: `/Users/muramets/Documents/MonkeyLearn/`
  - `src/components/ui/RichTextEditor/RichTextEditor.tsx` — Tiptap v3 WYSIWYG
  - `src/components/ui/RichTextEditor/RichTextViewer.tsx` — react-markdown read-only
  - `src/features/protocols/components/ProtocolInstructionViewer.tsx` — Zen Mode (Portal)
  - `src/features/protocols/modals/ProtocolSettingsModal.tsx` — Edit modal
- MonkeyLearn уже на Tiptap v3 (^3.17.x) — порт 1:1, без адаптации между мажорными версиями
- ⚠️ `react-markdown` и `rehype-raw` уже установлены в проекте (используются в WatchPageNotes)
- ⚠️ npm install: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-table`, `@tiptap/extension-color`, `@tiptap/extension-text-style`, `@tiptap/extension-placeholder`, `turndown`, `marked` + table/code extensions (check MonkeyLearn's package.json)
- ⚠️ All UI text in English (per CLAUDE.md design system rules)
- ⚠️ Use CSS variables for theming (per design system doc)

### Tasks

- [ ] **T5.0** — npm install dependencies
  - Run: `npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-table @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-table-row @tiptap/extension-color @tiptap/extension-text-style @tiptap/extension-placeholder @tiptap/extension-code @tiptap/extension-code-block @tiptap/extension-text-align turndown marked`
  - Run: `npm install -D @types/turndown @types/marked` (if needed)
  - ⚠️ Check exact versions from MonkeyLearn's `package.json` for compatibility

- [ ] **T5.1** — RichTextEditor
  - Create: `src/components/ui/RichTextEditor/RichTextEditor.tsx`
  - Port from: `MonkeyLearn/src/components/ui/RichTextEditor/RichTextEditor.tsx`
  - Adapt:
    - Replace MonkeyLearn-specific theme tokens with project CSS variables
    - Remove any MonkeyLearn-specific context/store dependencies
    - Props: `{ value: string; onChange: (markdown: string) => void; placeholder?: string }`
    - Internal: Tiptap editor → HTML editing → `turndown` for HTML→Markdown on change
  - Create: `src/components/ui/RichTextEditor/index.ts` — barrel export

- [ ] **T5.2** — RichTextViewer
  - Create: `src/components/ui/RichTextEditor/RichTextViewer.tsx`
  - Port from: `MonkeyLearn/src/components/ui/RichTextEditor/RichTextViewer.tsx`
  - Props: `{ content: string }` (markdown string)
  - Uses: `react-markdown` + `rehype-raw` (already installed)
  - Adapt: project CSS variables for styling

- [ ] **T5.3** — Zen Mode (fullscreen viewer)
  - Create: `src/features/Knowledge/components/KnowledgeViewer.tsx`
  - Port from: `MonkeyLearn/src/features/protocols/components/ProtocolInstructionViewer.tsx`
  - Features: Portal, backdrop blur, body scroll lock, ESC to close
  - Props: `{ content: string; title: string; meta?: { model: string; createdAt: string; category: string }; onClose: () => void }`
  - Uses: RichTextViewer for content rendering

- [ ] **T5.4** — KnowledgeCard + KnowledgeList
  - Create: `src/features/Knowledge/components/KnowledgeCard.tsx`
    - Collapsed view: category icon, title, date, model, summary
    - Actions: [Open] (inline expand), [Edit] (opens modal)
    - Expanded state: shows full content via RichTextViewer + [Maximize] button
  - Create: `src/features/Knowledge/components/KnowledgeList.tsx`
    - List of KnowledgeCard components
    - Shared between Watch Page (video KI) and Lab Page (channel KI)
    - Props: `{ items: KnowledgeItem[]; onEdit: (item) => void }`

- [ ] **T5.5** — KnowledgeItemModal (edit)
  - Create: `src/features/Knowledge/modals/KnowledgeItemModal.tsx`
  - Port pattern from: `MonkeyLearn/src/features/protocols/modals/ProtocolSettingsModal.tsx`
  - Features: modal with RichTextEditor, save/cancel, title editing
  - Props: `{ item: KnowledgeItem; onSave: (updates) => void; onClose: () => void }`
  - ⚠️ Provenance fields (model, toolsUsed, createdAt) are read-only, shown but not editable

### Verification

```bash
npx vitest run --project frontend     # frontend tests pass
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 5 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 5

**Prompt:** "Review Phase 5 of Knowledge Items (UI foundation — MonkeyLearn port). Read `docs/features/knowledge/knowledge-items.md` for context. Check:
1. Is RichTextEditor using Tiptap v3 with correct extensions (from MonkeyLearn)?
2. Does RichTextEditor convert HTML→Markdown via turndown on change?
3. Does RichTextViewer use existing `react-markdown` + `rehype-raw` (not new dependencies)?
4. Does Zen Mode use Portal, backdrop blur, body scroll lock, ESC to close?
5. Are all UI texts in English (CLAUDE.md rule)?
6. Are CSS variables used for theming (no hardcoded colors)?
7. Does KnowledgeCard show summary in collapsed state, full content in expanded?
8. Does KnowledgeItemModal make provenance fields read-only?
9. Are all new components in correct directories (`components/ui/`, `features/Knowledge/`)?
10. Run `npx vitest run --project frontend && npm run check`."

Fix all findings before moving to Phase 6.

---

## Phase 6: Video UI (Watch Page)

**Goal:** Добавить таб AI Research на Watch Page с KI карточками, inline expand, Zen Mode и Edit Modal.

### Critical Context

- Watch Page: `src/features/Watch/WatchPage.tsx` (NOT `src/pages/Details/` — that's Video Details, a different page)
- Watch Page has NO tab bar — `WatchPageNotes` rendered directly at line 275
- Tab bar pattern: inline underline buttons (reference: `src/features/Video/Modals/AddCustomVideo/AddCustomVideoModal.tsx:159-166`)
- ⚠️ `useKnowledgeItems(channelId, videoId)` из Phase 1 — основной data source
- ⚠️ Empty state: "No AI research yet. Start a chat conversation and analyze this video to generate Knowledge Items."

### Tasks

- [ ] **T6.1** — `useKnowledgeItems` integration
  - Verify: hook from Phase 1 works with Watch Page's channelId + videoId context
  - If needed: add `useKnowledgeCategories` call for category filtering on Watch Page

- [ ] **T6.2** — `WatchPageKnowledge.tsx`
  - Create: `src/features/Watch/components/WatchPageKnowledge.tsx`
  - Uses: `KnowledgeList` from Phase 5
  - Connects: `useKnowledgeItems(channelId, videoId)` → KnowledgeList
  - Features: empty state, loading state, error state
  - Actions: [Open] → inline expand, [Maximize] → Zen Mode, [Edit] → KnowledgeItemModal

- [ ] **T6.3** — Tab bar integration
  - ⚠️ Watch Page has NO tab bar — `WatchPageNotes` is rendered directly at `src/features/Watch/WatchPage.tsx:275`
  - Create tab bar in `WatchPage.tsx` using inline underline pattern (reference: `src/features/Video/Modals/AddCustomVideo/AddCustomVideoModal.tsx:159-166`)
    - Two tabs: "My Notes" (default, active) | "AI Research"
    - YouTube-like styling: text + bottom underline indicator, same design tokens as AddCustomVideoModal
    - State: `activeTab: 'notes' | 'research'` (useState, default `'notes'`)
  - Wrap existing `<WatchPageNotes>` under `activeTab === 'notes'`
  - Render `<WatchPageKnowledge>` under `activeTab === 'research'` (lazy load)
  - ⚠️ Preserve existing "My Notes" functionality unchanged — only wrap, don't modify internals

### Verification

```bash
npx vitest run --project frontend     # frontend tests pass
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 6 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 6

**Prompt:** "Review Phase 6 of Knowledge Items (Video UI — Watch Page). Check:
1. Is 'AI Research' tab alongside existing 'My Notes' (not replacing)?
2. Does WatchPageKnowledge use KnowledgeList from features/Knowledge/?
3. Does empty state guide user toward chat? (English text)
4. Are [Open], [Maximize], [Edit] actions wired correctly?
5. Is tab content lazy-loaded?
6. Run `npx vitest run --project frontend && npm run check`."

Fix all findings before moving to Phase 7.

---

## Phase 7: Channel UI (Lab Page)

**Goal:** Создать Lab Page для channel-level KI: sidebar route, фильтры по категориям, сортировка, ручное создание.

### Critical Context

- Sidebar: `src/components/Layout/Sidebar.tsx` — добавить пункт "Lab"
- Route: add to `src/pages/` or router config
- Filter pattern: `src/pages/Music/` — chip-row фильтрация по категориям (паттерн для переиспользования)
- ⚠️ Zustand store для Lab UI state: `src/core/stores/knowledgeStore.ts`
- ⚠️ Manual KI creation: `source: 'manual'`, пользователь заполняет title + content + category через modal
- ⚠️ Категории для chip-row берутся динамически из существующих KI (не из registry)

### Tasks

- [ ] **T7.1** — Zustand store
  - Create: `src/core/stores/knowledgeStore.ts`
  - State: `{ selectedCategory: string | null; sortOrder: 'newest' | 'oldest'; expandedItemId: string | null }`
  - Actions: `setCategory`, `setSortOrder`, `toggleExpand`

- [ ] **T7.2** — Lab Page + route + sidebar
  - Create: `src/pages/Lab/LabPage.tsx`
    - Uses: `KnowledgeList` from Phase 5, `knowledgeStore` for filters
    - Features:
      - Chip-row filter by category (pattern from Music Page)
      - Sort: newest / oldest
      - KI cards with [Open], [Maximize], [Edit]
      - [+ Add] button for manual creation
      - Empty state
  - Modify: router config — add `/lab` route
  - Modify: `src/components/Layout/Sidebar.tsx` — add "Lab" item (flask/beaker icon)

- [ ] **T7.3** — Manual KI creation
  - [+ Add] button opens `KnowledgeItemModal` in create mode
  - User fills: title, content (RichTextEditor), category (select from registry or new), scope (always 'channel' on Lab)
  - On save: `createManualKnowledgeItem` from service (Phase 1)
  - `source: 'manual'`, no conversationId, no model, no toolsUsed

### Verification

```bash
npx vitest run --project frontend     # frontend tests pass
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 7 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 7

**Prompt:** "Review Phase 7 of Knowledge Items (Channel UI — Lab Page). Check:
1. Is Lab added to sidebar with correct icon?
2. Does chip-row filter follow Music Page pattern?
3. Does manual creation set `source: 'manual'` and omit provenance fields?
4. Is Zustand store domain-scoped (not polluting other stores)?
5. Does Lab page show only channel-level KI (`scope: 'channel'`)?
6. Is route `/lab` correctly configured?
7. Run `npx vitest run --project frontend && npm run check`."

Fix all findings before moving to FINAL.

---

## FINAL: Double Review-Fix Cycle

### R1: Architecture Review

**Prompt:** "You are a senior architect reviewing the Knowledge Items feature implementation. Read:
1. `docs/features/knowledge/knowledge-items.md` (full feature doc)
2. `docs/features/knowledge/knowledge-items-tasks.md` (this task doc)

Then review the implementation. Check ALL of the following:
1. **Data model consistency:** Do Firestore docs match the KnowledgeItem type exactly? No extra or missing fields?
2. **Discovery flags atomicity:** Are `FieldValue.increment` + `arrayUnion` used (not read-modify-write)?
3. **Auto-supersede correctness:** Does it query `supersededBy == null` before updating? Handle no-old-KI case?
4. **Slug validation coverage:** Is SLUG_PATTERN applied in saveKnowledge handler? What happens on invalid slug — error to LLM or sanitize?
5. **Conditional tool availability:** Is saveMemory truly absent from normal chat tool list? Is it present in conclude?
6. **Strip content completeness:** Is args.content replaced but summary preserved? Any path where unstripped content leaks to Firestore?
7. **Channel context in system prompt:** Is formatChannelContext called? Does it degrade gracefully when no channel metadata?
8. **Category registry map structure:** Is it stored as map (not array) in Firestore? Is dot notation used for updates?
9. **idempotency guards:** saveKnowledge (conversationId + category + videoId), saveMemory (conversationId + 60s window)?
10. **Cross-feature impact:** Does any change break existing tools, system prompt, or memory system?
11. **Type exports:** Are KI types accessible from both frontend and backend without duplication?
12. **UI component reuse:** Is KnowledgeCard/List shared between Watch Page and Lab Page (not duplicated)?
13. Run `npx vitest run && npm run check`."

Fix all findings.

### R2: Production Readiness Review

**Prompt:** "You are a production engineer reviewing Knowledge Items for deployment readiness. Check:
1. **Error handling:** Do all handlers return descriptive errors to LLM (not generic 500s)?
2. **Firestore indexes:** Are composite indexes documented for idempotency queries?
3. **Firestore undefined:** Are all optional fields stripped before write (no undefined → crash)?
4. **Cost awareness:** Is there any unbounded query (missing limit/cap)?
5. **Backward compatibility:** Does the feature work if knowledgeItems collection is empty (new users)?
6. **Legacy compatibility:** Is `concludeConversation.ts` still functional as fallback?
7. **UI edge cases:** Empty states, loading states, error states for all views?
8. **Design system compliance:** CSS variables, no hardcoded colors, English-only UI text?
9. **Feature doc accuracy:** Does feature doc match final implementation? Are roadmap checkboxes updated?
10. **Test coverage:** Are all handlers tested? Are edge cases covered (empty KI, invalid slug, concurrent writes)?
11. Run `npx vitest run && npm run check` — all must pass."

Fix all findings.

### Final Verification

```bash
npx vitest run --project frontend      # frontend tests
npx vitest run --project functions     # backend tests
npm run check                          # lint + typecheck + docs
```

**MANDATORY: Final updates:**
- [ ] Update Phase Status table: FINAL → DONE
- [ ] Record final test count
- [ ] Update feature doc: move `← YOU ARE HERE` marker, check all roadmap items
- [ ] Move this task doc to `docs/archive/tasks/knowledge/knowledge-items-tasks.md`
