# Token Transparency — Tasks

## Current Wave: 3 (Features)
<!-- Update this line when moving to next wave -->

## Overview

Refactoring token tracking, cost calculation, and billing transparency across the AI chat system. Fixes 8 known bugs, adds per-iteration normalization, context breakdown, cost alerts, and audit tooling.

**Feature doc:** `docs/features/chat/token-transparency.md` — READ BEFORE ANY WAVE. Contains data model specs, normalization logic, provider field mappings, and all technical reference material.

## Quick Context Recovery

If you lost context — read these files in order:
1. **This file** (status + wave checklist)
2. `docs/features/chat/token-transparency.md` (specs, data model, provider mappings)
3. `shared/models.ts` — existing `TokenUsage`, `ModelPricing`, `ModelConfig`, `MODEL_REGISTRY`, `estimateCostEur()`
4. `functions/src/services/claude/streamChat.ts` — Claude streaming, token extraction, agentic loop
5. `functions/src/services/gemini/streamChat.ts` — Gemini streaming, usageMetadata, thinking
6. `functions/src/services/memory.ts` — buildMemory, HISTORY_BUDGET_RATIO, summarization
7. The specific files for the current wave (listed in wave section below)

## Key Decisions (carry forward)

These decisions MUST survive context loss. If you forget everything else, remember these:

1. **Per-iteration cost, NOT per-aggregate.** `computeIterationCost()` checks long context pricing per API call. `aggregateIterations()` only sums — no pricing logic. This eliminates the long context pricing bug entirely.
2. **`percent` is float, NOT rounded.** `Math.round` in persisted data = data loss. Rounding is a UI concern. `contextWindow.percent = 99.75`, not `100`.
3. **All new costs in USD.** Legacy `estimateCostEur()` untouched. All new code uses USD. Existing EUR data treated as USD (solo user, one chat).
4. **`shouldShowMessage()` is pure render function.** Message `status` is written once and never mutated. Visibility computed at render time from message position, not stored state.
5. **Legacy `tokenUsage` kept alongside `normalizedUsage`.** Backward compatibility — old messages still readable. Frontend reads `normalizedUsage` with fallback to legacy formula.
6. **Thinking tokens: Gemini exact, Claude approximate.** Gemini: `thoughtsTokenCount` from API (exact). Claude: count `thinking_delta` chars / 4 (~+/-15%). Different accuracy is an accepted trade-off.
7. **`HISTORY_BUDGET_RATIO` in `shared/models.ts`.** Single source for frontend (progress bar) + backend (buildMemory budget). Currently hardcoded in `memory.ts:9` — Task A extracts it.

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-wave context).
Subagents used for:
- **Review Gates** — read-only checks after each wave (fresh eyes, full review prompt)
- **Parallel tasks** — independent work within a wave (e.g., D + E + G in Wave 3)

Rule: waves are sequential (dependencies). Tasks within a wave may be parallel (no dependencies between them).

### Rules (non-negotiable)

1. **Mark task checkboxes `[x]` IMMEDIATELY after completing each task**, not at wave end. This enables mid-wave context recovery.
2. **BEFORE starting Wave N, verify Wave N-1 status is DONE in Wave Status table.** If not DONE — finish it first.
3. **Wave status = DONE only when ALL task checkboxes in that wave are `[x]`**, verification commands pass, and MANDATORY update checklist is complete.
4. **If a wave breaks something critical:** `git stash` current changes, verify tests pass on clean state, then `git stash pop` and debug. If unfixable after 15 minutes — `git checkout .` the wave's changes and retry with a different approach. Do NOT spend 30+ minutes debugging a broken approach.

### Agent Team

| ID | Agent | Scope | Key Files |
|----|-------|-------|-----------|
| **R** | Regression Tests | Cover existing behavior before changes | test files |
| **A** | Foundation | Data model + normalization + cost calc (pure functions) | `shared/models.ts`, shared/imageTokens.ts (new) |
| **B** | Memory Bugfix | buildMemory budget uses wrong model | `functions/src/services/memory.ts`, `functions/src/chat/aiChat.ts` |
| **C** | Provider Integration | Claude + Gemini normalizers + thinking extraction | `functions/src/services/claude/streamChat.ts`, `functions/src/services/gemini/streamChat.ts` |
| **D** | Stopped Messages | Persist stopped messages with partial usage | streaming files + `aiChat.ts` + frontend |
| **E** | Auxiliary Costs | Context breakdown + title/summary tracking | `aiChat.ts`, `generateChatTitle.ts`, `memory.ts` |
| **F** | Frontend Header | Progress bar: % until summarization | `useChatDerivedState.ts`, `ChatHeaderStats.tsx` |
| **G** | Frontend Tooltip | Per-message tooltip with thinking/iterations/USD | `ChatMessageList.tsx` |
| **H** | Layer Breakdown | Expandable panel with per-component token bars | `TokenBreakdown.tsx`, `ChatHeaderStats.tsx` |
| **I** | CLI Audit | Audit script: internal data vs provider billing | `scripts/audit-tokens.mjs` |
| **J** | Cost Alerts | Real-time cost warnings + model recommendations | `ChatHeaderStats.tsx`, `useChatDerivedState.ts` |
| **Rev** | Review Agent | 4 review gates + double final review | all changed files |

### Parallelization Overview

```
Wave 0:  [R] Regression Tests
Wave 1:  [A] Foundation        ||  [B] Memory Bugfix
Wave 2:  [C] Providers         ||  [F] Frontend Header
Wave 3:  [D] Stopped  ||  [E] Auxiliary  ||  [G] Tooltip
Wave 4:  [Rev] R1 Architecture -> Fix -> R2 Production -> Fix
Wave 5:  [H] Layer Breakdown   ||  [I] CLI Audit
Wave 6:  [J] Cost Alerts
Wave 7:  [Rev] R3 Full System -> Fix -> R4 Final -> Fix
```

> System is implemented fully. Waves 5-7 begin immediately after Wave 4 review passes.

---

## Wave Status

| Wave | Goal | Status |
|------|------|--------|
| 0 | Regression tests (lock existing behavior) | DONE |
| 1 | Foundation (data model + memory bugfix) | DONE |
| 2 | Integration (providers + frontend header) | DONE |
| 3 | Features (stopped msgs + auxiliary costs + tooltip) | TODO |
| 4 | Core System Review (R1 + R2) | TODO |
| 5 | Visualization + Audit (breakdown panel + CLI) | TODO |
| 6 | Cost Alerts (warnings + model recommendations) | TODO |
| 7 | Final System Review (R3 + R4) | TODO |

## Current Test Count

**Baseline (before Wave 0): Frontend 537 + Backend 369 = 906 total (63 files)**

| After Wave | Frontend | Backend | Total | Delta |
|------------|----------|---------|-------|-------|
| 0 | 171 | 373 | 544 | +7 |
| 1 | 199 | 375 | 574 | +30 |
| 2 | 583 | 381 | 964 | +390 |
| 3 | TBD | TBD | TBD | +TBD |
| 4 | TBD | TBD | TBD | +TBD |
| 5 | TBD | TBD | TBD | +TBD |
| 6 | TBD | TBD | TBD | +TBD |
| 7 | TBD | TBD | TBD | +TBD |

---

## Wave 0: Regression Tests

**Goal:** Cover existing behavior with tests BEFORE any refactoring. These tests document existing behavior (including known bugs) so regressions are caught.

### Parallelization plan
```
R1 (backend) || R2 (frontend) — PARALLEL (independent test files)
> Review Gate 0
```

### Tasks

- [x] **R1** — Backend regression tests (token extraction, memory budget)
- [x] **R2** — Frontend regression tests (contextUsed, contextPercent)

#### R1: Backend regression tests

**Depends on:** nothing

**Files to read:**
- `functions/src/services/claude/__tests__/streamChat.test.ts` — 37 existing tests (token extraction covered, abort NOT covered)
- `functions/src/services/gemini/__tests__/streamChat.contract.test.ts` — 19 existing tests (token extraction covered, abort NOT covered)
- `functions/src/services/__tests__/memory.test.ts` — 23 existing tests (budget + summarization covered)
- `functions/src/services/claude/streamChat.ts:795-808` — Claude finalMessage handler
- `functions/src/services/gemini/streamChat.ts:336-345` — Gemini usageMetadata handler
- `functions/src/services/memory.ts:185-195` — buildMemory budget logic

**New tests to add:**

1. **Claude: token accumulation across agentic iterations** — verify `tokenUsage` sums across iterations (current behavior, will change in Task C)
   - File: `functions/src/services/claude/__tests__/streamChat.test.ts`
   - Add to `describe("Claude streamChat — agentic loop")`

2. **Claude: tokenUsage undefined on abort** — verify that when `signal.abort()` fires, `tokenUsage` is `undefined` (current bug, baseline for Task D)
   - File: same

3. **Gemini: usageMetadata survives abort** — verify that `tokenUsage` contains data from last chunk when stream is aborted (already works, confirm with test)
   - File: `functions/src/services/gemini/__tests__/streamChat.contract.test.ts`

4. **Memory: budget uses utility model context limit** — verify `buildMemory` calculates budget as `MODEL_CONTEXT_LIMITS[UTILITY_MODEL_ID] * 0.6` (current bug, baseline for Task B)
   - File: `functions/src/services/__tests__/memory.test.ts`

**Acceptance criteria:**
- 4 new tests pass
- All existing tests still pass
- `npm run lint` passes

---

#### R2: Frontend regression tests

**Depends on:** nothing (parallel with R1)

**Files to read:**
- `src/features/Chat/hooks/useChatDerivedState.ts:82-92` — contextUsed + contextPercent formulas
- `src/features/Chat/components/ChatHeaderStats.tsx` — header rendering

**New tests to add:**

5. **`useChatDerivedState`: contextUsed formula** — verify `contextUsed = promptTokens + cachedTokens + cacheWriteTokens` from last model message
   - File: `src/features/Chat/hooks/__tests__/useChatDerivedState.test.ts` (new file)

6. **`useChatDerivedState`: contextPercent** — verify `contextPercent = Math.min(100, Math.round(contextUsed / contextLimit * 100))`
   - File: same

7. **`useChatDerivedState`: contextLimit source** — verify it uses `activeModel.contextLimit`
   - File: same

**Acceptance criteria:**
- 3 new tests pass
- `npm run lint` + `npm run typecheck` pass (new file)

---

### Verification

```bash
npm run test:run                              # all tests pass
npx vitest run --project functions            # backend tests pass
npm run lint                                  # clean
```

**MANDATORY: Update this file before proceeding (wave is NOT done until all boxes checked):**
- [x] Mark R1, R2 tasks above as done
- [x] Update Wave Status table: Wave 0 → DONE
- [x] Update "Current Test Count" table row for Wave 0
- [x] Update "Current Wave" pointer at top of file: `## Current Wave: 1 (Foundation)`

### Review Gate 0

After R1 + R2 complete, spawn a review agent:

**Prompt:** "Review the regression tests created in Wave 0 of token-transparency. Check:
- Do backend tests cover: Claude token accumulation across agentic iterations, Claude tokenUsage undefined on abort, Gemini usageMetadata survives abort, memory budget uses utility model?
- Do frontend tests cover: contextUsed formula (promptTokens + cachedTokens + cacheWriteTokens), contextPercent calculation, contextLimit from activeModel?
- Do test mocks accurately reflect real function signatures and Firestore data shapes?
- Are there any existing test files that now have conflicting assertions?
- Run `npm run test:run` (both projects) and `npm run lint` to confirm green."

Fix all review findings before moving to Wave 1.

---

## Wave 1: Foundation

**Goal:** Create pure data model + cost calculation functions in `shared/`, fix buildMemory budget bug.

### Parallelization plan
```
A (data model in shared/) || B (memory bugfix in functions/) — PARALLEL (different files, no overlap)
> Review Gate 1
```

### Tasks

- [x] **A** — Data model + normalization + cost calc
- [x] **B** — buildMemory budget bugfix

#### A: Data model + normalization + cost calc

**Depends on:** R1 (regression tests exist)

**Files to read:**
- `shared/models.ts:5-45` — existing `ModelPricing`, `TokenUsage`, `ModelConfig` interfaces
- `shared/models.ts:66` — `LONG_CONTEXT_THRESHOLD = 200_000`
- `shared/models.ts:73-100` — `estimateCostEur()` (legacy, do not touch)
- `shared/models.ts:156+` — `MODEL_REGISTRY` (add `imageTokensPerImage` here)
- Spec: `token-transparency.md` section "Data Model"
- Spec: `token-transparency.md` section "Cost Calculation"
- Spec: `token-transparency.md` section "Image Token Estimation"

**Files to modify:**
- `shared/models.ts:46` — add `imageTokensPerImage?: number` to `ModelConfig` interface
- `shared/models.ts:156+` — populate `imageTokensPerImage` in `MODEL_REGISTRY` entries (258 for 2.5, 1090 for 3.x)
- `shared/models.ts` (after existing code) — add interfaces: `NormalizedTokenUsage`, `IterationSnapshot`, `IterationCost`, `ContextBreakdown`, `AuxiliaryCost`
- `shared/models.ts` (after existing code) — add functions: `computeIterationCost()`, `aggregateIterations()`
- `shared/models.ts` (after existing code) — export `HISTORY_BUDGET_RATIO = 0.6`

**Files to create:**
- `shared/imageTokens.ts` — `estimateImageTokens()`, `estimateClaudeImageTokens()`

**Key decisions (already made):**
- Cost calculated per-iteration (not per-aggregate) — avoids long context pricing bug
- `percent` stored as float (not rounded) — no data loss
- Legacy `estimateCostEur()` untouched — backward compatibility
- All new costs in USD
- `LONG_CONTEXT_THRESHOLD = 200_000` already exists in `shared/models.ts:66` — reuse, don't duplicate
- `HISTORY_BUDGET_RATIO = 0.6` currently hardcoded at `functions/src/services/memory.ts:20` — extract to `shared/models.ts`

**Acceptance criteria:**
- `NormalizedTokenUsage`, `IterationSnapshot`, `IterationCost` interfaces exported
- `ContextBreakdown`, `AuxiliaryCost` interfaces exported
- `computeIterationCost()` — correct USD cost for standard + long context pricing
- `aggregateIterations()` — sums token counts + costs, contextWindow from last iteration
- `estimateImageTokens()` — Gemini: lookup from `imageTokensPerImage`, Claude: tile formula
- `HISTORY_BUDGET_RATIO` exported from `shared/models.ts`
- `MODEL_REGISTRY` Gemini entries have `imageTokensPerImage` (258 for 2.5, 1090 for 3.x)
- Tests: `computeIterationCost` with standard pricing, long context pricing, cache multipliers
- Tests: `aggregateIterations` with 1 iteration, 3 iterations, contextWindow uses last
- Tests: `estimateImageTokens` for Claude (multiple resolutions) and Gemini (per-model)
- Tests: `percent` is float (not rounded integer)
- `npm run lint` + `npm run typecheck` pass

---

#### B: buildMemory budget bugfix

**Depends on:** R1 (regression test R1.4 exists)

**Files to read:**
- `functions/src/services/memory.ts:178-195` — `buildMemory()`, budget calculation
- `functions/src/chat/aiChat.ts:139-147` — caller passes `UTILITY_MODEL_ID`
- `functions/src/services/__tests__/memory.test.ts` — existing tests

**Files to modify:**
- `functions/src/services/memory.ts:178-188` — `buildMemory()` signature: add `chatModel` param for budget, keep `summaryModel` for API call. Budget calc at line 188.
- `functions/src/chat/aiChat.ts:139-143` — caller: pass `model` (chat model) as `chatModel`, `UTILITY_MODEL_ID` as `summaryModel`

**Implementation:**
```typescript
// memory.ts — buildMemory signature change:
export async function buildMemory(opts: {
    apiKey: string;
    chatModel: string;     // for budget calculation (chat model context limit)
    summaryModel: string;  // for actual summarization API call (cheap model)
    allMessages: HistoryMessage[];
    existingSummary?: string;
    existingSummarizedUpTo?: string;
}) {
    const totalTokens = estimateTokens(allMessages);
    const budget = (MODEL_CONTEXT_LIMITS[opts.chatModel] || 200_000) * HISTORY_BUDGET_RATIO;
    // ... rest uses opts.summaryModel for generateSummary call
}
```

**Acceptance criteria:**
- `buildMemory()` uses chat model context limit for budget (not utility model)
- Summarization API call still uses `UTILITY_MODEL_ID` (cheap model)
- Tests: Claude budget = 200K x 0.6 = 120K
- Tests: Gemini budget = 1M x 0.6 = 600K
- Tests: summarization triggers for Claude when totalTokens > 120K
- Update existing memory tests (they mock `MODEL_CONTEXT_LIMITS`)
- Regression test R1.4 updated: was baseline for bug, now tests correct behavior
- `npm run lint` + `npm run test:run` pass

---

### Verification

```bash
npm run test:run                              # all tests pass
npm run lint                                  # clean
npm run typecheck                             # clean (new exports from shared/)
```

**MANDATORY: Update this file before proceeding (wave is NOT done until all boxes checked):**
- [x] Mark A, B tasks above as done
- [x] Update Wave Status table: Wave 1 → DONE
- [x] Update "Current Test Count" table row for Wave 1
- [x] Update "Current Wave" pointer at top of file: `## Current Wave: 2 (Integration)`

### Review Gate 1

After A + B complete, spawn a review agent:

**Prompt:** "Review Wave 1 of token-transparency (Foundation). Check:
- Is `NormalizedTokenUsage` truly provider-agnostic? No `claude_*` or `gemini_*` fields.
- Is `computeIterationCost()` the ONLY place that knows about `ModelPricing`? `aggregateIterations()` must NOT import or reference pricing.
- Does `computeIterationCost()` correctly apply long context pricing when `snapshot.input.total > LONG_CONTEXT_THRESHOLD`? Does it use `LONG_CONTEXT_THRESHOLD` from `shared/models.ts:66` (not a new constant)?
- Is `percent` stored as float in `aggregateIterations()` output? No `Math.round` in shared code.
- Does `estimateImageTokens()` use `imageTokensPerImage` from `MODEL_REGISTRY` for Gemini and tile formula for Claude?
- Is `HISTORY_BUDGET_RATIO` exported from `shared/models.ts` and removed from `memory.ts` hardcoded value?
- Does `buildMemory()` now accept `chatModel` for budget + `summaryModel` for API call?
- Are all new types/functions in `shared/` covered by tests?
- Run `npm run test:run`, `npm run lint`, `npm run typecheck` to confirm green."

Fix all review findings before moving to Wave 2.

---

## Wave 2: Integration

**Goal:** Integrate per-iteration normalization into both streaming providers. Update frontend header to show % until auto-summarization.

### Parallelization plan
```
C (backend: Claude + Gemini streamChat) || F (frontend: header + progress bar) — PARALLEL
  C depends on A (types from shared/)
  F depends on A (HISTORY_BUDGET_RATIO) + B (correct budget)
> Review Gate 2
```

### Tasks

- [x] **C** — Provider integration (Claude + Gemini normalizers + thinking extraction)
- [x] **F** — Frontend header (progress bar: % until summarization)

#### C: Provider integration (Claude + Gemini)

**Depends on:** A (types + functions from shared/)

**Files to read:**
- `functions/src/services/claude/streamChat.ts:795-808` — Claude finalMessage handler
- `functions/src/services/claude/streamChat.ts:487-503` — agentic loop accumulation
- `functions/src/services/claude/streamChat.ts:751-754` — thinking event handler
- `functions/src/services/gemini/streamChat.ts:336-345` — Gemini usageMetadata handler
- `functions/src/services/gemini/streamChat.ts:288-304` — thought part extraction
- Spec: `token-transparency.md` section "Normalization Logic"
- Spec: `token-transparency.md` section "Thinking Tokens"

**Files to modify:**
- `functions/src/services/claude/streamChat.ts` — add `normalizeClaudeIteration()` call per-iteration, collect snapshots, `aggregateIterations()` after loop, count thinking chars
- `functions/src/services/gemini/streamChat.ts` — add `normalizeGeminiIteration()` call per-iteration, read `thoughtsTokenCount`, collect snapshots, aggregate
- Both: return `normalizedUsage` in result alongside legacy `tokenUsage`
- `functions/src/chat/aiChat.ts` — save `normalizedUsage` to Firestore message document

**Key decisions:**
- Legacy `tokenUsage` continues to be written (backward compat)
- Claude thinking: count `thinking_delta` chars / 4 (approximate ~+/-15%)
- Gemini thinking: read `thoughtsTokenCount` from `usageMetadata` (exact)
- Gemini output total = `candidatesTokenCount + thoughtsTokenCount` (separate fields)

**Latent Gemini double-count bug (warning):**
Current frontend formula `contextUsed = promptTokens + cachedTokens + cacheWriteTokens` works for Claude but will **double-count** for Gemini when Gemini prompt caching activates — Gemini's `promptTokenCount` already includes cached tokens. `normalizedUsage.contextWindow.inputTokens` (from this task) fixes this because normalization handles the provider difference. Task F must read `normalizedUsage`, not legacy formula.

**Acceptance criteria:**
- Claude: `normalizedUsage` saved on every model message in Firestore
- Claude: `contextWindow.inputTokens` = last iteration's input (not accumulated)
- Claude: `billing.output.thinking` > 0 when thinking is enabled
- Gemini: `normalizedUsage` saved on every model message
- Gemini: `thoughtsTokenCount` read from `usageMetadata`
- Both: `iterationDetails` present when iterations > 1
- Both: legacy `tokenUsage` still written (unchanged)
- Tests: single iteration — normalizedUsage matches tokenUsage
- Tests: multi-iteration — contextWindow shows last, billing shows sum
- Tests: thinking tokens extracted (Claude approximate, Gemini exact)
- `npm run lint` + `npm run test:run` pass

---

#### F: Frontend header — progress bar until summarization

**Depends on:** B (correct budget) + A (`HISTORY_BUDGET_RATIO` exported)

**Files to read:**
- `src/features/Chat/hooks/useChatDerivedState.ts:59` — current `contextLimit` (model contextLimit, no ratio)
- `src/features/Chat/hooks/useChatDerivedState.ts:82-92` — `contextUsed` formula + `contextPercent` rounding
- `src/features/Chat/components/ChatHeaderStats.tsx:6-7,14-15,25-29` — header rendering, contextUsed display
- `shared/models.ts` — `HISTORY_BUDGET_RATIO` (exported by Task A)

**Files to modify:**
- `src/features/Chat/hooks/useChatDerivedState.ts:59` — contextLimit = `modelConfig.contextLimit * HISTORY_BUDGET_RATIO`
- `src/features/Chat/hooks/useChatDerivedState.ts:82-91` — contextUsed reads `normalizedUsage.contextWindow.inputTokens` with fallback to legacy formula
- `src/features/Chat/components/ChatHeaderStats.tsx:25-29` — tooltip: "Auto-summary at 120K. Model limit: 200K."

**Acceptance criteria:**
- `contextLimit` = `activeModel.contextLimit * HISTORY_BUDGET_RATIO`
- `contextUsed` reads `normalizedUsage.contextWindow.inputTokens` (fallback to legacy formula)
- Tooltip shows summarization threshold + model hard limit
- Tests: contextPercent for Claude = inputTokens / (200K * 0.6)
- Tests: contextPercent for Gemini = inputTokens / (1M * 0.6)
- Regression tests R2 updated to match new behavior
- `npm run lint` + `npm run typecheck` pass

---

### Verification

```bash
npm run test:run                              # all tests pass
npx vitest run --project functions            # backend tests pass
npm run lint                                  # clean
npm run typecheck                             # clean
```

**MANDATORY: Update this file before proceeding (wave is NOT done until all boxes checked):**
- [x] Mark C, F tasks above as done
- [x] Update Wave Status table: Wave 2 → DONE
- [x] Update "Current Test Count" table row for Wave 2
- [x] Update "Current Wave" pointer at top of file: `## Current Wave: 3 (Features)`

### Review Gate 2

After C + F complete, spawn a review agent:

**Prompt:** "Review Wave 2 of token-transparency (Provider Integration + Frontend Header). Check:
- Does Claude `normalizeClaudeIteration()` correctly map: `input.total = input_tokens + cache_read + cache_write`, `input.fresh = input_tokens`? (Claude's input_tokens EXCLUDES cached!)
- Does Gemini `normalizeGeminiIteration()` correctly map: `input.total = promptTokenCount`, `input.fresh = promptTokenCount - cachedContentTokenCount`? (Gemini INCLUDES cached in promptTokenCount!)
- Does Gemini read `thoughtsTokenCount` from `usageMetadata`? Is `output.total = candidatesTokenCount + thoughtsTokenCount`? (Separate fields, not bundled!)
- Does Claude count thinking via `thinking_delta` chars / 4? Is the approximate nature documented?
- Are `iterationDetails` present when iterations > 1?
- Is legacy `tokenUsage` still written on every message (unchanged)?
- Does frontend `contextLimit` = `activeModel.contextLimit * HISTORY_BUDGET_RATIO`?
- Does frontend `contextUsed` read `normalizedUsage.contextWindow.inputTokens` with fallback to legacy formula?
- Does tooltip show summarization threshold + model hard limit?
- Run `npm run test:run` (both projects), `npm run lint`, `npm run typecheck` to confirm green."

Fix all review findings before moving to Wave 3.

---

## Wave 3: Features

**Goal:** Persist stopped messages with partial billing, track auxiliary costs (title/summary), add per-message tooltip with thinking/iterations/USD.

### Parallelization plan
```
D (stopped messages: backend + frontend) || E (auxiliary costs: backend) || G (tooltip: frontend) — ALL PARALLEL
  D depends on C (normalization in streaming)
  E depends on C (normalization) + A (types)
  G depends on C (normalizedUsage in Firestore)
  No overlap: D = streaming + aiChat + ChatMessageList, E = aiChat + generateChatTitle, G = ChatMessageList tooltip only
> Review Gate 3
```

### Tasks

- [ ] **D** — Stopped messages persistence
- [ ] **E** — Auxiliary costs + context breakdown
- [ ] **G** — Frontend per-message tooltip

#### D: Stopped messages persistence

**Depends on:** C (normalization integrated)

**Files to read:**
- `functions/src/services/claude/streamChat.ts:738-820` — stream event handlers, abort flow
- `functions/src/services/gemini/streamChat.ts:229-333` — stream iteration, abort controller, AbortError throw at line 333
- `functions/src/chat/aiChat.ts:254-300` — result handling, tokenUsage logging, message save
- Spec: `token-transparency.md` section "Stopped Messages"

**Files to modify:**
- `functions/src/services/claude/streamChat.ts:738+` — add `stream.on("message", ...)` handler (fires BEFORE content generation, contains `usage.input_tokens` — available even on immediate abort). On abort: input = exact (from API), output = approximate (chars received / 4)
- `functions/src/services/gemini/streamChat.ts:330-333` — catch `AbortError`, return `tokenUsage` from last chunk + `partial: true`
- `functions/src/chat/aiChat.ts:254-300` — detect `result.partial`, save message with `status: 'stopped'`; filter stopped/deleted/error messages from history sent to AI
- `src/features/Chat/ChatMessageList.tsx:274-286` — add `shouldShowMessage()` visibility rule near existing tokenUsage rendering
- Firestore message type — add `status?: 'complete' | 'stopped' | 'deleted' | 'error'`

**Key decisions:**
- `status` never mutates after write (visibility = pure render logic)
- Stopped message visible while it's the last model message, hidden when newer complete message exists
- `'deleted'` only set by explicit user delete button (one-time write)

**Acceptance criteria:**
- Claude: abort returns `partial: true` + `inputTokens` from `message` event
- Gemini: abort returns `partial: true` + `tokenUsage` from last chunk
- Stopped message saved to Firestore with `status: 'stopped'` + `normalizedUsage.partial: true`
- `shouldShowMessage()`: stopped visible when last, hidden when newer complete exists
- `shouldShowMessage()`: deleted always hidden, error always hidden
- History filter: only `status === 'complete'` or `undefined` sent to AI
- Tests: Claude abort — partial usage returned
- Tests: Gemini abort — partial usage returned
- Tests: `shouldShowMessage()` with various message sequences
- Tests: history filter excludes stopped/deleted/error
- `npm run lint` + `npm run test:run` pass

---

#### E: Auxiliary costs + context breakdown

**Depends on:** C (normalization integrated) + A (types)

**Files to read:**
- `functions/src/chat/aiChat.ts:298-305` — summary token logging (`logAiUsage` + `summaryTokenUsage`)
- `functions/src/chat/generateChatTitle.ts:32-33` — title generation, no `logAiUsage` call (bug)
- `functions/src/services/memory.ts:178+` — `buildMemory` returns `summaryTokenUsage`
- Spec: `token-transparency.md` section "Context Breakdown Scaling"

**Files to modify:**
- `functions/src/chat/aiChat.ts:254-305` — collect `ContextBreakdown` (char sizes) before API call, save to Firestore message; save summary usage as `AuxiliaryCost` on conversation doc
- `functions/src/chat/generateChatTitle.ts:32-33` — add `logAiUsage(type: "title")`, save as `AuxiliaryCost`
- `functions/src/services/ai/types.ts` — add `width?: number; height?: number` to `AttachmentRef`
- `src/core/types/chat/chatAttachment.ts` — add `width?: number; height?: number` to `StagedFile` and `ReadyAttachment`
- `src/features/Chat/hooks/useFileAttachments.ts` — capture dimensions via `new Image()` at staging time, propagate to `ReadyAttachment`
- `src/features/Chat/components/ChatInput.tsx` (or attachment preview area) — show estimated tokens next to attached images

**Input preview UI for image tokens:**
When user attaches an image, show estimated token cost next to file info:
```
photo.jpg (2.4 MB) ~1,360 tokens
```
- Gemini: show immediately (no dimensions needed — fixed per model from `imageTokensPerImage`)
- Claude: show after `Image.onload` (needs dimensions for tile formula)
- Recalculate on model switch (different estimation per provider)
- YouTube thumbnails (from tool results): use hardcoded 1280x720

**Acceptance criteria:**
- `ContextBreakdown` saved on every model message (char sizes for text, token estimate for images)
- Summary cost saved as `AuxiliaryCost` on conversation document
- Title generation logged via `logAiUsage` + saved as `AuxiliaryCost`
- `AttachmentRef`, `StagedFile`, and `ReadyAttachment` have `width?/height?`
- Dimensions captured via `new Image()` at staging time in `useFileAttachments`
- Input preview shows estimated tokens per attached image
- Preview recalculates on model switch
- Tests: ContextBreakdown char counts correct per component
- Tests: AuxiliaryCost array updated on conversation doc
- Tests: generateChatTitle calls logAiUsage
- Tests: `estimateImageTokens()` called with correct dimensions per provider
- `npm run lint` + `npm run typecheck` + `npm run test:run` pass

---

#### G: Frontend per-message tooltip + display level utility

**Depends on:** C (normalizedUsage in Firestore)

**Files to read:**
- `src/features/Chat/ChatMessageList.tsx:274-286` — current tooltip: `tokenUsage` destructuring, `tooltip` array construction, cost calc
- Spec: `token-transparency.md` section "Display Levels" (includes level resolution logic)

**Files to create:**
- `src/features/Chat/utils/tokenDisplay.ts` — `TokenDisplayLevel` type, `LEVEL_RANK`, `getEffectiveDisplayLevel(preference, maxAllowed)`. Pure function: returns `min(preference, maxAllowed)` by rank. Current: hardcoded `preference = 'debug'`, `maxAllowed = 'debug'`. Future: reads from Firestore user settings + subscription tier.

**Files to modify:**
- `src/features/Chat/ChatMessageList.tsx:274-286` — read `normalizedUsage` (fallback to `tokenUsage`), use `getEffectiveDisplayLevel()` to determine what to show in tooltip (thinking/iterations/USD visible only at `detailed`+)

**Target tooltip format (at `detailed`+ level):**
```
Input: 43,200 tokens (38,100 cached)
Output: 4,800 tokens (2,100 thinking)
Tool calls: 5 (3 iterations)
Cost: $0.08 (without cache: $0.19)
```

**Acceptance criteria:**
- `getEffectiveDisplayLevel()` returns correct level for all preference x maxAllowed combinations
- Tooltip reads `normalizedUsage` with fallback to legacy `tokenUsage`
- Tooltip content respects display level (minimal = cost only, standard = + cache savings, detailed = + thinking/iterations)
- Thinking tokens shown when > 0 and level >= `detailed`
- Iteration count shown when > 1 and level >= `detailed`
- All costs in USD ($)
- Tests: `getEffectiveDisplayLevel()` — all rank combinations
- Tests: tooltip renders correctly with normalizedUsage data
- Tests: fallback to tokenUsage when normalizedUsage absent
- `npm run lint` + `npm run typecheck` pass (new file)

---

### Verification

```bash
npm run test:run                              # all tests pass
npx vitest run --project functions            # backend tests pass
npm run lint                                  # clean
npm run typecheck                             # clean
```

**MANDATORY: Update this file before proceeding (wave is NOT done until all boxes checked):**
- [ ] Mark D, E, G tasks above as done
- [ ] Update Wave Status table: Wave 3 → DONE
- [ ] Update "Current Test Count" table row for Wave 3
- [ ] Update "Current Wave" pointer at top of file: `## Current Wave: 4 (Core System Review)`

### Review Gate 3

After D + E + G complete, spawn a review agent:

**Prompt:** "Review Wave 3 of token-transparency (Stopped Messages + Auxiliary Costs + Tooltip). Check:
- Does Claude abort return `partial: true` with input tokens from `stream.on('message')` event? This event fires BEFORE content — input is exact even on immediate abort.
- Does Gemini abort catch `AbortError` and return `tokenUsage` from last chunk with `partial: true`?
- Is stopped message saved with `status: 'stopped'` + `normalizedUsage.partial: true`?
- Is `shouldShowMessage()` a pure function? No side effects, no status mutations. Stopped visible when last model message, hidden when newer complete exists.
- Does history filter only send `complete` and `undefined` (legacy) messages to AI?
- Is `ContextBreakdown` saved on every model message with char sizes for text + token estimates for images?
- Is summary cost saved as `AuxiliaryCost` on conversation doc?
- Does `generateChatTitle` now call `logAiUsage` and save as `AuxiliaryCost`?
- Do `StagedFile`, `ReadyAttachment`, and `AttachmentRef` now have `width?/height?`?
- Does input preview show estimated tokens per attached image? Recalculates on model switch?
- Does per-message tooltip read `normalizedUsage` with fallback to `tokenUsage`?
- Run `npm run test:run` (both projects), `npm run lint`, `npm run typecheck` to confirm green."

Fix all review findings before moving to Wave 4.

---

## Wave 4: Core System Review

**Goal:** Two rounds of comprehensive review to catch anything missed in Waves 0-3.

### Tasks

- [ ] **Rev R1** — Architecture Review (core system)
- [ ] **Rev R2** — Production Readiness Review

#### Rev R1: Architecture Review

**Depends on:** tasks A-G complete

Spawn a review agent:

**Prompt:** "Architecture review of token-transparency core system (Waves 0-3). Read `docs/features/chat/token-transparency.md` technical specification sections for full specs. Check:

1. `NormalizedTokenUsage` covers both providers with no provider-specific fields leaking
2. `computeIterationCost` is the ONLY place pricing logic exists
3. `aggregateIterations` does NOT know about `ModelPricing`
4. `percent` stored as float everywhere (no `Math.round` in persisted data)
5. Legacy `tokenUsage` still written and readable
6. `shouldShowMessage` is a pure function with no side effects
7. `HISTORY_BUDGET_RATIO` has single source in `shared/models.ts`
8. No EUR values in new code (all USD)
9. Image token estimation uses `imageTokensPerImage` from `MODEL_REGISTRY` for Gemini
10. `getEffectiveDisplayLevel()` is a pure function, display level logic lives only in `tokenDisplay.ts`
11. All new shared types/functions have tests"

**If issues found:** fix -> re-run lint + tests -> re-check.

---

#### Rev R2: Production Readiness Review

**Depends on:** R1 passes

Spawn a review agent:

**Prompt:** "Production readiness review of token-transparency core system. Check:

1. No console.log debugging left in production code
2. Error handling: what if `normalizedUsage` write fails? (should not block response)
3. Firestore reads: frontend handles missing `normalizedUsage` gracefully (fallback)
4. No N+1 queries introduced
5. `auxiliaryCosts` array size: acceptable for current scale (TODO(scaling) comment exists)
6. Stopped message: `partial: true` handled in all UI paths
7. All 7 token consumption points tracked (cross-reference with consumption map in feature doc)
8. Test count: at least 7 new regression + task-specific tests
9. `npm run test:run` passes for both projects
10. `npm run check:docs` passes (doc links valid)"

**If issues found:** fix -> re-run -> re-check.

---

### Verification

```bash
npm run test:run                              # frontend
npx vitest run --project functions            # backend
npm run lint                                  # lint
npm run typecheck                             # types
npm run check:docs                            # doc links
```

**MANDATORY: Update this file before proceeding (wave is NOT done until all boxes checked):**
- [ ] Mark Rev R1, Rev R2 tasks above as done
- [ ] Update Wave Status table: Wave 4 → DONE
- [ ] Update "Current Test Count" table row for Wave 4
- [ ] Update "Current Wave" pointer at top of file: `## Current Wave: 5 (Visualization + Audit)`
- [ ] Implementation continues — Waves 5-7 begin immediately

---

## Wave 5: Visualization + Audit

**Goal:** Add layer breakdown panel (visual token budget) and CLI audit tool (internal vs provider billing comparison).

### Parallelization plan
```
H (frontend: TokenBreakdown component) || I (scripts: CLI audit tool) — PARALLEL (completely independent)
  H depends on Wave 4 review (ContextBreakdown data from Task E)
  I depends on Wave 4 review (normalizedUsage in Firestore from Task C)
> Review Gate 5
```

### Tasks

- [ ] **H** — Layer breakdown panel
- [ ] **I** — CLI audit tool

#### H: Layer breakdown panel

**Depends on:** Wave 4 review passes (Task E provides `ContextBreakdown` data) + Task G (`getEffectiveDisplayLevel` utility)

**Business goal:** User sees exactly which prompt components cost the most. Can make informed decisions: remove extra videos from context, disable thinking, switch model.

**Files to read:**
- `src/features/Chat/components/ChatHeaderStats.tsx` — current header (trigger for panel)
- `src/features/Chat/hooks/useChatDerivedState.ts` — data source
- `src/features/Chat/utils/tokenDisplay.ts` — `getEffectiveDisplayLevel()` (created in Task G)
- Spec: `token-transparency.md` section "Context Breakdown Scaling"

**Files to create:**
- `src/features/Chat/components/TokenBreakdown.tsx` — expandable panel component

**Files to modify:**
- `src/features/Chat/components/ChatHeaderStats.tsx` — add click handler to open breakdown panel (only visible at `detailed`+ display level)

**Target UI:**
```
Context Breakdown (last request):
  System prompt    [===-------]  2,100 tokens (5%)
  Tool definitions [====------]  3,200 tokens (7%)
  History          [==========] 15,400 tokens (36%)
  Images           [=========~] 12,800 tokens (30%)
  Memory/Summary   [==--------]    800 tokens (2%)
  Current message  [===-------]  1,500 tokens (3%)
  Tool results     [====------]  7,400 tokens (17%)
  ──────────────────────────────────────────
  Total context:   43,200 / 120,000 (36% to auto-summary)

Billing breakdown (this message):
  3 API calls x cached prefix -> effective cost $0.08
  Thinking: 2,100 tokens -> $0.03
  Summary generation (Gemini Flash): $0.001
```

**Implementation notes:**
- Horizontal stacked bars — Tailwind CSS only, no chart library
- Hidden by default, opens on click (cost badge in header or dedicated button)
- Reads `contextBreakdown` from last model message in Firestore
- Uses `scaleBreakdown()` from spec for proportional scaling (chars -> tokens)
- Billing section reads `normalizedUsage.billing.cost` + `auxiliaryCosts` from conversation doc
- Responsive: on mobile, collapse bars to text-only list

**Acceptance criteria:**
- `TokenBreakdown` component renders stacked horizontal bars
- Each bar labeled with component name, token count, percentage
- Billing section shows per-message cost + auxiliary costs (summary, title)
- Panel opens/closes on click, hidden by default
- Uses existing design tokens (CSS variables, z-index scale)
- All text in English (UI)
- Tests: component renders with mock `ContextBreakdown` data
- Tests: `scaleBreakdown()` produces correct proportions, sum = actualTotal
- Tests: panel toggle open/close
- `npm run lint` + `npm run typecheck` pass

---

#### I: CLI audit tool

**Depends on:** Wave 4 review passes (Task C provides `normalizedUsage` in Firestore)

**Business goal:** Periodic investigation — compare internal token/cost data with provider billing. Detect anomalies and billing discrepancies.

**Files to read:**
- `scripts/audit-tokens.mjs` — existing audit script (basic, reads Firestore)
- `scripts/dump-conversation.mjs` — existing dump script (reference)

**Files to modify:**
- `scripts/audit-tokens.mjs` — extend with `normalizedUsage` reading + Anthropic Admin API comparison

**Implementation notes:**

**Phase 1: Internal audit** (extend existing script)
- Read all messages + `normalizedUsage` + `iterationDetails` from Firestore
- Show per-message breakdown: iterations, input/output tokens, cost, context window
- Show conversation totals + auxiliary costs

**Phase 2: Provider comparison** (Anthropic Admin API)
- Use `ANTHROPIC_ADMIN_KEY` (already in Google Secret Manager)
- Anthropic Admin Usage API: `GET /v1/organizations/{org_id}/usage` with date filters
- Match internal messages to API usage by timestamp + model
- Show discrepancy report

**Target output format:**
```
=== CONVERSATION AUDIT ===
Title: Slow Life Analytics Deep Dive
Model: claude-sonnet-4-6
Messages: 6 (3 user, 3 model)

Msg#2 | 2 tools, 2 iterations
  Our cost: $0.19 | Iter 1: 28K in, 1.2K out | Iter 2: 28.4K in, 1.4K out
  Context window: 28.4K / 200K (14%)

Msg#4 | 1 tool, 2 iterations
  Our cost: $0.07 | Iter 1: 13K in, 0.2K out | Iter 2: 13.4K in, 0.1K out
  Context window: 13.4K / 200K (7%)

Msg#6 | 5 tools, 3 iterations
  Our cost: $0.22 | Iter 1: 40K in, 0.5K out | Iter 2: 42K in, 3K out | Iter 3: 43K in, 3.9K out
  Context window: 43K / 200K (22%)

Conversation total: $0.49
Auxiliary: summary $0.02, title $0.001
Provider billing (Anthropic API): $0.51
Discrepancy: $0.00 (within 2% tolerance)
```

**CLI options:**
- `node scripts/audit-tokens.mjs <conversationPath>` — single conversation
- `--date-from`, `--date-to` — filter by date range
- `--model <model>` — filter by model
- `--compare-provider` — enable Phase 2 (Anthropic Admin API comparison)

**Acceptance criteria:**
- Phase 1: reads `normalizedUsage` + `iterationDetails` from Firestore messages
- Phase 1: shows per-message and conversation-level cost breakdown
- Phase 1: shows auxiliary costs from conversation document
- Phase 2: fetches Anthropic Admin API usage data (requires `ANTHROPIC_ADMIN_KEY`)
- Phase 2: matches internal data to provider billing by timestamp
- Phase 2: shows discrepancy report with tolerance threshold (2%)
- CLI supports date/model filters
- Script runs successfully: `node scripts/audit-tokens.mjs <path>`
- Documentation: usage examples in script header comments

---

### Verification

```bash
npm run test:run                              # all tests pass
npm run lint                                  # clean
npm run typecheck                             # clean (new component)
```

**MANDATORY: Update this file before proceeding (wave is NOT done until all boxes checked):**
- [ ] Mark H, I tasks above as done
- [ ] Update Wave Status table: Wave 5 → DONE
- [ ] Update "Current Test Count" table row for Wave 5
- [ ] Update "Current Wave" pointer at top of file: `## Current Wave: 6 (Cost Alerts)`

### Review Gate 5

After H + I complete, spawn a review agent:

**Prompt:** "Review Wave 5 of token-transparency (Layer Breakdown + CLI Audit). Check:
- Does `TokenBreakdown` use `scaleBreakdown()` for proportional scaling? No manual token math in component.
- Do horizontal bars use Tailwind CSS only (no chart library)?
- Is the panel hidden by default, toggle on click?
- Does billing section show per-message cost + auxiliary costs (from conversation doc)?
- Does CLI audit script read `normalizedUsage` + `iterationDetails` from Firestore?
- Does Phase 2 of audit script match internal data to Anthropic Admin API by timestamp?
- Does the script handle missing `normalizedUsage` gracefully (old messages before refactoring)?
- Does the script support `--date-from`, `--date-to`, `--model` filters?
- Run `npm run test:run`, `npm run lint`, `npm run typecheck` to confirm green.
- Run `node scripts/audit-tokens.mjs --help` to verify CLI works."

Fix all review findings before moving to Wave 6.

---

## Wave 6: Cost Alerts

**Goal:** Proactive cost management — warnings before a conversation becomes expensive, model recommendations to optimize cost/quality ratio.

### Tasks

- [ ] **J** — Real-time cost warnings + model recommendations

#### J: Real-time cost warnings + model recommendations

**Depends on:** H (layer breakdown exists for detailed view) + C (normalizedUsage in Firestore)

**Files to read:**
- `src/features/Chat/components/ChatHeaderStats.tsx` — header (where warnings appear)
- `src/features/Chat/hooks/useChatDerivedState.ts` — cost data source
- `shared/models.ts` — `MODEL_REGISTRY`, pricing data

**Files to create:**
- `src/features/Chat/components/CostAlertBanner.tsx` — warning banner component
- `src/features/Chat/hooks/useCostAlerts.ts` — alert logic hook

**Files to modify:**
- `src/features/Chat/components/ChatHeaderStats.tsx` — integrate alert banner

**Alert thresholds (configurable):**

| Trigger | Display | Style |
|---------|---------|-------|
| Conversation total > $1 | "This conversation has cost $1.23" | Yellow warning banner |
| Conversation total > $5 | "This conversation has cost $5.47" | Orange warning banner |
| Conversation total > $10 | "High cost conversation: $12.30" | Red warning banner |
| Single message > $0.50 | "Expensive message" badge on message | Red badge on message |

**Model recommendation logic:**
- Calculate hypothetical cost if same conversation used cheapest model with same provider
- Show: "Switching to Gemini Flash would save ~60% for this conversation"
- Only recommend when savings > 30% (avoid noise)
- Recommendation appears in layer breakdown panel (Task H) and in alert banner

**Implementation notes:**
- `useCostAlerts()` hook: reads `normalizedUsage.billing.cost.total` from all messages + `auxiliaryCosts`, computes thresholds
- Thresholds stored as constants (future: user preferences)
- Banner appears below header, above messages — uses existing toast/banner patterns
- "Expensive message" badge: small red `$` icon on message footer, tooltip shows cost
- Model recommendation: `estimateAlternativeCost()` — re-price all iterations with alternative model pricing from `MODEL_REGISTRY`

**Acceptance criteria:**
- `useCostAlerts()` computes conversation total from all messages + auxiliary costs
- Warning banner appears at correct thresholds ($1, $5, $10)
- Banner is dismissible (per-session, not persisted)
- "Expensive message" badge appears on messages > $0.50
- Model recommendation shows when savings > 30%
- `estimateAlternativeCost()` correctly re-prices with alternative model
- All UI text in English: banner messages, badge tooltip, recommendation text, dismissal button. Grep for Cyrillic in new files — 0 results.
- Uses design system tokens: warning colors from CSS variables (`--warning`, `--error` or equivalent), z-index from named classes, spacing from Tailwind scale
- Tests: `useCostAlerts()` with various cost totals
- Tests: `estimateAlternativeCost()` with known pricing
- Tests: banner renders at each threshold
- Tests: recommendation only shown when savings > 30%
- `npm run lint` + `npm run typecheck` pass

---

### Verification

```bash
npm run test:run                              # all tests pass
npm run lint                                  # clean
npm run typecheck                             # clean
```

**MANDATORY: Update this file before proceeding (wave is NOT done until all boxes checked):**
- [ ] Mark J task above as done
- [ ] Update Wave Status table: Wave 6 → DONE
- [ ] Update "Current Test Count" table row for Wave 6
- [ ] Update "Current Wave" pointer at top of file: `## Current Wave: 7 (Final System Review)`

### Review Gate 6

After J complete, spawn a review agent:

**Prompt:** "Review Wave 6 of token-transparency (Cost Alerts). Check:
- Does `useCostAlerts()` sum `normalizedUsage.billing.cost.total` from ALL messages + `auxiliaryCosts`?
- Do warning banners appear at correct thresholds ($1 yellow, $5 orange, $10 red)?
- Is banner dismissible per-session (not persisted)?
- Does 'Expensive message' badge appear on messages > $0.50?
- Does `estimateAlternativeCost()` reuse `computeIterationCost()` — no duplicate pricing logic?
- Does model recommendation only show when savings > 30%?
- Does recommendation never recommend the current model?
- Are all thresholds defined as named constants (no magic numbers)?
- Does all UI text use English?
- Run `npm run test:run`, `npm run lint`, `npm run typecheck` to confirm green."

Fix all review findings before moving to Wave 7.

---

## Wave 7: Final System Review

**Goal:** Two rounds of comprehensive review covering the complete system (Waves 0-6).

### Tasks

- [ ] **Rev R3** — Full System Architecture Review
- [ ] **Rev R4** — Production Readiness (Full System)

#### Rev R3: Full System Architecture Review

**Depends on:** all tasks H, I, J complete

Spawn a review agent:

**Prompt:** "Full system architecture review of token-transparency (all waves). Read `docs/features/chat/token-transparency.md` for full specs. Check all R1 items PLUS:

1. All R1 checks still pass (NormalizedTokenUsage, computeIterationCost, etc.)
2. `TokenBreakdown` uses `scaleBreakdown()` — no manual token math in component
3. `CostAlertBanner` reads from hook, no business logic in component
4. `useCostAlerts()` is a pure computation hook (no side effects)
5. `estimateAlternativeCost()` reuses `computeIterationCost()` — no duplicate pricing logic
6. CLI audit script handles missing `normalizedUsage` gracefully (old messages)
7. Alert thresholds are constants, not magic numbers scattered in code
8. All 7 token consumption points tracked and visible in UI"

**If issues found:** fix -> re-run lint + tests -> re-check.

---

#### Rev R4: Production Readiness (Full System)

**Depends on:** R3 passes

Spawn a review agent:

**Prompt:** "Final production readiness review of token-transparency (complete system). Check all R2 items PLUS:

1. All R2 checks still pass
2. `TokenBreakdown` accessible: keyboard navigation, screen reader labels
3. Alert banner doesn't block user interaction (dismissible, not modal)
4. CLI audit script: error messages are helpful (missing key, invalid path)
5. No performance regression: breakdown panel lazy-loaded or behind toggle
6. Model recommendation doesn't recommend current model
7. All new components use CSS variables (theme-compatible)
8. Test count: meaningful coverage for all new components/hooks
9. `npm run test:run` passes for both projects
10. `npm run check:docs` passes (doc links valid)
11. Token consumption map: all 7 points marked as tracked + visible"

---

### Final Verification

```bash
npm run test:run                              # frontend
npx vitest run --project functions            # backend
npm run lint                                  # lint
npm run typecheck                             # types
cd functions && npm run build                 # compile
npm run check:docs                            # docs
```

**MANDATORY: Update this file after both reviews pass (wave is NOT done until all boxes checked):**
- [ ] Mark Rev R3, Rev R4 tasks above as done
- [ ] Update Wave Status table: Wave 7 → DONE
- [ ] Update "Current Test Count" table row for Wave 7 (final totals)
- [ ] Update "Current Wave" pointer at top of file: `## Current Wave: COMPLETE`
- [ ] Update `docs/features/chat/token-transparency.md`:
  - Update "Current state" section — system fully implemented
  - Update Token Consumption Map — all points tracked
- [ ] Update related docs:
  - `docs/features/chat/multi-provider.md` — normalizedUsage integration
  - `docs/features/chat/context-token-optimization.md` — updated optimization strategy
  - `docs/features/chat/prompt-caching.md` — cache pricing in new cost model
- [ ] Review task doc for patterns that worked -> promote to CLAUDE.md (Pattern Promotion Rule)
