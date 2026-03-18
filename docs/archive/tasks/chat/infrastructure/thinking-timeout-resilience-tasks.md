# Thinking Timeout Resilience — Task Document

## Overview

Claude extended thinking (effort=high) может молчать минутами. Текущий 90s inactivity timeout убивает стрим, retry теряет accumulated thinking tokens ($0.50–$2.00). Решение: thinking-aware dynamic timeout + no-retry when thinking + partial persistence + SSE heartbeat.

**Feature doc:** `docs/features/chat/infrastructure/thinking-timeout-resilience.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/chat/infrastructure/thinking-timeout-resilience.md` (архитектура, решения, user flow)
3. `functions/src/services/claude/streamChat.ts` (main streaming — `streamIteration` ~line 875, inactivity timeout ~line 904–921, thinking events ~line 969)
4. `functions/src/services/ai/retry.ts` (`AiStreamTimeoutError`, `withStreamRetry`)
5. `functions/src/chat/aiChat.ts` (`thinkingAccumulator` ~line 193, catch block ~line 494, stopped message persistence ~line 417)

---

## Key Decisions (carry forward)

1. **Thinking-awareness lives INSIDE `isClaudeTransient`, not as a closure.** The predicate must be self-contained — `AiStreamTimeoutError` carries `hadThinkingProgress: boolean`, and `isClaudeTransient` reads it. Alternative (closure over external state) rejected: predicate would become stateful and brittle when called from other contexts.

2. **Escalate timeout, don't disable.** 90s → 600s during thinking, back to 90s after first text/tool event. Never disable timeout entirely — that creates zombie Cloud Function instances at $0.40/hr. 600s is generous enough for any Claude thinking session (current max observed: ~6 min).

3. **Partial thinking persisted in catch block of `aiChat.ts`, NOT in `streamChat.ts`.** `streamChat.ts` throws the error (with enrichment). `aiChat.ts` has access to `thinkingAccumulator`, `messagesPath`, Firestore `db` — all needed to persist. Keeps streaming code clean, catch-block gains new responsibility.

4. **SSE heartbeat is a new event type `{ type: "heartbeat" }`.** Sent every 30s during thinking silence. Client-side `aiProxyService.ts` resets inactivity timer on heartbeat but does NOT propagate to UI. Alternative (SSE comment `:heartbeat\n\n`) rejected: some EventSource implementations ignore comments, and our custom fetch-based parser wouldn't see them.

5. **`earlyInputTokens` enrichment on timeout.** Currently `AiStreamTimeoutError` is thrown bare (no usage info). On timeout path, we enrich the error with `earlyInputTokens`, `earlyCacheRead`, `earlyCacheWrite` captured from the "message" event. `aiChat.ts` uses this for partial `normalizedUsage` on the stopped message.

6. **Cloud Function timeout: 540s → 1200s.** Must exceed `THINKING_INACTIVITY_TIMEOUT_MS` (600s) + normal request overhead. 1200s = 20 min, safe margin. Firebase Cloud Functions v2 (Cloud Run) supports up to 3600s.

7. **Client-side timeout adapts to thinking.** `aiProxyService.ts` escalates `STREAM_TIMEOUT_MS` from 120s to 660s after receiving a `thought` event (600s + 60s buffer). After `chunk` event arrives, resets to 120s. This mirrors server-side behavior.

---

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes, независимый agent)
- **Parallel tasks** — независимые файлы внутри фазы (where marked)

### Memory update instructions
After each phase completion:
1. Mark tasks with checkboxes
2. Update Phase Status table
3. Record test count (run `npx vitest run --project frontend` + `npx vitest run --project functions`)

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Foundation: Enrich `AiStreamTimeoutError` + thinking-aware `isClaudeTransient` | DONE |
| 2 | Dynamic timeout + SSE heartbeat in `streamIteration` | DONE |
| 3 | Partial thinking persistence in `aiChat.ts` catch block | DONE |
| 4 | Client-side: heartbeat handling + adaptive timeout | DONE |
| FINAL | Double review-fix cycle (R1 Architecture + R2 Production Readiness) | DONE |

## Current Test Count

- **Frontend: 534 tests (39 files)** — verified via `npx vitest run --project frontend` (2026-03-18)
- **Backend: 837 tests (59 files)** — verified via `npx vitest run --project functions` (2026-03-18)
- **Total: 1371 tests (98 files)** — all passing

---

## Phase 1: Foundation — Error Enrichment + Transient Predicate

**Goal:** Enrich `AiStreamTimeoutError` with thinking progress info; make `isClaudeTransient` refuse retry when thinking was active.

### Critical Context

- `AiStreamTimeoutError` is in `functions/src/services/ai/retry.ts` (provider-agnostic, shared by Gemini and Claude)
- Adding a `hadThinkingProgress` field to a shared error class is safe because:
  - Gemini never sets it (defaults to `false` via constructor default)
  - Only Claude's `isClaudeTransient` checks it
  - The field is optional in the constructor, backward-compatible
- `isClaudeTransient` is in `functions/src/services/claude/streamChat.ts` (~line 440)
- Existing `retry.test.ts` tests `AiStreamTimeoutError` class — needs new tests for `hadThinkingProgress`
- Existing `streamChat.test.ts` has suite D (retry) — needs new test for "no retry when thinking"

### Tasks

- [x] **T1.1** — Enrich `AiStreamTimeoutError` in `functions/src/services/ai/retry.ts`
  - Add `hadThinkingProgress: boolean` property (default `false`)
  - Add optional `earlyInputTokens?: number` property
  - Add optional `earlyCacheRead?: number` property
  - Add optional `earlyCacheWrite?: number` property
  - Constructor signature: `constructor(message?: string, opts?: { hadThinkingProgress?: boolean; earlyInputTokens?: number; earlyCacheRead?: number; earlyCacheWrite?: number })`
  - ⚠️ BACKWARD COMPAT: existing `new AiStreamTimeoutError()` and `new AiStreamTimeoutError("msg")` must still work without opts
  - ⚠️ Gemini's `streamChat.ts` also throws `AiStreamTimeoutError` — verify it still compiles with no changes

- [x] **T1.2** — Update `isClaudeTransient` in `functions/src/services/claude/streamChat.ts` (~line 440)
  - Change: `if (err instanceof AiStreamTimeoutError) return true;`
  - To: `if (err instanceof AiStreamTimeoutError) return !err.hadThinkingProgress;`
  - This means: timeout during thinking → NOT transient → NOT retried → error propagates to `aiChat.ts` catch block
  - ⚠️ The rest of `isClaudeTransient` (APIError status checks) stays unchanged

- [x] **T1.3** — Tests for `AiStreamTimeoutError` enrichment
  - File: `functions/src/services/ai/__tests__/retry.test.ts` (extend existing)
  - New tests:
    - `hadThinkingProgress defaults to false`
    - `hadThinkingProgress can be set to true via opts`
    - `earlyInputTokens/earlyCacheRead/earlyCacheWrite stored from opts`
    - `backward compat: new AiStreamTimeoutError() works`
    - `backward compat: new AiStreamTimeoutError("msg") works`

- [x] **T1.4** — Tests for thinking-aware `isClaudeTransient`
  - File: `functions/src/services/claude/__tests__/streamChat.test.ts` (extend existing Suite D)
  - New tests:
    - `does NOT retry AiStreamTimeoutError when hadThinkingProgress=true` — streamIteration throws enriched timeout, withStreamRetry should propagate (not retry)
    - `DOES retry AiStreamTimeoutError when hadThinkingProgress=false` (regression — existing behavior)
  - ⚠️ `isClaudeTransient` is not exported — test through `streamChat()` behavior (verify via mock stream that hangs and times out)
  - Mock strategy: build a mock stream that emits thinking events, then never emits 'end' → timeout fires → verify error propagates without retry

### Parallelization plan
```
T1.1 — SEQUENTIAL FIRST (foundation — error class)
T1.2 — after T1.1 (uses new property)
T1.3 + T1.4 — PARALLEL (independent test files, both depend on T1.1+T1.2)
```

### Verification
```bash
cd /Users/muramets/Documents/youtube-interface
npx vitest run --project functions -- src/services/ai/__tests__/retry.test.ts
npx vitest run --project functions -- src/services/claude/__tests__/streamChat.test.ts
npm run check
```

### MANDATORY: Update this file before proceeding
- [x] Mark all T1.x tasks as ✅
- [x] Update Phase 1 status to DONE
- [x] Record test count

---

### Review Gate 1

**Prompt for review agent:**

Read these files:
1. `functions/src/services/ai/retry.ts` — `AiStreamTimeoutError` class
2. `functions/src/services/claude/streamChat.ts` — `isClaudeTransient` function (~line 440)
3. `functions/src/services/ai/__tests__/retry.test.ts` — new tests
4. `functions/src/services/claude/__tests__/streamChat.test.ts` — new tests (Suite D)

Answer these specific questions:
1. Does `AiStreamTimeoutError` remain backward-compatible? Can `new AiStreamTimeoutError()` and `new AiStreamTimeoutError("custom msg")` be called without the opts parameter?
2. Does `isClaudeTransient` return `false` (= don't retry) when `err.hadThinkingProgress === true`?
3. Does `isClaudeTransient` still return `true` (= retry) for `AiStreamTimeoutError` with `hadThinkingProgress === false` (the default)?
4. Does `isClaudeTransient` still correctly handle `APIError` status codes (429, 529, 500, 503)?
5. Is the Gemini `streamChat.ts` unaffected by the `AiStreamTimeoutError` change? (Gemini constructs it without opts — should get `hadThinkingProgress: false` by default.)
6. Do the new tests cover both branches (`hadThinkingProgress: true` → no retry, `false` → retry)?

Fix all findings before moving to Phase 2.

---

## Phase 2: Dynamic Timeout + SSE Heartbeat in streamIteration

**Goal:** Make the inactivity timeout thinking-aware (90s → 600s during thinking, back to 90s after text output) and send SSE heartbeats every 30s during thinking silence.

### Critical Context

- `streamIteration` is in `functions/src/services/claude/streamChat.ts` (~line 875)
- The inactivity timer is set up at ~line 904–921 using `setTimeout` + `resetTimer()`
- Thinking events arrive via `stream.on("thinking", ...)` at ~line 969
- Text events arrive via `stream.on("text", ...)` at ~line 962
- `callbacks` object is passed through — use `callbacks` for heartbeat SSE writes
- ⚠️ GOTCHA: `resetTimer()` currently uses a single `STREAM_INACTIVITY_TIMEOUT_MS`. Must change to use a mutable `currentTimeout` variable that switches between 90s and 600s
- ⚠️ GOTCHA: When thinking events arrive, they also call `resetTimer()`. After escalation, each thinking event resets the 600s timer (correct behavior — keeps the longer window)
- ⚠️ GOTCHA: `AiStreamTimeoutError` thrown by the timeout must be enriched with `hadThinkingProgress: true` and `earlyInputTokens` from the "message" event
- ⚠️ The heartbeat SSE event must be written to `res` (the HTTP response), but `streamIteration` only has access to `callbacks`. Solution: add `onHeartbeat` to `StreamCallbacks` or pass heartbeat writer through callbacks
- Cloud Function timeout must be increased: `aiChat.ts` line 39, `timeoutSeconds: 540` → `timeoutSeconds: 1200`

### Tasks

- [x] **T2.1** — Add `THINKING_INACTIVITY_TIMEOUT_MS` and `HEARTBEAT_INTERVAL_MS` constants
  - File: `functions/src/services/claude/streamChat.ts`
  - Add after `STREAM_INACTIVITY_TIMEOUT_MS` (~line 95):
    ```ts
    /** Escalated inactivity timeout during extended thinking (10 minutes). */
    const THINKING_INACTIVITY_TIMEOUT_MS = 600_000;

    /** Heartbeat interval during thinking silence — prevents browser/LB timeout. */
    const HEARTBEAT_INTERVAL_MS = 30_000;
    ```

- [x] **T2.2** — Add `onHeartbeat` to `StreamCallbacks` interface
  - File: `functions/src/services/ai/types.ts`
  - Add to `StreamCallbacks` interface:
    ```ts
    /** Called periodically during thinking silence to keep the connection alive. */
    onHeartbeat?: () => void;
    ```
  - ⚠️ Optional field — no changes needed in Gemini or existing callback consumers

- [x] **T2.3** — Implement dynamic timeout in `streamIteration`
  - File: `functions/src/services/claude/streamChat.ts`, `streamIteration` function (~line 875)
  - Changes to the timeout mechanism (~line 904–921):
    - Add mutable state: `let hadThinkingEvents = false;` and `let currentTimeoutMs = STREAM_INACTIVITY_TIMEOUT_MS;`
    - Add heartbeat interval: `let heartbeatInterval: ReturnType<typeof setInterval> | null = null;`
    - Modify `resetTimer()` to use `currentTimeoutMs` instead of `STREAM_INACTIVITY_TIMEOUT_MS`
    - In the timeout reject callback: create `AiStreamTimeoutError` with `{ hadThinkingProgress: hadThinkingEvents, earlyInputTokens, earlyCacheRead, earlyCacheWrite }`
    - In `stream.on("thinking", ...)` handler (~line 969):
      - Set `hadThinkingEvents = true`
      - Escalate timeout: `currentTimeoutMs = THINKING_INACTIVITY_TIMEOUT_MS`
      - Start heartbeat if not already running: `if (!heartbeatInterval) { heartbeatInterval = setInterval(() => callbacks.onHeartbeat?.(), HEARTBEAT_INTERVAL_MS); }`
      - `resetTimer()` (resets with new longer timeout)
    - In `stream.on("text", ...)` handler (~line 962):
      - If `hadThinkingEvents` (post-thinking phase), de-escalate: `currentTimeoutMs = STREAM_INACTIVITY_TIMEOUT_MS`
      - Stop heartbeat: `if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }`
      - `resetTimer()` (resets with original timeout)
    - In `finally` block (~line 1067): clear heartbeat interval alongside inactivity timer
  - ⚠️ `earlyInputTokens` is captured from "message" event at ~line 951–958. These variables are already in scope — no new captures needed

- [x] **T2.4** — Wire heartbeat callback in `aiChat.ts`
  - File: `functions/src/chat/aiChat.ts`
  - In the `callbacks` object (~line 197), add:
    ```ts
    onHeartbeat: () => {
        writeSSE(res, { type: "heartbeat" });
    },
    ```
  - Add `SSEHeartbeatEvent` to `sseWriter.ts` SSE event union

- [x] **T2.5** — Add heartbeat SSE event type to server-side writer
  - File: `functions/src/chat/sseWriter.ts`
  - Add: `type SSEHeartbeatEvent = { type: "heartbeat" };`
  - Add `SSEHeartbeatEvent` to the `SSEEvent` union type

- [x] **T2.6** — Increase Cloud Function timeout
  - File: `functions/src/chat/aiChat.ts`, line 39
  - Change: `timeoutSeconds: 540` → `timeoutSeconds: 1200`

- [x] **T2.7** — Tests for dynamic timeout behavior
  - File: `functions/src/services/claude/__tests__/streamChat.test.ts`
  - New tests (add new Suite F or extend Suite D):
    - `escalates timeout to 600s after first thinking event` — mock stream emits thinking, then stalls > 90s but < 600s → should NOT timeout
    - `de-escalates timeout to 90s after text event follows thinking` — mock stream emits thinking, then text, then stalls > 90s → SHOULD timeout
    - `enriches AiStreamTimeoutError with hadThinkingProgress=true on thinking timeout` — mock stream emits thinking, stalls > 600s → timeout error has `hadThinkingProgress: true`
    - `calls onHeartbeat during thinking silence` — mock stream emits thinking, wait > 30s → verify onHeartbeat called
    - `stops heartbeat after text event arrives` — mock stream: thinking → text → verify heartbeat stops
  - Mock strategy for timeout tests: use `vi.useFakeTimers()` to control setTimeout/setInterval, mock stream that emits events then pauses
  - ⚠️ GOTCHA: `streamChat.test.ts` uses `buildMockStream` which fires events via `queueMicrotask`. Timeout tests need careful timer control — events must fire before timer advances. Consider `vi.advanceTimersByTimeAsync()` pattern from `retry.test.ts`

### Parallelization plan
```
T2.1 + T2.2 — PARALLEL (constants + interface, independent files)
T2.3 — SEQUENTIAL (depends on T2.1 + T2.2, core implementation)
T2.4 + T2.5 + T2.6 — PARALLEL (all depend on T2.2/T2.3, but independent files)
T2.7 — SEQUENTIAL LAST (tests depend on all above)
```

### Verification
```bash
cd /Users/muramets/Documents/youtube-interface
npx vitest run --project functions -- src/services/claude/__tests__/streamChat.test.ts
npx vitest run --project functions -- src/services/ai/__tests__/retry.test.ts
npm run check
```

### MANDATORY: Update this file before proceeding
- [x] Mark all T2.x tasks as ✅
- [x] Update Phase 2 status to DONE
- [x] Record test count

---

### Review Gate 2

**Prompt for review agent:**

Read these files:
1. `functions/src/services/claude/streamChat.ts` — full file, focus on `streamIteration` function
2. `functions/src/services/ai/types.ts` — `StreamCallbacks.onHeartbeat`
3. `functions/src/chat/aiChat.ts` — heartbeat callback wiring + `timeoutSeconds`
4. `functions/src/chat/sseWriter.ts` — `SSEHeartbeatEvent`
5. `functions/src/services/claude/__tests__/streamChat.test.ts` — new timeout tests

Answer these specific questions:
1. Does the timeout correctly escalate from 90s to 600s ONLY after receiving the first thinking event?
2. Does the timeout correctly de-escalate from 600s back to 90s after the first text event (post-thinking)?
3. Is the heartbeat interval started only once (not duplicated on each thinking event)?
4. Is the heartbeat interval properly cleared in ALL exit paths (normal end, abort, timeout, error)?
5. Does the `AiStreamTimeoutError` thrown after thinking timeout carry `hadThinkingProgress: true` AND `earlyInputTokens` (if available)?
6. Is `onHeartbeat` optional in `StreamCallbacks`? Does Gemini compile without providing it?
7. Is `timeoutSeconds: 1200` set in `aiChat.ts`? Is this consistent with `THINKING_INACTIVITY_TIMEOUT_MS` (600s) plus overhead?
8. Do the tests actually verify timeout timing (fake timers advancing past 90s but not 600s), or do they just check function calls?

Fix all findings before moving to Phase 3.

---

## Phase 3: Partial Thinking Persistence in aiChat.ts Catch Block

**Goal:** When `AiStreamTimeoutError` propagates to `aiChat.ts` (thinking was in progress, not retried), persist accumulated thinking as a `status: 'stopped'` message with partial usage.

### Critical Context

- The catch block in `aiChat.ts` (~line 494) currently:
  - Reads `err.message`
  - Persists `lastError` on conversation doc
  - Writes SSE `{ type: "error", error: message }`
  - Does NOT save any thinking or partial response
- The `thinkingAccumulator` variable (~line 193) accumulates thinking text from `onThought` callback — it IS in scope in the catch block
- The stopped message persistence pattern already exists in the success path (~line 417–438) — reuse this exact pattern
- ⚠️ CRITICAL: `tokenUsage` and `normalizedUsage` are NOT in scope in the catch block (they're inside the try block after `router.streamChat()` returns). Must extract partial usage from the enriched `AiStreamTimeoutError`
- ⚠️ Multi-iteration thinking: if Claude did tool calls in iterations 1–2, then thinking timeout in iteration 3, the `AiStreamTimeoutError` will propagate through `streamChat()`. The outer `streamChat()` function should preserve `allToolCalls` from prior iterations — but currently it doesn't on the throw path. Need to enrich error OR change approach. **Decision: re-throw enriched error from `streamChat()` with accumulated context (toolCalls, text, normalizedUsage from prior iterations).**
- ⚠️ The error could also be a non-thinking error. The catch block should differentiate: `if (err instanceof AiStreamTimeoutError && err.hadThinkingProgress)` → persist thinking. Otherwise → existing error handling.

### Tasks

- [x] **T3.1** — Enrich error propagation in `streamChat()` for thinking timeout
  - File: `functions/src/services/claude/streamChat.ts`
  - In the agentic loop (~line 586–781), when `withStreamRetry` throws and the error is `AiStreamTimeoutError` with `hadThinkingProgress: true`:
    - Catch the error before it propagates
    - Create a `ClaudeStreamChatResult` with `partial: true`, accumulated `fullText`, `tokenUsage` from prior iterations, `allToolCalls` from prior iterations
    - Return this partial result instead of throwing
    - ⚠️ Wait — this contradicts the principle that `aiChat.ts` should handle persistence. Better approach:
  - **Revised approach:** Let the error propagate but return a partial result when possible. Wrap the agentic loop in try/catch:
    ```ts
    try {
        // ... agentic loop ...
    } catch (err) {
        if (err instanceof AiStreamTimeoutError && err.hadThinkingProgress) {
            // Return partial result — aiChat.ts will see partial: true and persist
            return {
                text: fullText,
                tokenUsage,
                normalizedUsage,
                toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
                partial: true,
            };
        }
        throw err; // non-thinking errors propagate as before
    }
    ```
  - Also: build `normalizedUsage` from `iterationSnapshots` accumulated so far (reuse existing logic from ~line 808–816)
  - Build partial tokenUsage from `earlyInputTokens` on the error if current iteration has no tokenUsage yet
  - ⚠️ `thinkingChars` from the current (failed) iteration needs to be captured. The `streamIteration` throws before returning `thinkingChars`. Solution: capture thinking state in the outer `streamChat` scope via callbacks (already done — `callbacks.onThought` fires before timeout)

- [x] **T3.2** — Handle partial result in `aiChat.ts` success path
  - File: `functions/src/chat/aiChat.ts`
  - After `router.streamChat()` returns (~line 337–350):
    - The existing code already handles `partial: true` at line 384: `const messageStatus = partial ? 'stopped' : 'complete';`
    - The existing stopped-message persistence at line 417–438 already handles `partial && responseText`
    - **But:** it doesn't include thinking when there's no responseText (thinking timeout = thinking accumulated, text might be empty)
    - Add: if `partial && !responseText && thinkingAccumulator`, still persist as stopped message with `text: ''` but with `thinking: thinkingAccumulator`
    - This handles the case where Claude was thinking (accumulated via `onThought`) but never produced text before timeout

- [x] **T3.3** — Handle `AiStreamTimeoutError` in `aiChat.ts` catch block for non-partial-return cases
  - File: `functions/src/chat/aiChat.ts`, catch block (~line 494)
  - Add special handling before the generic error path:
    ```ts
    // Persist partial thinking on thinking timeout (error propagated, not returned as partial)
    if (err instanceof AiStreamTimeoutError && err.hadThinkingProgress && thinkingAccumulator) {
        // Build partial usage from enriched error
        const partialUsage: TokenUsage | undefined = err.earlyInputTokens != null
            ? {
                promptTokens: err.earlyInputTokens,
                completionTokens: 0,
                totalTokens: err.earlyInputTokens + (err.earlyCacheRead ?? 0) + (err.earlyCacheWrite ?? 0),
                cachedTokens: err.earlyCacheRead || undefined,
                cacheWriteTokens: err.earlyCacheWrite || undefined,
            }
            : undefined;

        const stoppedMsg = {
            role: 'model', text: '', model, status: 'stopped',
            thinking: thinkingAccumulator,
            thinkingElapsedMs: firstThoughtTs ? Date.now() - firstThoughtTs : 0,
            createdAt: Date.now(), // NOT serverTimestamp — see SSE parser gotcha
        };
        if (partialUsage) stoppedMsg.tokenUsage = partialUsage;

        await db.collection(messagesPath).add(stoppedMsg).catch(e =>
            console.warn('[aiChat] Failed to persist thinking-timeout stopped message', e)
        );
    }
    ```
  - ⚠️ Import `AiStreamTimeoutError` at top of `aiChat.ts`: `import { AiStreamTimeoutError } from "../services/ai/retry.js";`
  - ⚠️ SSE parser gotcha: use `Date.now()` for `createdAt`, NOT `admin.firestore.FieldValue.serverTimestamp()` — `arrayUnion` with serverTimestamp causes Firestore errors in some contexts. But here we're using `collection.add()`, so serverTimestamp IS safe. Use `admin.firestore.FieldValue.serverTimestamp()` for consistency with the success-path pattern.

- [x] **T3.4** — Send SSE done event with partial thinking before error
  - File: `functions/src/chat/aiChat.ts`, catch block
  - Before `writeSSE(res, { type: "error", ... })`, if thinking timeout:
    ```ts
    writeSSE(res, {
        type: "done", text: '', status: 'stopped', partial: true,
        // No tokenUsage/normalizedUsage — partial, best-effort
    });
    ```
  - This ensures the client gets a `done` event with `status: 'stopped'` even on timeout, allowing the frontend to display the partial thinking instead of just an error

- [x] **T3.5** — Tests for partial thinking persistence
  - File: create `functions/src/chat/__tests__/aiChat.thinkingTimeout.test.ts`
  - ⚠️ `aiChat` is a Cloud Function — integration test style. Mock: Firestore `db`, `verifyAuthToken`, `verifyChannelAccess`, `buildMemory`, `createProviderRouter`, `writeSSE`
  - Test scenarios:
    - `persists stopped message with thinking on AiStreamTimeoutError with hadThinkingProgress=true` — router.streamChat() returns `{ text: '', partial: true }`, verify Firestore `add()` called with thinking text
    - `includes partial tokenUsage from earlyInputTokens on thinking timeout` — router.streamChat() throws AiStreamTimeoutError with earlyInputTokens, verify tokenUsage in persisted message
    - `sends SSE done event before error on thinking timeout` — verify writeSSE called with `{ type: "done", status: "stopped" }` before `{ type: "error" }`
    - `normal timeout (no thinking) does NOT persist stopped message` — AiStreamTimeoutError with hadThinkingProgress=false, verify no stopped message persisted
  - Alternative: if mocking `aiChat` is too heavy, test the persistence logic as an extracted function (see T3.6)

- [x] **T3.6** — Extract thinking-timeout persistence logic into a helper (optional, recommended)
  - If T3.5 requires too much mocking, extract the catch-block logic into:
    ```ts
    // In aiChat.ts or a new file functions/src/chat/thinkingTimeoutHandler.ts
    export async function persistThinkingTimeout(opts: {
        err: AiStreamTimeoutError;
        thinkingAccumulator: string;
        firstThoughtTs: number;
        messagesPath: string;
        model: string;
        db: FirebaseFirestore.Firestore;
    }): Promise<void> { ... }
    ```
  - This makes testing trivial: pass mock db, verify `collection().add()` call shape

### Parallelization plan
```
T3.1 — SEQUENTIAL FIRST (streamChat error handling)
T3.2 + T3.3 + T3.4 — SEQUENTIAL (all in aiChat.ts, order-dependent within catch block)
T3.5 — after T3.1–T3.4 (tests)
T3.6 — OPTIONAL, parallel with or instead of T3.5
```

### Verification
```bash
cd /Users/muramets/Documents/youtube-interface
npx vitest run --project functions -- src/services/claude/__tests__/streamChat.test.ts
npx vitest run --project functions -- src/chat/__tests__/aiChat.thinkingTimeout.test.ts
npx vitest run --project functions
npm run check
```

### MANDATORY: Update this file before proceeding
- [x] Mark all T3.x tasks as ✅
- [x] Update Phase 3 status to DONE
- [x] Record test count

---

### Review Gate 3

**Prompt for review agent:**

Read these files:
1. `functions/src/services/claude/streamChat.ts` — agentic loop error handling (new try/catch around the loop)
2. `functions/src/chat/aiChat.ts` — catch block changes + stopped message persistence
3. `functions/src/chat/__tests__/aiChat.thinkingTimeout.test.ts` (or equivalent test file)

Answer these specific questions:
1. When `streamChat()` catches `AiStreamTimeoutError` with `hadThinkingProgress: true`, does it return a partial result (not throw)?
2. Does the partial result include `tokenUsage` from prior iterations (if any tool calls happened before the thinking timeout)?
3. Does the partial result include `allToolCalls` from prior iterations?
4. In `aiChat.ts`, is thinking persisted both in the success path (partial result returned) AND in the catch block (error propagated)?
5. Is `earlyInputTokens` from the enriched error used to build partial `tokenUsage` when no other usage is available?
6. Does the SSE `done` event fire BEFORE the `error` event in the catch block? (Client needs `done` to display partial thinking.)
7. Are there any paths where thinking is accumulated via `onThought` but lost (neither returned in result nor persisted in catch)?
8. Is `AiStreamTimeoutError` properly imported in `aiChat.ts`?
9. Does the stopped message use `admin.firestore.FieldValue.serverTimestamp()` for `createdAt` (consistent with success path)?

Fix all findings before moving to Phase 4.

---

## Phase 4: Client-Side — Heartbeat Handling + Adaptive Timeout

**Goal:** Frontend handles the new `heartbeat` SSE event (reset inactivity timer, no UI effect) and adapts client-side timeout during thinking.

### Critical Context

- `parseSSEEvent` in `src/core/types/sseEvents.ts` constructs objects with explicit field listing. Adding a new event type requires a new `case` in the switch.
- ⚠️ SSE Parser Gotcha (from MEMORY): `parseSSEEvent` constructs objects with explicit field listing. Adding a new case is straightforward but easy to forget.
- `aiProxyService.ts` has a client-side inactivity timer at ~line 164 (`STREAM_TIMEOUT_MS = 120_000`). This must be escalated during thinking, similar to server-side logic.
- The `onThought` callback is already called for thinking events (~line 229). Can use it to trigger timeout escalation.
- The `StreamingStatusMessage.tsx` shows progressive status — should show thinking-specific messages when thinking timeout is active.

### Tasks

- [x] **T4.1** — Add `SSEHeartbeatEvent` to client-side types
  - File: `src/core/types/sseEvents.ts`
  - Add interface: `export interface SSEHeartbeatEvent { type: 'heartbeat'; }`
  - Add to `SSEEvent` union: `| SSEHeartbeatEvent`
  - Add case in `parseSSEEvent`: `case 'heartbeat': return { type: 'heartbeat' };`

- [x] **T4.2** — Handle heartbeat in `aiProxyService.ts`
  - File: `src/core/services/ai/aiProxyService.ts`
  - In the SSE event switch (~line 215):
    ```ts
    case 'heartbeat':
        // Heartbeat keeps connection alive — no UI effect, just reset timer
        break;
    ```
  - The `resetInactivityTimer()` at line 194 already runs for ANY data received — heartbeat bytes will trigger it automatically. The explicit `case 'heartbeat': break;` is for completeness and to avoid the "Unknown event type" warning.

- [x] **T4.3** — Adaptive client-side timeout during thinking
  - File: `src/core/services/ai/aiProxyService.ts`
  - Add constants:
    ```ts
    const THINKING_STREAM_TIMEOUT_MS = 660_000; // 600s thinking + 60s buffer
    ```
  - Add mutable state before the while loop:
    ```ts
    let currentStreamTimeout = STREAM_TIMEOUT_MS; // 120s default
    ```
  - Modify `resetInactivityTimer()` to use `currentStreamTimeout` instead of `STREAM_TIMEOUT_MS`
  - In `case 'thought'`: escalate timeout:
    ```ts
    case 'thought':
        currentStreamTimeout = THINKING_STREAM_TIMEOUT_MS;
        onThought?.(sseEvent.text);
        break;
    ```
  - In `case 'chunk'`: de-escalate timeout:
    ```ts
    case 'chunk':
        currentStreamTimeout = STREAM_TIMEOUT_MS;
        onStream(sseEvent.text);
        break;
    ```

- [x] **T4.4** — Update `StreamingStatusMessage.tsx` for thinking patience
  - File: `src/features/Chat/components/StreamingStatusMessage.tsx`
  - Currently hides when `thinkingText` is truthy (line 47). During extended thinking silence (after thinking events stop), `thinkingText` is non-empty but no new events arrive.
  - The existing behavior is actually correct: when thinking text has arrived, the thinking UI component shows the accumulated thinking text. `StreamingStatusMessage` is only for the initial idle phase.
  - **No changes needed** — the component correctly hides once thinking starts flowing.
  - ⚠️ However, consider: after thinking events stop (silence period), the thinking UI still shows the last thinking text. No "Deep thinking in progress..." indicator is needed because the thinking text itself is visible. If the user wants feedback during the silence, they can see the thinking panel is still "open" (streaming state is active).

- [x] **T4.5** — Tests for heartbeat handling
  - File: extend `src/core/types/chat/__tests__/` or create new test
  - Test `parseSSEEvent` with `heartbeat`:
    - `parseSSEEvent('{"type":"heartbeat"}') returns { type: 'heartbeat' }`
  - Note: `aiProxyService.ts` is hard to unit test (requires fetch mock + ReadableStream). The heartbeat behavior is implicitly tested via the `parseSSEEvent` test + code review. If full integration tests exist, verify there.

### Parallelization plan
```
T4.1 — SEQUENTIAL FIRST (type definition)
T4.2 + T4.3 — PARALLEL after T4.1 (both in aiProxyService.ts — actually sequential, same file)
   → Actually: T4.2 then T4.3 sequentially (same file, T4.3 modifies near T4.2)
T4.4 — PARALLEL (independent file, can skip if no changes needed)
T4.5 — SEQUENTIAL LAST (tests)
```

### Verification
```bash
cd /Users/muramets/Documents/youtube-interface
npx vitest run --project frontend
npm run check
```

### MANDATORY: Update this file before proceeding
- [x] Mark all T4.x tasks as ✅
- [x] Update Phase 4 status to DONE
- [x] Record test count

---

### Review Gate 4

**Prompt for review agent:**

Read these files:
1. `src/core/types/sseEvents.ts` — `SSEHeartbeatEvent` + `parseSSEEvent`
2. `src/core/services/ai/aiProxyService.ts` — heartbeat case + adaptive timeout
3. `functions/src/chat/sseWriter.ts` — `SSEHeartbeatEvent` (server-side mirror)

Answer these specific questions:
1. Is `SSEHeartbeatEvent` in sync between server (`sseWriter.ts`) and client (`sseEvents.ts`)? Same `type: "heartbeat"` string?
2. Does `parseSSEEvent` handle the `heartbeat` case? Does it return `{ type: 'heartbeat' }` (not null)?
3. Does the client-side timeout escalate from 120s to 660s after receiving a `thought` event?
4. Does the client-side timeout de-escalate to 120s after receiving a `chunk` event?
5. Does the `heartbeat` case in `aiProxyService.ts` avoid triggering any UI updates (no onStream, no onThought, etc.)?
6. Is the heartbeat data still causing `resetInactivityTimer()` to fire? (It should — any data received resets the timer.)
7. Are there any code paths where `currentStreamTimeout` is never reset to `STREAM_TIMEOUT_MS` after being escalated?

Fix all findings before moving to FINAL phase.

---

## FINAL Phase: Double Review-Fix Cycle

### R1: Architecture Review

**Prompt for review agent:**

Read ALL modified/created files across all phases:
1. `functions/src/services/ai/retry.ts`
2. `functions/src/services/ai/types.ts`
3. `functions/src/services/claude/streamChat.ts`
4. `functions/src/chat/aiChat.ts`
5. `functions/src/chat/sseWriter.ts`
6. `src/core/types/sseEvents.ts`
7. `src/core/services/ai/aiProxyService.ts`
8. All new test files

Answer these architecture questions:
1. **Consistency:** Do server-side and client-side timeout escalation follow the same state machine? (default → thinking → back to default)
2. **SRP:** Is each file responsible for one thing? Does `streamIteration` do too much now (streaming + timeout management + heartbeat)?
3. **Shared utilities:** Is there any duplicated logic between server and client timeout management that should be extracted to `shared/`?
4. **Error contract:** Is the `AiStreamTimeoutError` enrichment backward-compatible with ALL callers (Gemini, retry tests, etc.)?
5. **Callback contract:** Does `StreamCallbacks.onHeartbeat` being optional cause any issues in providers that don't support it?
6. **Multi-iteration safety:** If Claude completes 2 tool call iterations successfully, then thinking-timeouts on iteration 3 — are iterations 1–2 results preserved in the partial return?
7. **Zombie protection:** Can a Cloud Function instance get stuck for > 1200s? What kills it?
8. **Feature doc:** Is `docs/features/chat/infrastructure/thinking-timeout-resilience.md` updated with all architectural decisions?

### R2: Production Readiness Review

**Prompt for review agent:**

Read the same files as R1, plus:
- `docs/features/chat/infrastructure/chat-resilience.md` (related feature doc)
- Existing test files for context

Answer these production questions:
1. **Error handling:** If heartbeat `setInterval` throws (theoretically impossible but) — does the `finally` block still clean up?
2. **Memory leak:** Is the heartbeat interval cleared in ALL exit paths? (normal end, abort, timeout, stream error, non-transient error)
3. **Race condition:** Can `resetTimer()` be called after the stream promise resolves, causing a dangling timer?
4. **Cost visibility:** When thinking timeout occurs and partial usage is persisted — does the Token Transparency UI display it correctly? (It should — `normalizedUsage` is set on the stopped message.)
5. **Browser compatibility:** Does the heartbeat SSE event parse correctly in all browsers? (It's JSON over fetch ReadableStream, not native EventSource — should be fine.)
6. **Load balancer timeout:** Cloud Run's default request timeout might be lower than 1200s. Is there documentation about configuring this? ⚠️ This is Finding #7 from the review — flag for user if uncertain.
7. **Metrics:** Are thinking timeouts logged distinctly from regular timeouts? Can we distinguish them in Cloud Logging?
8. **Rollback safety:** If this change is deployed and causes issues, can we quickly revert? (Yes — the changes are backward-compatible, old clients ignore heartbeat events.)
9. **Test coverage:** Are all new code paths (escalation, de-escalation, partial persistence, heartbeat start/stop) covered by tests?
10. **Update `chat-resilience.md`** with the new constants, state machine, and links to thinking-timeout-resilience doc.

### Verification (FINAL)
```bash
cd /Users/muramets/Documents/youtube-interface
npx vitest run --project frontend
npx vitest run --project functions
npm run check
```

### MANDATORY: Update this file after FINAL
- [x] Mark FINAL phase as DONE
- [x] Record final test count
- [x] Update feature doc `thinking-timeout-resilience.md` current state marker
- [x] Update `chat-resilience.md` with cross-reference to thinking timeout resilience
