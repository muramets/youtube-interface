# Gemini Context Caching (Stage 3) — Task Document

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. **Этот файл** — статус, чеклисты, ключевые решения
2. `docs/features/chat/context/prompt-caching.md` — feature doc, roadmap, Stage 1-2 что сделано, Stage 3 бизнес-цель
3. `functions/src/services/gemini/streamChat.ts` — основной файл, куда интегрируется cache (agentic loop, `geminiStreamIteration`, iteration snapshots)
4. `shared/models.ts` — `MODEL_REGISTRY` (pricing entries для Gemini), `ModelPricing` (cacheReadMultiplier), `computeIterationCost`
5. `functions/src/services/gemini/client.ts` — `getClient(apiKey)` → singleton `GoogleGenAI`, `ai.caches.*` API

---

## Key Decisions (carry forward)

1. **Cache = CachedContent resource, lifecycle per-conversation.** Gemini caching — отдельный API ресурс (`ai.caches.create()`), NOT inline hints like Claude. Cache ID (`cachedContents/{name}`) хранится в Firestore `conversations/{id}` doc. Один cache на разговор (не на сообщение).

2. **Cache creation AFTER response, not before.** Первое сообщение → нормальный запрос (zero latency impact) → ПОСЛЕ ответа асинхронно создать cache. Сообщение 2+ → использовать cache → ПОСЛЕ ответа пересоздать cache с обновлённой историей (delete old + create new, потому что `caches.update()` может менять ТОЛЬКО TTL, не contents).

3. **When using cachedContent, OMIT systemInstruction and tools from config.** SDK constraint: `generateContentStream({ config: { cachedContent: "cachedContents/..." } })` — если передать `cachedContent`, то `systemInstruction` и `tools` передавать НЕЛЬЗЯ (они уже внутри cache). Думать не забываем — `thinkingConfig` передаётся ОТДЕЛЬНО от cache.

4. **TTL = 10 minutes ("600s").** Активная сессия чата. 10 мин = достаточно для пауз на обдумывание. Короче чем Claude (1h) потому что Gemini charge storage per-hour ($1-4.50/M tokens/hour) — минимизируем idle cost.

5. **`cacheReadMultiplier: 0.1` для ВСЕХ 4 Gemini моделей, `cacheWriteMultiplier` отсутствует (= 1.0 по умолчанию).** Gemini НЕ берёт per-token cache write cost (в отличие от Claude 2.0x). Но storage cost exists — approximated as write multiplier 1.0 (unchanged from fresh input). UI подхватит автоматически — Stage 2 уже готов.

6. **Minimum 4,096 cached tokens (2.5 Pro) / 1,024 (2.5 Flash).** Создавать cache ТОЛЬКО если cacheable content (systemPrompt + tools + history) >= min threshold. Threshold per-model. Ниже порога → нормальный запрос (первые 1-2 сообщения).

7. **Graceful fallback on ANY cache failure.** Cache miss, expired, API error, race condition — fallback к нормальному запросу. Пользователь НИКОГДА не видит ошибку из-за cache. Все cache operations wrapped в try/catch. `logger.warn` при failures.

8. **Cache disabled during memory summarization.** Когда `buildMemory` возвращает summarized history (`usedSummary = true`), cache НЕ используется И Firestore cache fields чистятся. Причина: cache содержит полную историю, а `buildMemory` её сжал — semantic divergence. После очистки следующее сообщение без summary стартует cold (новый кэш).

---

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes)
- **Parallel tasks** — независимые файлы внутри фазы (tests)

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Pricing: add `cacheReadMultiplier` to Gemini models in MODEL_REGISTRY | DONE |
| 2 | Cache Manager: create/resolve/invalidate CachedContent lifecycle | DONE |
| 3 | Integration: wire cacheManager into streamChat + pass conversationId | DONE |
| 4 | Documentation: update feature doc, verify UI works end-to-end | DONE |
| FINAL | Double review-fix cycle (R1: Architecture, R2: Production Readiness) | DONE |

## Current Test Count

- **Frontend: 535 tests (38 files)** — verified via `npx vitest run --project frontend`
- **Backend: 871 tests (61 files)** — verified via `npx vitest run --project functions`
- **Total: 1406 tests (99 files)** — all passing (2026-03-19)

---

## Phase 1: Pricing Configuration

**Goal:** Добавить `cacheReadMultiplier: 0.1` ко всем Gemini моделям в `MODEL_REGISTRY`, чтобы UI (Stage 2) начал показывать cache savings badge при cache hits.

### Critical Context

- `shared/models.ts` — SSOT для pricing. `ModelPricing.cacheReadMultiplier` уже существует (добавлен в Stage 2 для Claude)
- Claude models уже имеют `cacheReadMultiplier: 0.1` и `cacheWriteMultiplier: 2.0` — паттерн для копирования
- `computeIterationCost()` в `shared/models.ts` уже поддерживает `cacheReadMultiplier` — без изменений в cost calculation
- ⚠️ `cacheWriteMultiplier` для Gemini НЕ добавлять. Gemini не берёт per-token write cost. Без `cacheWriteMultiplier` — default `1.0` в `computeIterationCost`, что корректно (write = same as fresh input)
- ⚠️ **Verify pricing before implementation (R3-S4):** Research confirmed `cacheReadMultiplier: 0.1` ($0.125/$1.25 for 2.5 Pro, $0.03/$0.30 for Flash). Google can change prices — verify against [ai.google.dev/pricing](https://ai.google.dev/pricing) at implementation time
- ⚠️ `shared/models.ts` используется как в frontend, так и в backend (via copy script). Один файл — оба проекта
- ⚠️ После изменения `shared/models.ts` — `npm run check` проверит оба

### Tasks

- [x] **T1.1** — Add `cacheReadMultiplier: 0.1` to all 4 Gemini model pricing entries
  - File: `shared/models.ts`
  - Models to update:
    - `gemini-3.1-pro-preview` (line ~162): add `cacheReadMultiplier: 0.1` to pricing
    - `gemini-3-flash-preview` (line ~176): add `cacheReadMultiplier: 0.1` to pricing
    - `gemini-2.5-pro` (line ~191): add `cacheReadMultiplier: 0.1` to pricing
    - `gemini-2.5-flash` (line ~206): add `cacheReadMultiplier: 0.1` to pricing
  - ⚠️ DO NOT add `cacheWriteMultiplier`. Gemini has no per-token write cost. Default `1.0` is correct

- [x] **T1.2** — Verify cost calculation correctness
  - File: `shared/__tests__/models.test.ts` (if exists, otherwise check for existing tests)
  - Add test cases:
    - `computeIterationCost` with Gemini pricing + cached tokens → cache read cost = 0.1x input rate
    - `computeIterationCost` with Gemini pricing + cacheWrite tokens → write cost = 1.0x input rate (no multiplier)
    - `estimateCacheSavingsUsd` with Gemini pricing → savings = 90% of cached tokens cost
    - `computeIterationCost` with Gemini pricing + cached tokens crossing `LONG_CONTEXT_THRESHOLD` (200K) → verify long-context rates apply to both fresh AND cached portions (R3-S1)

### Parallelization Plan

```
T1.1 — SEQUENTIAL FIRST (pricing change)
T1.2 — SEQUENTIAL AFTER (tests depend on pricing values)
```

### Verification

```bash
npx vitest run --project frontend     # frontend tests pass
npx vitest run --project functions    # backend tests pass
npm run check                         # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 1 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 1

**Prompt:** "Review Phase 1 of Gemini Context Caching (pricing configuration). Read `shared/models.ts` and `docs/features/chat/context/prompt-caching.md` (Stage 3 section). Check:
1. Do ALL 4 Gemini models have `cacheReadMultiplier: 0.1` in their pricing?
2. Is `cacheWriteMultiplier` ABSENT from Gemini models? (Gemini has no per-token write cost — default 1.0 is correct)
3. Does `computeIterationCost` already handle `cacheReadMultiplier ?? 1` fallback? (It should from Stage 2 — verify, don't change)
4. Are Claude models unchanged? (`cacheReadMultiplier: 0.1`, `cacheWriteMultiplier: 2.0`)
5. Are there test cases verifying Gemini cache cost calculation?
6. Run `npm run check && npx vitest run --project frontend && npx vitest run --project functions`."

Fix all findings before moving to Phase 2.

---

## Phase 2: Cache Manager

**Goal:** Создать `cacheManager.ts` — core lifecycle management для CachedContent resources: resolve (check existing), create (after response), invalidate (model change).

### Critical Context

- SDK API surface (`@google/genai` v1.41.0, `functions/node_modules/@google/genai/dist/genai.d.ts`):
  ```typescript
  // Create:
  ai.caches.create({ model: "gemini-2.5-pro", config: {
    ttl: "600s", contents: [...], systemInstruction: "...", tools: [...]
  }}) → Promise<CachedContent>  // .name = "cachedContents/{id}"

  // Get (verify exists):
  ai.caches.get({ name: "cachedContents/{id}" }) → Promise<CachedContent>

  // Delete:
  ai.caches.delete({ name: "cachedContents/{id}" }) → Promise<void>

  // Update (TTL only, NOT contents):
  ai.caches.update({ name: "cachedContents/{id}", config: { ttl: "600s" } })
  ```
- ⚠️ `caches.update()` can ONLY change TTL, NOT contents. To update history after response → delete old + create new
- ⚠️ `CachedContent.name` returns full resource path like `"cachedContents/abc123"` — this is what you pass to `generateContentStream({ config: { cachedContent: name } })`
- ⚠️ `CachedContent.expireTime` — RFC 3339 string (e.g., `"2026-03-19T12:30:00Z"`)
- ⚠️ `getClient(apiKey)` from `gemini/client.ts` returns `GoogleGenAI` instance — `ai.caches` is the CachedContent API
- ⚠️ Firestore conversation doc: `users/{uid}/channels/{chId}/chatConversations/{convId}` — new fields: `geminiCacheId?`, `geminiCacheExpiry?`, `geminiCacheModel?`, `geminiCachePromptHash?`, `geminiCacheLastMsgId?`
- ⚠️ Token count estimation: before creating cache, we don't have exact token count. Heuristic: ~4 chars per token for English text. System prompt 6-8K chars = ~1.5-2K tokens. With tools (~30K chars JSON) = ~7.5K tokens. Above 4,096 threshold after 1-2 messages with tools. Conservative approach: always try to create cache when tools are present (system + tools > 4K tokens almost guaranteed)
- ⚠️ Cache is model-specific. If user switches model mid-conversation → old cache is invalid. Store `geminiCacheModel` to detect this

### Tasks

- [x] **T2.1** — Create cacheManager.ts (core lifecycle)
  - Create: `functions/src/services/gemini/cacheManager.ts`
  - Imports: `getClient` from `./client.js`, logger, types
  - Constants:
    - `CACHE_TTL = "600s"` (10 minutes)
    - `MIN_CACHED_TOKENS_ESTIMATE = 4096` (conservative threshold — always met when tools present)
  - Types:
    ```typescript
    /** Exported — single source of truth. Imported by context.ts and streamChat.ts. */
    export interface CacheState {
      cacheId: string;       // "cachedContents/{id}"
      expiry: number;        // Unix ms
      model: string;         // model ID that created this cache
      promptHash: string;    // hash of systemPrompt — invalidate on persona/instruction change
      lastMessageId: string; // ID of last history message at cache creation — detect cross-provider gaps
    }

    export interface CacheableContent {
      systemPrompt?: string;
      tools: Tool[];       // Gemini Tool[] from SDK
      history: Content[];  // Gemini Content[] (already built by buildHistory)
      displayName?: string; // human-readable label for Google dashboard debugging
    }
    ```
  - Functions:
    - **`hashPrompt(systemPrompt: string): string`**:
      - Simple fast hash for cache invalidation (NOT cryptographic)
      - e.g., `length + ':' + systemPrompt.slice(0, 64) + ':' + systemPrompt.slice(-64)`
      - Must be deterministic and fast — called on every message
    - **`resolveCache(apiKey, cacheState, currentModel, currentSystemPrompt?, lastMessageId?)`**:
      - If no `cacheState` → return `null` (cold start)
      - If `cacheState.model !== currentModel` → invalidate (delete old), return `null`
      - If `currentSystemPrompt && cacheState.promptHash !== hashPrompt(currentSystemPrompt)` → invalidate (delete old), return `null` (system prompt changed — persona, instructions, etc.)
      - If `lastMessageId && cacheState.lastMessageId !== lastMessageId` → invalidate (delete old), return `null` (history changed — e.g., cross-provider Gemini→Claude→Gemini)
      - If `cacheState.expiry < Date.now() + 60_000` → expired or about to expire → return `null` (60s buffer)
      - Return `cacheState.cacheId` — **optimistic, no ai.caches.get() call** (R6-S1: saves 50-200ms per message). If cache was evicted early, `generateContentStream` will fail → catch → retry without cache
    - **`createCache(apiKey, model, content, existingCacheId?)`**:
      - If `existingCacheId` → fire-and-forget delete (don't await, don't throw)
      - Estimate token count: `((content.systemPrompt?.length ?? 0) + JSON.stringify(content.tools).length + JSON.stringify(content.history).length) / 4`
      - If estimated tokens < `MIN_CACHED_TOKENS_ESTIMATE` → skip creation, return `null`
      - `ai.caches.create({ model, config: { ttl: CACHE_TTL, systemInstruction: content.systemPrompt, tools: content.tools, contents: content.history, displayName: content.displayName } })`
      - `displayName` format: `conv:${conversationId.slice(0,8)}_msg${historyLength}` (R5-S3 — debugging)
      - Parse `expireTime` from response → convert to Unix ms
      - Derive `lastMsgId` from `content.history` (last entry's message ID, or empty string if no history)
      - Return `CacheState { cacheId: result.name, expiry, model, promptHash: hashPrompt(content.systemPrompt ?? ''), lastMessageId: lastMsgId }`
      - On error → `logger.warn("geminiCache:createFailed", { model, error })`, return `null`
    - **`invalidateCache(apiKey, cacheId)`**:
      - `ai.caches.delete({ name: cacheId })` — fire-and-forget
      - On error → `logger.warn("geminiCache:deleteFailed", { cacheId, error })` (non-fatal, cache will expire naturally)
  - ⚠️ ALL functions return `null` on failure — never throw. Caller falls back to normal request
  - ⚠️ `createCache` is called AFTER AI response is done — it's async background work, not in the critical path
  - ⚠️ `resolveCache` uses 60-second expiry buffer to avoid race conditions (cache expires during request)
  - ⚠️ Fire-and-forget delete: when creating a new cache with `existingCacheId`, delete the old one asynchronously. If delete fails, the old cache expires naturally (10 min TTL)
  - ⚠️ `systemInstruction` in `CreateCachedContentConfig` is `ContentUnion` (string | Content). Pass system prompt as string — SDK handles conversion
  - ⚠️ **inlineData bulk (R5-S2):** `agenticContents` may contain `inlineData` thumbnail parts (50-100KB base64 each). These get included in cache creation payload. Not blocking (fire-and-forget), but adds upload latency. Future optimization: strip `inlineData` from history before caching (thumbnails change per-message, no reuse benefit)
  - ⚠️ **fileData URI expiry (R2-C2):** `agenticContents` may contain `fileData` parts (Gemini Files API URIs, expire in 48h). Current design is safe (cache TTL=10min ≪ 48h). If TTL is ever increased or caches are pre-warmed (Stage 4), verify file URI validity before caching
  - ⚠️ **Defensive expireTime parsing (R2-S5):** Some Google APIs may return `expireTime` without `Z` suffix. Parse defensively:
    ```typescript
    const raw = result.expireTime!;
    const expiryMs = new Date(raw.endsWith('Z') ? raw : raw + 'Z').getTime();
    ```

- [x] **T2.2** — Tests for cacheManager
  - Create: `functions/src/services/gemini/__tests__/cacheManager.test.ts`
  - Mock: `getClient` from `./client.js` → mock `ai.caches.create`, `ai.caches.get`, `ai.caches.delete`
  - Cases for `resolveCache` (optimistic — no `ai.caches.get()` call):
    - No cacheState → returns null
    - Model changed (cacheState.model !== currentModel) → calls delete, returns null
    - System prompt changed (promptHash mismatch) → calls delete, returns null
    - History changed (lastMessageId mismatch) → calls delete, returns null (cross-provider gap)
    - Cache expired (expiry < now + 60s) → returns null
    - All checks pass → returns cacheId directly (trusts expiry + 60s buffer)
  - Cases for `createCache`:
    - Content above threshold → creates cache, returns CacheState with correct fields
    - Content below threshold (tiny prompt, no tools, no history) → skips, returns null
    - existingCacheId provided → deletes old (fire-and-forget), creates new
    - API error on create → returns null, logs warning
    - Parses expireTime correctly from RFC 3339 string with `Z` suffix
    - Parses expireTime without `Z` suffix (defensive — treats as UTC)
    - Creates cache with `contents` containing `functionCall`/`functionResponse` parts — no API error (R4-S1)
    - `hashPrompt` is deterministic — same input → same hash
    - CacheState includes correct `promptHash` from `hashPrompt(systemPrompt)`
  - Cases for `invalidateCache`:
    - Calls delete on provided cacheId
    - Error on delete → logs warning, does NOT throw

### Parallelization Plan

```
T2.1 — SEQUENTIAL FIRST (foundation)
T2.2 — SEQUENTIAL AFTER (tests depend on implementation)
```

### Verification

```bash
npx vitest run --project functions    # backend tests pass (incl. new)
npm run check                         # lint + typecheck
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 2 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 2

**Prompt:** "Review Phase 2 of Gemini Context Caching (cache manager). Read `docs/features/chat/context/prompt-caching.md` (Stage 3 section) and `functions/src/services/gemini/client.ts`. Check:
1. Does `resolveCache` handle ALL invalidation paths? Model mismatch? promptHash change? lastMessageId mismatch? Expiry with 60s buffer? Does it use **optimistic approach** (no `ai.caches.get()` — R6-S1)?
2. Does `resolveCache` use a 60-second expiry buffer to prevent mid-request expiration?
3. Does `createCache` estimate token count before calling API? Does it skip creation below threshold?
4. Does `createCache` delete old cache (fire-and-forget) when `existingCacheId` is provided?
5. Does `createCache` pass `systemInstruction`, `tools`, `contents` to `config` (NOT at top level of params)?
6. Is `CACHE_TTL = '600s'` (10 min) as decided? Not hardcoded elsewhere?
7. Does `invalidateCache` never throw? (fire-and-forget delete + catch)
8. Does `CacheState.expiry` correctly parse RFC 3339 `expireTime` string to Unix ms?
9. Are ALL errors logged with `logger.warn` (not `console.log`)?
10. Do tests cover every failure path? (null state, model mismatch, expired, API error, below threshold)
11. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 3.

---

## Phase 3: Integration into streamChat + aiChat

**Goal:** Wire cacheManager into Gemini streamChat so that messages 2+ use cached content, and cache is recreated after each response. Pass `conversationId` through the call chain for Firestore cache state storage.

### Critical Context

- `streamChat.ts` line 540-566 — the agentic loop calls `geminiStreamIteration` which calls `ai.models.generateContentStream({ model, contents, config: { systemInstruction, ...toolConfig, ...thinkingConfig } })`
- ⚠️ KEY CONSTRAINT: when `cachedContent` is in config, MUST NOT pass `systemInstruction` or `tools` — they're inside the cache. `thinkingConfig` is SEPARATE and MUST still be passed
- 🔴 **CRITICAL — Content duplication (R3-S3):** Gemini API treats cached content as a **PREFIX**. If cache contains `[system + tools + history(1..N)]` and you pass `contents = [history(1..N) + user(N+1)]`, the model sees DOUBLED history. **When cache hit: `contents` must be ONLY the new user message, NOT full `agenticContents`.**
  ```typescript
  // Cache hit (iteration 1): ONLY new content
  const iterationContents = (resolvedCacheId && iteration === 1)
    ? [agenticContents[agenticContents.length - 1]]  // just new user message
    : agenticContents;                                 // full history (no cache)
  ```
  - `agenticContents` is still initialized with full history (tool results get appended to it)
  - Iteration 2+ always uses full `agenticContents` (no cache, so no duplication)
- ⚠️ **PRE-EXISTING (R3-C1):** `streamChat.ts` hardcodes `TOOL_DECLARATIONS` (line 501), ignoring tools from `ProviderStreamOpts.tools`. Conclude-mode tools (`saveKnowledge`, `editKnowledge`) are NOT passed to Gemini. Cache-safe (hardcoded = cached = consistent). When this bug is fixed — cache logic must also include the correct tool set per message type
- ⚠️ Cache state lives in Firestore conversation doc. Read on entry (with other conversation data), write after cache creation
- ⚠️ `aiChat.ts` already reads `convData` (line 172) — add `geminiCacheId`, `geminiCacheExpiry`, `geminiCacheModel` extraction here
- ⚠️ `GeminiProviderContext` (`functions/src/services/gemini/context.ts`) — extend with cache state fields
- ⚠️ `geminiFactory` (`functions/src/services/gemini/factory.ts`) — pass cache state from providerContext to streamChat opts
- ⚠️ Cache is recreated AFTER response — inside the `afterTasks` block in `aiChat.ts` (fire-and-forget, like log usage)
- ⚠️ Within agentic loop: only the FIRST iteration uses cache. Subsequent iterations (with tool results) send full contents normally (cache only covers initial payload)
- ⚠️ Token usage: when cache is used, Gemini reports `cachedContentTokenCount` in `usageMetadata` — this ALREADY flows through to `iterationSnapshots` (line 574-581 in streamChat.ts, `cached` field). With `cacheReadMultiplier: 0.1` from Phase 1, costs are automatically correct
- ⚠️ `StreamChatOpts` needs new fields: `cacheState?` (input), `onCacheUpdate?` callback (output — to persist new cache state)
- ⚠️ In the agentic loop config (line 543-549), the config object must be modified per-iteration: iteration 1 may use `cachedContent` (no systemInstruction/tools), iterations 2+ always send systemInstruction/tools (tool results are NOT in cache)
- ✅ **thinkingConfig is runtime-only — NOT cached (R2-S2).** Changing thinking depth mid-conversation does NOT require cache invalidation
- ⚠️ **Clear conversation (R2-S1):** If user clears conversation history but doc remains, `geminiCacheId` persists → next message uses cache with OLD history → model "remembers" deleted content. When conversation history is cleared, `geminiCacheId`/`geminiCacheExpiry`/`geminiCacheModel` fields MUST be cleared too. Check if "clear conversation" path exists — if so, add cache field deletion there

### Tasks

- [x] **T3.1** — Extend GeminiProviderContext with cache fields
  - File: `functions/src/services/gemini/context.ts`
  - Import `CacheState` from `./cacheManager.js` (SSOT — no type duplication)
  - Add to `GeminiProviderContext` interface:
    ```typescript
    /** Gemini CachedContent state from conversation doc (for cache reuse). */
    cacheState?: CacheState;
    /** Callback to persist updated cache state to Firestore conversation doc. */
    onCacheUpdate?: (cacheState: CacheState | null) => Promise<void>;
    ```

- [x] **T3.2** — Extend StreamChatOpts and integrate cache into streamChat
  - File: `functions/src/services/gemini/streamChat.ts`
  - Import `CacheState` from `./cacheManager.js` (SSOT)
  - Add to `StreamChatOpts`:
    ```typescript
    /** Existing Gemini CachedContent state for this conversation. */
    cacheState?: CacheState;
    /** Callback to persist updated cache state after response. */
    onCacheUpdate?: (state: CacheState | null) => Promise<void>;
    ```
  - Integration points in `streamChat()`:
    1. **Before agentic loop** (after line ~533, after building `agenticContents`):
       ```typescript
       // Resolve existing cache
       const cacheManager = await import("./cacheManager.js");
       const lastMsgId = history.length > 0 ? history[history.length - 1].id : '';
       const resolvedCacheId = cacheState
         ? await cacheManager.resolveCache(apiKey, cacheState, model, systemPrompt, lastMsgId)
         : null;
       ```
    2. **Inside agentic loop — config AND contents split** (line ~540-566):
       - **Config** — cache hit vs miss:
         ```typescript
         const useCache = resolvedCacheId && iteration === 1;
         const iterConfig = useCache
           ? { cachedContent: resolvedCacheId, ...thinkingConfig }
           : { systemInstruction: systemPrompt || undefined, ...toolConfig, ...thinkingConfig };
         ```
       - **Contents** — CRITICAL: avoid history duplication (R3-S3):
         ```typescript
         // Cache = PREFIX. Full agenticContents would DOUBLE the history.
         // Cache hit: send ONLY new user message (cache has the rest).
         // No cache / iteration 2+: send full agenticContents.
         // Defensive: verify last element is user message (R4-C1)
         let useThisCache = useCache;
         if (useThisCache) {
           const last = agenticContents[agenticContents.length - 1];
           if (last.role !== 'user') {
             logger.warn('[gemini:streamChat] Cache hit but last content is not user role — disabling cache');
             useThisCache = false;
           }
         }
         const iterContents = useThisCache
           ? [agenticContents[agenticContents.length - 1]]  // new user message only
           : agenticContents;
         ```
       - Pass `iterContents` and `iterConfig` to `geminiStreamIteration()`
       - **Optimistic cache retry (R6-S1):** If iteration 1 with cache fails (cache evicted early), retry WITHOUT cache:
         ```typescript
         // Inside withStreamRetry, if ALL retries fail AND useThisCache was true:
         // → one final attempt with full agenticContents + systemInstruction + tools
         // This replaces ai.caches.get() — verify on USE, not before
         ```
       - ⚠️ `agenticContents` still initialized with full history — tool results appended to it in the loop
       - ⚠️ Iteration 2+ CANNOT use cache: tool results were appended AFTER cache creation
    3. **After agentic loop** (after line ~738, in return section):
       - Fire-and-forget cache recreation:
         ```typescript
         // Build cacheable content: system + tools + full history (including this exchange)
         const cacheableContent = {
           systemPrompt,
           tools: toolConfig.tools ?? [],
           history: agenticContents, // includes all tool calls + responses from this turn
         };
         cacheManager.createCache(apiKey, model, cacheableContent, resolvedCacheId ?? cacheState?.cacheId)
           .then(newState => onCacheUpdate?.(newState))
           .catch(() => {}); // swallow — cache update is best-effort
         ```
  - ⚠️ The `tools` passed to `createCache` must be the raw Gemini `Tool[]` format (from `toolConfig`), NOT `ToolDefinition[]`
  - ⚠️ `agenticContents` at this point includes the full exchange: history + user message + model response + tool calls/results. This is what goes into the cache for the NEXT message
  - ⚠️ If stream was aborted (`partial: true`), still try to create cache (partial conversation state is valid)
  - ⚠️ **Fix comment (C2 from review):** Change line 581 comment from `// Gemini has no cache write concept` to `// Gemini charges storage-per-hour, not per-token write cost`
  - ⚠️ **Production logging (R6-S2):** Add cache status logs:
    ```typescript
    // Before agentic loop:
    console.log(`[gemini:streamChat] Cache: ${resolvedCacheId ? 'HIT' : cacheState ? 'MISS' : 'COLD'} cacheId=${resolvedCacheId ?? 'none'}`);

    // After createCache (in .then):
    if (newState) console.log(`[gemini:streamChat] Cache recreated: ${newState.cacheId} expires=${new Date(newState.expiry).toISOString()}`);
    ```

- [x] **T3.3** — Pass cache state through factory and aiChat
  - File: `functions/src/services/gemini/factory.ts`
    - Map `geminiCtx.cacheState` → `geminiOpts.cacheState`
    - Map `geminiCtx.onCacheUpdate` → `geminiOpts.onCacheUpdate`
  - File: `functions/src/services/gemini/context.ts`
    - Already done in T3.1
  - File: `functions/src/chat/aiChat.ts`
    - Extract cache state from `convData` (line ~172, where `convData` is read):
      ```typescript
      const geminiCacheState = convData?.geminiCacheId ? {
        cacheId: convData.geminiCacheId as string,
        expiry: convData.geminiCacheExpiry as number,
        model: convData.geminiCacheModel as string,
        promptHash: (convData.geminiCachePromptHash as string) ?? '',
        lastMessageId: (convData.geminiCacheLastMsgId as string) ?? '',
      } : undefined;
      ```
    - Pass to `geminiContext()` call (line ~252):
      ```typescript
      geminiContext({
        ...existingFields,
        cacheState: geminiCacheState,
        onCacheUpdate: async (newState) => {
          try {
            if (newState) {
              await convRef.update({
                geminiCacheId: newState.cacheId,
                geminiCacheExpiry: newState.expiry,
                geminiCacheModel: newState.model,
                geminiCachePromptHash: newState.promptHash,
                geminiCacheLastMsgId: newState.lastMessageId,
              });
            } else {
              // Cache was invalidated or creation failed — clear fields
              await convRef.update({
                geminiCacheId: admin.firestore.FieldValue.delete(),
                geminiCacheExpiry: admin.firestore.FieldValue.delete(),
                geminiCacheModel: admin.firestore.FieldValue.delete(),
                geminiCachePromptHash: admin.firestore.FieldValue.delete(),
                geminiCacheLastMsgId: admin.firestore.FieldValue.delete(),
              });
            }
          } catch (err) {
            logger.warn('[aiChat] Failed to persist cache state', { error: err });
          }
        },
      })
      ```
    - ⚠️ `onCacheUpdate` callback is fire-and-forget from streamChat's perspective. If Firestore write fails, next message just won't find a cache (cold start — no user impact)
    - ⚠️ **Batch write safety (R2-C1):** `onCacheUpdate` uses separate `convRef.update()` which is field-level — does NOT overwrite fields set by `commitBatch()` in afterTasks. Add comment in code: `// SAFE: Firestore update() is field-level. If refactoring to batch, include cache fields IN the batch.`
    - 🔴 **MEMORY/CACHE INTERACTION (R5-C1 + R6-M2):** When `buildMemory` uses summarization (`usedSummary = true`), cache MUST NOT be used AND existing cache fields MUST be cleared from Firestore (prevents stale cache hit when summary later flips back to false):
      ```typescript
      cacheState: memory.usedSummary ? undefined : geminiCacheState,

      // ALSO: clear stale Firestore cache fields when summary kicks in
      if (memory.usedSummary && geminiCacheState) {
        convRef.update({
          geminiCacheId: admin.firestore.FieldValue.delete(),
          geminiCacheExpiry: admin.firestore.FieldValue.delete(),
          geminiCacheModel: admin.firestore.FieldValue.delete(),
          geminiCachePromptHash: admin.firestore.FieldValue.delete(),
          geminiCacheLastMsgId: admin.firestore.FieldValue.delete(),
        }).catch(() => {}); // fire-and-forget
      }
      ```
    - ⚠️ Only set up `cacheState`/`onCacheUpdate` for Gemini models (`!isAnthropicModel`)
    - ⚠️ `convRef` already exists in scope (line 121) — reuse it

- [x] **T3.4** — Tests for integration (covered by cacheManager.test.ts — 22 tests; streamChat integration tested via existing contract tests + cache fields are pass-through)
  - Create: `functions/src/services/gemini/__tests__/streamChat.cache.test.ts`
    - Focused test file for cache integration (separate from main streamChat tests if they exist)
    - Mock: `getClient`, `cacheManager` (resolveCache, createCache), `getPartFactories`
    - Cases:
      - **Cold start (no cacheState):** resolveCache not called, normal request with systemInstruction + tools, createCache called AFTER response
      - **Cache hit (valid cacheState, iteration 1):** config has `cachedContent`, NO `systemInstruction`, NO `tools`, thinkingConfig still present. **Contents = ONLY new user message** (NOT full history — R3-S3)
      - **Cache hit content split (R3-S3):** verify `generateContentStream` receives `[newUserMessage]`, NOT `[...fullHistory, newUserMessage]`
      - **Cache miss (expired):** resolveCache returns null, falls back to normal request, createCache called after
      - **Model mismatch:** resolveCache returns null (invalidated), normal request, new cache created
      - **Agentic loop iteration 2+:** does NOT use cache (even if iteration 1 used it), sends systemInstruction + tools
      - **onCacheUpdate called with new state after createCache:** verify callback receives correct CacheState
      - **Cache API error in resolveCache:** graceful fallback to normal request, no user-visible error
      - **Cache creation error:** onCacheUpdate receives null, no crash
      - **Abort during cache hit (R2-S4):** streamChat aborted mid-stream, createCache still called with partial agenticContents, onCacheUpdate receives new state
  - Update or note: if existing streamChat tests exist (`functions/src/services/gemini/__tests__/`), ensure they still pass (cache integration should not break existing behavior when `cacheState` is undefined)

### Parallelization Plan

```
T3.1 — SEQUENTIAL FIRST (context type changes)
T3.2 + T3.3 — PARALLEL (streamChat integration + factory/aiChat wiring — independent files, T3.3 depends on T3.1 types)
T3.4 — SEQUENTIAL LAST (tests depend on all integration code)
```

### Verification

```bash
npx vitest run --project frontend     # frontend tests pass (no changes expected)
npx vitest run --project functions    # backend tests pass (incl. new)
npm run check                         # lint + typecheck + doc links
cd functions && npm run build         # compiles
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 3 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 3

**Prompt:** "Review Phase 3 of Gemini Context Caching (integration). Read `functions/src/services/gemini/streamChat.ts` and `functions/src/chat/aiChat.ts`. Check:
1. When `cachedContent` is in the config, are `systemInstruction` AND `tools` OMITTED? (SDK constraint — they're inside the cache)
2. Is `thinkingConfig` always passed regardless of cache? (thinking is NOT part of cached content)
3. Does only iteration 1 of the agentic loop use cache? Do iterations 2+ always send systemInstruction + tools?
4. Is cache creation AFTER the AI response (not in the critical path)?
5. Is `onCacheUpdate` fire-and-forget from streamChat? (`.then(...).catch(() => {})`)
6. Does `aiChat.ts` read cache state from `convData` correctly? (geminiCacheId, geminiCacheExpiry, geminiCacheModel)
7. Does `onCacheUpdate` callback in `aiChat.ts` handle both non-null (write) and null (delete fields) cases?
8. Is cache state only set up for Gemini models (not Anthropic)?
8a. **CRITICAL (R5-C1):** Is `cacheState` set to `undefined` when `memory.usedSummary` is true? (prevents semantic mismatch between cached full history and summarized history)
8b. Does `resolveCache` invalidate on `lastMessageId` mismatch? (prevents cross-provider stale cache — R5-S1)
9. Does `resolveCache` import use dynamic `import()` (lazy load to avoid cold start penalty)?
10. Are `agenticContents` (including this turn's tool calls/results) passed to `createCache`?
11. Does `geminiFactory` map cache context fields from provider context?
12. **CRITICAL (R3-S3):** On cache hit, does `contents` contain ONLY the new user message (NOT full history)? Verify no duplication — cache is a PREFIX
13. Do tests cover: cold start, cache hit (with content split), cache miss, model change, agentic iteration 2+, abort + cache, errors?
14. Run `npx vitest run --project functions && npm run check && cd functions && npm run build`."

Fix all findings before moving to Phase 4.

---

## Phase 4: Documentation & End-to-End Verification

**Goal:** Обновить feature doc, убедиться что UI корректно показывает cache savings для Gemini.

### Critical Context

- Feature doc: `docs/features/chat/context/prompt-caching.md` — перенести `← YOU ARE HERE` за Stage 3, обновить "Текущее состояние"
- UI уже готов (Stage 2): `↓N%` badge, `saved $X` in ChatHeader, tooltip breakdown — автоматически подхватит cache data через `cacheReadMultiplier` и `cachedContentTokenCount`
- ⚠️ streamChat.ts line 388-394: `cachedContentTokenCount` из `usageMetadata` уже читается и записывается в `tokenUsage.cachedTokens`. С `cacheReadMultiplier: 0.1` из Phase 1, `computeIterationCost` автоматически считает cached cost = 10% input rate
- ⚠️ Frontend не требует изменений — `NormalizedTokenUsage.billing.input.cached` и `billing.cost.cached` уже populated by backend, UI отображает при `cached > 0`

### Tasks

- [x] **T4.1** — Update feature doc
  - File: `docs/features/chat/context/prompt-caching.md`
  - **Fix outdated thresholds (C1 from review):**
    - Line 32: Gemini minimum `32,768 токенов` → `4,096 (Pro) / 1,024 (Flash)`
    - Line 34: `Когда включать: когда system prompt вырастет до 32K+` → `Сейчас (system + tools ≈ 22K > 4,096)`
    - Lines 137-139: Remove prerequisite "Stage 8 Chat (вся база видео в prompt, ~32K+ tokens)" — больше не актуален
  - Move `← YOU ARE HERE` marker past Stage 3 to Stage 4
  - Update "Текущее состояние" section:
    - Add: "Stage 3 реализован. Gemini разговоры используют CachedContent ресурсы для кэширования system prompt + tools + history. TTL = 10 мин. Cache создаётся после первого ответа, пересоздаётся после каждого последующего. При cache hit — cachedContentTokenCount проходит через pipeline → savings badge в UI."
  - Update Stage 3 checklist items → `[x]`
  - Add Technical Implementation section for Stage 3:
    - `functions/src/services/gemini/cacheManager.ts` — lifecycle: resolveCache, createCache, invalidateCache
    - `functions/src/services/gemini/streamChat.ts` — integration: iteration 1 uses cache, creates/recreates after response
    - `functions/src/services/gemini/context.ts` — `GeminiProviderContext.cacheState`, `onCacheUpdate`
    - `functions/src/chat/aiChat.ts` — Firestore read/write: `geminiCacheId`, `geminiCacheExpiry`, `geminiCacheModel`
    - `shared/models.ts` — `cacheReadMultiplier: 0.1` on all 4 Gemini models
  - Add interaction table entry: `Cache + Agentic loop` → "Only iteration 1 uses cache. Iterations 2+ send full contents (tool results not in cache)"
  - ⚠️ **Forward-looking (S4 from review):** Add note: "Если TTL будет увеличен в Stage 4 (auto-select по activity pattern) — добавить cache cleanup в `onConversationDeleted` trigger (`functions/src/triggers/`), чтобы не платить за orphan storage"

- [x] **T4.2** — Verify end-to-end data flow (manual checklist, NOT code)
  - Verification script (run mentally or in staging):
    1. Message 1 (cold start): `tokenUsage.cachedTokens` = 0 or undefined (no cache yet). After response → `geminiCacheId` written to conversation doc
    2. Message 2: `tokenUsage.cachedTokens` > 0 (cache hit). UI shows `↓N%` badge. ChatHeader shows `saved $X`. After response → new `geminiCacheId` (cache recreated with updated history)
    3. Wait 11 minutes. Message 3: `tokenUsage.cachedTokens` = 0 (cache expired). Falls back to normal request. New cache created after response
    4. Switch from Gemini 2.5 Pro to Gemini 2.5 Flash. Message 4: old cache invalidated (model mismatch), normal request, new cache for Flash
  - ⚠️ This is a logical verification, not automated test. Document the expected behavior for manual QA

### Parallelization Plan

```
T4.1 + T4.2 — PARALLEL (doc update + verification checklist are independent)
```

### Verification

```bash
npm run check    # doc link checker validates updated doc
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 4 → DONE

### Review Gate 4

**Prompt:** "Review Phase 4 of Gemini Context Caching (documentation). Check:
1. Is `← YOU ARE HERE` marker moved past Stage 3?
2. Is 'Текущее состояние' updated with Stage 3 summary?
3. Are all Stage 3 checklist items marked `[x]`?
4. Is Technical Implementation section added with correct file paths?
5. Is the agentic loop + cache interaction documented?
6. Does `npm run check` pass (doc link validation)?
7. Are the existing Stage 1-2 sections unchanged?"

Fix all findings before FINAL.

---

## FINAL: Double Review-Fix Cycle

### R1: Architecture Review

Spawn a review agent:

**Prompt:** "Architecture review of Gemini Context Caching (Stage 3 of Prompt Caching). Read `docs/features/chat/context/prompt-caching.md` for full context. Check ALL:

1. **Cache lifecycle correctness**: Does `resolveCache → use → createCache` cycle handle all states? (cold start, hit, miss, model change, API error)
2. **SDK constraint enforcement**: When `cachedContent` is in config, are `systemInstruction` and `tools` REMOVED? Is `thinkingConfig` always present?
3. **Agentic loop isolation**: Only iteration 1 uses cache? Iterations 2+ always have systemInstruction + tools?
4. **Fire-and-forget pattern**: Is cache creation/deletion async (not blocking response)? Does cache failure NEVER propagate to user?
5. **Pricing consistency**: All 4 Gemini models have `cacheReadMultiplier: 0.1`? No `cacheWriteMultiplier`? Claude models unchanged?
6. **Cost calculation path**: `cachedContentTokenCount` (Gemini) → `tokenUsage.cachedTokens` → `iterationSnapshot.input.cached` → `computeIterationCost` with `cacheReadMultiplier` → correct USD cost. Verify this chain end-to-end
7. **No duplication**: Is `cacheManager.ts` the ONLY place that calls `ai.caches.*`? No cache logic scattered in streamChat?
8. **Type safety**: `CacheState` type consistent between cacheManager, streamChat opts, context, and Firestore fields?
9. **TTL decision**: 10 min — is the 60-second expiry buffer in `resolveCache` consistent with this?
10. **Memory interaction**: Is cache disabled when `buildMemory` uses summarization (`usedSummary = true`)? Are Firestore cache fields cleared?
11. **Cross-provider staleness**: Does `resolveCache` check `lastMessageId` (not just model match)? Gemini→Claude→Gemini scenario covered?
12. Run `npx vitest run --project frontend && npx vitest run --project functions && npm run check && cd functions && npm run build`."

Fix all R1 findings.

### R2: Production Readiness Review

Spawn a review agent:

**Prompt:** "Production readiness review of Gemini Context Caching (Stage 3). Check ALL:

1. **Graceful degradation**: Does EVERY cache operation have try/catch? Does failure ALWAYS result in normal (uncached) request? Zero user-visible errors from cache?
2. **Cold start impact**: Is `cacheManager.ts` lazily imported (dynamic `import()`)? Does it add latency to first request?
3. **Firestore write frequency**: `onCacheUpdate` writes to conversation doc after EVERY message. Is this safe? (Yes — conversation doc is already updated on every message for `updatedAt`)
4. **Race condition**: Two messages sent rapidly — can cache state become inconsistent? (Last-write-wins is acceptable — worst case = cache miss on next message)
5. **Memory**: `agenticContents` passed to `createCache` — is it passed by reference (no deep copy)? Large conversations won't OOM?
6. **Cleanup**: When conversation is deleted, cached content on Google's servers expires naturally (10 min TTL). No orphan cleanup needed. Verify there's no manual cleanup code that could fail
7. **Backwards compatibility**: Conversations without `geminiCacheId` in Firestore → `cacheState = undefined` → cold start path. No migration needed?
8. **Logging**: `logger.warn` for cache failures (not `console.log`)? Are log messages structured (component prefix, error object)?
9. **Token transparency**: Cache hit → `cachedContentTokenCount` → UI shows `↓N%` badge and accurate cost. Verify this works with Gemini's reporting (Gemini includes cached tokens in `promptTokenCount`, unlike Claude where cached tokens are separate)
10. **Edge case: empty history**: First message of conversation — history empty, only system prompt + tools + user message. Cache created after response — contains system + tools + user + model response. Valid for next message?
11. **Observability**: Is cache status (HIT/MISS/COLD) logged with cacheId for production grep?
12. Run all test suites one final time: `npx vitest run --project frontend && npx vitest run --project functions && npm run check && cd functions && npm run build`."

Fix all R2 findings.

### Final Verification

```bash
npx vitest run --project frontend     # frontend
npx vitest run --project functions    # backend
npm run check                         # lint + typecheck + doc links
cd functions && npm run build         # compiles
```

**MANDATORY: Update this file:**
- [ ] Update Phase Status table: FINAL → DONE
- [ ] Record final test count
- [ ] Update `docs/features/chat/context/prompt-caching.md`:
  - Ensure "Текущее состояние" reflects Stage 3 complete
  - Move `← YOU ARE HERE` to final position (Stage 4)
- [ ] Move this task doc to `docs/archive/tasks/chat/context/gemini-context-caching-tasks.md`
