# Token Transparency — полная прозрачность стоимости AI чата

## Текущее состояние

Система полностью реализована (Waves 0–7 complete). Все 7 проблем исправлены: контекст показывает реальное значение последней итерации (не накопленное), thinking-токены отделены, auxiliary costs (summary/title) трекаются, stopped messages сохраняют billing data, добавлен layer breakdown panel, CLI audit tool, cost alerts с рекомендациями модели, buildMemory использует правильную модель для budget. Все стоимости в USD (legacy EUR полностью мигрирован).

---

## Task Document

Execution plan, wave checklist, agent assignments: `docs/features/chat/token-transparency-tasks.md`

---

## Business Goal

User sees exactly how much each AI conversation costs, where tokens go, and gets proactive warnings before costs accumulate. Three layers:

1. **Accuracy** — fix broken tracking (accumulated context, missing billing for stopped/title/summary)
2. **Transparency** — per-message tooltip with thinking/iterations/USD, context breakdown by component
3. **Actionability** — cost alerts, model recommendations, CLI audit vs provider billing

---

## Token Consumption Map

| # | What | Tracked? | Visible? | Fixed by |
|---|------|----------|----------|----------|
| 1 | Main Chat (Claude) | YES | YES | Task C ✅ |
| 2 | Main Chat (Gemini) | YES | YES | Task C ✅ |
| 3 | L3 Summary | YES | YES (auxiliary) | Task E ✅ |
| 4 | L4 Memorize | YES | YES | — |
| 5 | Title Generation | YES | YES (auxiliary) | Task E ✅ |
| 6 | Thumbnail Upload | NO | NO | Future |
| 7 | Stopped Messages | YES | YES (partial) | Task D ✅ |

---

## Technical Specification

### Data Model

#### NormalizedTokenUsage (provider-agnostic)

Two questions — two structures:
- "How full is my context window?" -> `contextWindow` (last iteration snapshot)
- "How much did it cost?" -> `billing` (accumulated aggregate)

```typescript
export interface NormalizedTokenUsage {
  contextWindow: {
    inputTokens: number;     // last iteration input
    outputTokens: number;    // last iteration output
    thinkingTokens: number;  // last iteration thinking (subset of output)
    limit: number;           // model context limit (e.g. 200K, 1M)
    percent: number;         // inputTokens / limit * 100, FLOAT, NOT rounded
  };

  billing: {
    input: { total: number; fresh: number; cached: number; cacheWrite: number };
    output: { total: number; thinking: number };
    iterations: number;
    cost: {
      input: number;         // USD
      cached: number;        // USD
      cacheWrite: number;    // USD
      output: number;        // USD (includes thinking)
      total: number;         // USD
      withoutCache: number;  // hypothetical USD
      thinkingSubset: number; // subset of output, NOT additive, USD
    };
  };

  iterationDetails?: IterationSnapshot[];  // present when iterations > 1
  provider: 'anthropic' | 'google';
  model: string;
  partial?: boolean;  // true = stopped message
}
```

#### IterationSnapshot + IterationCost

```typescript
interface IterationSnapshot {
  input: { total: number; fresh: number; cached: number; cacheWrite: number };
  output: { total: number; thinking: number };
  cost: IterationCost;  // computed at creation time
}

interface IterationCost {
  input: number; cached: number; cacheWrite: number; output: number;
  total: number; withoutCache: number; thinkingSubset: number;
  // All values in USD
}
```

#### ContextBreakdown

Text components in **chars** (scaled by frontend). Images in **tokens** (not scaled).

```typescript
export interface ContextBreakdown {
  systemPrompt: number;      // chars (total system prompt)
  toolDefinitions: number;   // chars
  history: number;           // chars (includes Layer 2 appContext labels)
  memory: number;            // chars
  currentMessage: number;    // chars
  toolResults: number;       // chars
  imageTokens: number;       // estimated TOKENS (not chars!)
  imageCount: number;
  historyMessageCount: number;
  usedSummary: boolean;
  triggeredAuxiliary?: string[];
  /** System prompt layer breakdown — when present, UI splits "System prompt" into sub-layers. */
  systemLayers?: {
    settings: number;          // Settings layer chars
    persistentContext: number; // Layer 1: attached videos/traffic/canvas chars
    crossMemory: number;       // Layer 4: cross-conversation memory chars
  };
}
```

**System prompt layers:** Frontend measures each layer in `buildSystemPrompt()` and sends `systemLayers` alongside the prompt string. Backend passes through to `ContextBreakdown`. UI shows "Settings", "Attached context", "Memories" as separate bars when `systemLayers` is present; falls back to single "System prompt" bar for old messages.

**History accuracy:** `historyChars` includes Layer 2 per-message appContext labels (`formatContextLabel()` output + `\n\n` separator). Current user message excluded from history (it arrives separately as `body.text`).

#### AuxiliaryCost

```typescript
export interface AuxiliaryCost {
  id: string;
  type: 'summary' | 'title' | 'memorize' | 'thumbnail_upload';
  model: string;
  costUsd: number;
  tokens?: { input: number; output: number };
  triggeredByMessageId?: string;
  createdAt: unknown;  // Date.now() (number) — unknown avoids importing Firestore types into shared/
}
```

#### Firestore Schema

**Conversation:** `auxiliaryCosts: AuxiliaryCost[]` (TODO(scaling): migrate to subcollection if array exceeds 50 items — currently array is fine for expected load of ~20 summaries per long conversation)

**Message:** `normalizedUsage: NormalizedTokenUsage` + `contextBreakdown: ContextBreakdown` + `status?: 'complete' | 'stopped' | 'deleted' | 'error'` + legacy `tokenUsage` (kept)

---

### Cost Calculation

**All costs in USD.** `estimateCostUsd()` returns raw USD. New: `computeIterationCost()`.

**Architecture: cost per-iteration, NOT per-aggregate.** Long context pricing applied per-request by provider. Per-iteration check uses `snapshot.input.total` (ground truth from API).

```typescript
function computeIterationCost(pricing: ModelPricing, snapshot: IterationSnapshot): IterationCost {
  const isLong = snapshot.input.total > LONG_CONTEXT_THRESHOLD;
  const inputRate = (isLong && pricing.inputPerMillionLong != null)
    ? pricing.inputPerMillionLong : pricing.inputPerMillion;
  const outputRate = (isLong && pricing.outputPerMillionLong != null)
    ? pricing.outputPerMillionLong : pricing.outputPerMillion;
  const cacheReadRate = inputRate * (pricing.cacheReadMultiplier ?? 1);
  const cacheWriteRate = inputRate * (pricing.cacheWriteMultiplier ?? 1);
  // ... compute and return IterationCost
}
```

`aggregateIterations()` only sums per-iteration costs — does NOT know about `ModelPricing`.

**`historyBudgetRatio`** — per-model field in `ModelConfig` (`shared/models.ts`). Claude = 0.75 (budget 150K), Gemini = 0.85 (budget 850K). Legacy `HISTORY_BUDGET_RATIO = 0.6` kept as fallback for unknown models. Used by both backend (`buildMemory` budget calculation) and frontend (progress bar: % until auto-summarization).

---

### Normalization Logic

#### Per provider

**Claude:**
```typescript
function normalizeClaudeIteration(usage: ClaudeUsage, thinkingTokens: number, pricing: ModelPricing): IterationSnapshot {
  // input.total = input_tokens + cache_read + cache_write
  // input.fresh = input_tokens (NOTE: Claude's input_tokens excludes cached!)
  // output.total = output_tokens (includes thinking)
  // output.thinking = thinkingTokens (from streaming chars / 4, approximate)
}
```

**Gemini:**
```typescript
function normalizeGeminiIteration(usage: GeminiUsage, thinkingTokens: number, pricing: ModelPricing): IterationSnapshot {
  // input.total = promptTokenCount (already includes cached)
  // input.fresh = promptTokenCount - cachedContentTokenCount
  // output.total = candidatesTokenCount + thoughtsTokenCount (separate fields!)
  // output.thinking = thoughtsTokenCount (exact from API)
}
```

#### Provider field mapping (gotchas)

| Field | Claude API | Gemini API | Trap |
|-------|-----------|-----------|------|
| Fresh input | `input_tokens` | `promptTokenCount - cachedContentTokenCount` | Gemini includes cached in promptTokenCount! |
| Cached | `cache_read_input_tokens` | `cachedContentTokenCount` | Subset of promptTokenCount for Gemini |
| Cache write | `cache_creation_input_tokens` | *(none)* | Claude only |
| Output | `output_tokens` (includes thinking) | `candidatesTokenCount` (excludes thinking) | Different! |
| Total input | `input + cache_read + cache_write` | `promptTokenCount` | Different formulas! |

---

### Thinking Tokens

| | Gemini | Claude |
|---|---|---|
| Source | `usageMetadata.thoughtsTokenCount` | Count `thinking_delta` streaming chars |
| Accuracy | **Exact** | **Approximate** (~+/-15%) |
| Relationship | `output = candidates + thoughts` (separate) | `output_tokens` includes thinking (bundled) |
| Code | Read field (one line) | Count chars in callback, divide by 4 |

---

### Image Token Estimation

**Measured via `countTokens` API** (`scripts/measure-image-tokens.mjs`, 2026-03-06):

| Model | Tokens/image | Resolution-dependent? |
|-------|-------------|----------------------|
| Gemini 2.5 Pro/Flash | **258** | No |
| Gemini 3.x | **~1090** | No |
| Claude | **170-6,800** | Yes (tile formula) |

**Claude formula:** `ceil(w/364) * ceil(h/364) * 170` (after resize to fit 1568px / 1.15M pixels)

**YouTube thumbnails:** hardcoded 1280x720 -> Claude: 1,360 tokens, Gemini 2.5: 258 tokens

**Dimensions sources:** User attachments -> `new Image()` on frontend. YouTube thumbnails -> hardcoded 1280x720.

**`MODEL_REGISTRY` additions:** `imageTokensPerImage: 258` (2.5), `imageTokensPerImage: 1090` (3.x), absent for Claude (uses formula).

---

### Stopped Messages

#### Extraction patterns

**Claude:** Usage only arrives in `finalMessage` (not fired on abort). Fix: add `stream.on("message", ...)` handler — fires **before content generation starts**, contains full usage including `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`. This means input + cache billing is always available, even on immediate abort. On abort: **input = exact** (from API's `message` event, including cache), **output = approximate** (chars received so far / 4, ~+/-15% accuracy).

**Gemini:** `usageMetadata` updates on every chunk. On abort: `tokenUsage` from last chunk — already works. Just catch `AbortError` and return with `partial: true`.

**Common pattern:**
```typescript
if (isAbortError(err) && lastPartialUsage) {
    return { text: fullText, tokenUsage: lastPartialUsage, toolCalls: [], partial: true };
}
```

#### Message status (immutable after write)

| Status | Set by | Mutated? | UI visibility |
|--------|--------|----------|---------------|
| `undefined` | legacy | — | Always visible |
| `'complete'` | Backend on success | No | Always visible |
| `'stopped'` | Backend on abort | No | Visible while last model message |
| `'deleted'` | Frontend delete button | No | Never visible |
| `'error'` | Backend on error | No | Never visible |

#### Visibility rule (pure render function)

```typescript
function shouldShowMessage(msg, allMessages): boolean {
  if (!msg.status || msg.status === 'complete') return true;
  if (msg.status === 'deleted' || msg.status === 'error') return false;
  if (msg.status === 'stopped') {
    return !allMessages.some(m =>
      m.createdAt > msg.createdAt && m.role === 'model'
      && (!m.status || m.status === 'complete')
    );
  }
  return true;
}
```

#### History filter

Only `complete` and `undefined` (legacy) messages sent to AI. Stopped/deleted/error excluded.

---

### Context Breakdown Scaling

Backend collects raw char sizes (text) + estimated token counts (images). Frontend scales text proportionally to fit `actualTotal - imageTokens`.

```typescript
function scaleBreakdown(raw: ContextBreakdown, actualTotal: number): ScaledBreakdown {
  const textCharsSum = raw.systemPrompt + raw.toolDefinitions + raw.history
    + raw.memory + raw.currentMessage + raw.toolResults;
  const imageShare = Math.min(raw.imageTokens, actualTotal);
  const textBudget = actualTotal - imageShare;
  const textScale = textCharsSum > 0 ? textBudget / textCharsSum : 0;

  // Scale each text component proportionally
  const scaled = {
    systemPrompt: Math.round(raw.systemPrompt * textScale),
    toolDefinitions: Math.round(raw.toolDefinitions * textScale),
    history: Math.round(raw.history * textScale),
    memory: Math.round(raw.memory * textScale),
    currentMessage: Math.round(raw.currentMessage * textScale),
    toolResults: Math.round(raw.toolResults * textScale),
    images: imageShare,
  };

  // Fix rounding remainder: adjust largest text component so sum === actualTotal
  const scaledTextSum = scaled.systemPrompt + scaled.toolDefinitions + scaled.history
    + scaled.memory + scaled.currentMessage + scaled.toolResults;
  const remainder = textBudget - scaledTextSum;
  if (remainder !== 0) {
    // Find largest text component and absorb the remainder
    const textKeys = ['systemPrompt', 'toolDefinitions', 'history',
      'memory', 'currentMessage', 'toolResults'] as const;
    const largest = textKeys.reduce((a, b) => scaled[a] >= scaled[b] ? a : b);
    scaled[largest] += remainder;
  }

  return scaled;
  // Guarantee: sum of all values === actualTotal
}
```

---

### Display Levels

```
minimal:   $0.08
standard:  $0.08 ↓83%     + tooltip: input/output/cache
detailed:  $0.08 ↓83%     + tooltip: thinking, iterations; + breakdown panel
debug:     $0.08 ↓83%     + per-iteration table + raw provider data
```

#### Level resolution

Two concerns: **user preference** (what they want) × **access control** (what tier allows).

```typescript
// src/features/Chat/utils/tokenDisplay.ts
const LEVEL_RANK: Record<TokenDisplayLevel, number> = {
  minimal: 0, standard: 1, detailed: 2, debug: 3,
};

export function getEffectiveDisplayLevel(
  preference: TokenDisplayLevel,
  maxAllowed: TokenDisplayLevel,
): TokenDisplayLevel {
  return LEVEL_RANK[preference] <= LEVEL_RANK[maxAllowed] ? preference : maxAllowed;
}
```

**Firestore:** `users/{uid}/settings.tokenDisplayPreference: 'minimal' | 'standard' | 'detailed' | 'debug'`

**Subscription tier → max level (future):**

| Tier | Max level |
|------|-----------|
| free | `standard` |
| pro | `detailed` |
| admin | `debug` |

Current: solo user, hardcoded `preference = 'debug'`, `maxAllowed = 'debug'`.

---

### Token Breakdown Panel

Expandable panel triggered by clicking the header stats. Shows context composition as stacked horizontal bars (Tailwind CSS only, no chart library).

**Context section:** Each bar = one `ContextBreakdown` component, scaled proportionally via `scaleBreakdown()`. Text components (chars) are scaled to fit `actualTotal - imageTokens`. Rounding remainder absorbed by largest component — guarantees sum = actualTotal. When `systemLayers` is present, "System prompt" is split into three sub-bars (Settings, Attached context, Memories) using the same proportional scaling within the system prompt's token share.

**Billing section:** Per-message cost from `normalizedUsage.billing.cost`, cache savings when `withoutCache - total > 0.0001`. Shows "Summarized history" indicator when `contextBreakdown.usedSummary` is true. Shows thinking tokens + cost when `thinkingTokens > 0`.

**Files:**
- `src/features/Chat/components/TokenBreakdown.tsx` — panel component
- `src/features/Chat/utils/tokenDisplay.ts` — `scaleBreakdown()`, `getEffectiveDisplayLevel()`, `fmtTokens()`
- `src/features/Chat/ChatPanel.tsx` — toggle state, passes data

---

### Cost Alerts

Proactive cost management — warnings before a conversation becomes expensive, model recommendations to optimize cost/quality.

**Thresholds (named constants in `useCostAlerts.ts`):**

| Total | Level | Style |
|-------|-------|-------|
| > $1 | warning | Yellow banner |
| > $5 | high | Orange banner |
| > $10 | critical | Red banner |
| Single message > $0.50 | expensive | Red `$` badge on message |

**Model recommendations:** `estimateAlternativeCost()` re-prices all message iterations with each alternative model's pricing via `computeIterationCost()` (no duplicate pricing logic). Recommendation shown only when savings > 30% (`RECOMMENDATION_SAVINGS_MIN`).

**Banner:** Dismissible per-session (React state, not persisted). Appears below header, above messages.

**Files:**
- `src/features/Chat/hooks/useCostAlerts.ts` — `useCostAlerts()` hook + `estimateAlternativeCost()`
- `src/features/Chat/components/CostAlertBanner.tsx` — banner component

---

### Infrastructure

#### Secrets (Google Secret Manager)

| Secret | Purpose |
|--------|---------|
| `GEMINI_API_KEY` | Gemini API (main provider + summarization) |
| `ANTHROPIC_API_KEY` | Claude API (chat) |
| `ANTHROPIC_ADMIN_KEY` | Anthropic Admin API (billing audit, Task I) |

#### Measurement scripts

- `scripts/measure-image-tokens.mjs` — Gemini image token measurement via `countTokens` API
- `scripts/audit-tokens.mjs` — Firestore conversation token audit
- `scripts/dump-conversation.mjs` — Full conversation dump

#### Cache breakpoints (don't touch)

3 breakpoints already optimal: BP1 system prompt, BP2 last tool definition, BP3 second-to-last message. Cache hit rate = 83%.

---

## Appendix A: Найденные проблемы

1. "Context used" shows billing total, not window size (accumulates across agentic iterations)
2. Thinking tokens not separated (Claude bundles in output_tokens)
3. Hidden costs: summary/title not shown in UI
4. No layer breakdown (system/tools/history/images/memory)
5. Stopped messages: billing lost on abort
6. Title generation not tracked
7. No audit trail vs provider billing
8. buildMemory uses wrong model for budget (Claude summarization never triggers)

## Appendix B: Resolved Questions

1. **Billing discrepancy:** $0.22 vs ~$0.80 = stopped messages (not tracked)
2. **Admin API key:** created, stored in `ANTHROPIC_ADMIN_KEY`
3. **EUR -> USD migration:** DONE. `estimateCostEur` → `estimateCostUsd`, `USD_TO_EUR` deleted. All UI shows `$`.
4. **Long context cost:** per-iteration check (not aggregate)
5. **Image tokens (Gemini):** 258 (2.5), ~1090 (3.x), fixed per image, measured
6. **Stopped message visibility:** pure render logic, no status mutations

## Appendix C: Open Questions

1. **Claude thinking token discrepancy:** API may return thinking summary, billing counts full thinking. Verify via Admin API. Mitigation: count `thinking_delta` chars.
2. **Gemini 3.1 Pro image tokens:** not tested (preview). Expected ~1090.

## Related Features

- [Context & Token Optimization](./context-token-optimization.md)
- [Prompt Caching](./prompt-caching.md)
- [Agentic Architecture](./agentic-architecture.md)
- [Multi-Provider](./multi-provider.md)
