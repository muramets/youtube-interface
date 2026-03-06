// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

export interface ModelPricing {
    /** USD per 1M tokens for prompts ≤ 200K tokens */
    inputPerMillion: number;
    outputPerMillion: number;
    /** USD per 1M tokens for prompts > 200K tokens (Pro models only) */
    inputPerMillionLong?: number;
    outputPerMillionLong?: number;
    /** Cache read cost as fraction of input price (e.g. 0.1 = 10% of input price) */
    cacheReadMultiplier?: number;
    /** Cache write cost as fraction of input price (e.g. 2.0 = 200% of input price for 1h TTL) */
    cacheWriteMultiplier?: number;
}

/** Token usage statistics from an AI API call. */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** Tokens served from the provider's context cache (if applicable). */
    cachedTokens?: number;
    /** Tokens used to create a new cache entry (if applicable). */
    cacheWriteTokens?: number;
}

export interface ThinkingOption {
    /** Unique identifier for this thinking level (e.g. 'low', 'medium', 'high') */
    id: string;
    /** Display label in the UI */
    label: string;
    /** Value passed to the Gemini API (thinkingLevel string or thinkingBudget number) */
    value: string | number;
}

export interface AttachmentSupport {
    image: boolean;
    pdf: boolean;
    audio: boolean;
    video: boolean;
    text: boolean;
}

export interface ModelConfig {
    id: string;
    label: string;
    provider: 'gemini' | 'anthropic';
    contextLimit: number;
    isDefault?: boolean;
    pricing: ModelPricing;
    /** Available thinking depth options for this model */
    thinkingOptions: ThinkingOption[];
    /** Default thinking option id */
    thinkingDefault: string;
    /** Thinking API parameter style: 'level' (enum string), 'budget' (token count), or 'adaptive' (effort level) */
    thinkingMode: 'level' | 'budget' | 'adaptive';
    /** Which attachment types this model supports natively */
    attachmentSupport: AttachmentSupport;
    /** Fixed tokens per image for this model (Gemini only; Claude uses tile formula) */
    imageTokensPerImage?: number;
}

export const LONG_CONTEXT_THRESHOLD = 200_000;

/**
 * Estimate cost in USD for a single API call.
 * Accounts for cache pricing when cache token counts are provided.
 * Backward-compatible: without cache params, works as before.
 */
export function estimateCostUsd(
    pricing: ModelPricing,
    promptTokens: number,
    completionTokens: number,
    cachedTokens?: number,
    cacheWriteTokens?: number,
): number {
    const totalInput = promptTokens + (cachedTokens ?? 0) + (cacheWriteTokens ?? 0);
    const isLong = totalInput > LONG_CONTEXT_THRESHOLD;
    const inputRate = (isLong && pricing.inputPerMillionLong != null)
        ? pricing.inputPerMillionLong : pricing.inputPerMillion;
    const outputRate = (isLong && pricing.outputPerMillionLong != null)
        ? pricing.outputPerMillionLong : pricing.outputPerMillion;

    const cacheReadRate = inputRate * (pricing.cacheReadMultiplier ?? 1);
    const cacheWriteRate = inputRate * (pricing.cacheWriteMultiplier ?? 1);

    const costUsd = (promptTokens / 1_000_000) * inputRate
        + ((cachedTokens ?? 0) / 1_000_000) * cacheReadRate
        + ((cacheWriteTokens ?? 0) / 1_000_000) * cacheWriteRate
        + (completionTokens / 1_000_000) * outputRate;
    return costUsd;
}

/**
 * Estimate how much USD was saved by caching for a single API call.
 * Returns 0 when no cache data is present or savings are negative.
 */
export function estimateCacheSavingsUsd(
    pricing: ModelPricing,
    promptTokens: number,
    completionTokens: number,
    cachedTokens?: number,
    cacheWriteTokens?: number,
): number {
    if (!cachedTokens && !cacheWriteTokens) return 0;
    // Hypothetical: all input tokens at full price
    const hypothetical = estimateCostUsd(
        pricing,
        promptTokens + (cachedTokens ?? 0) + (cacheWriteTokens ?? 0),
        completionTokens,
    );
    // Actual: with cache pricing
    const actual = estimateCostUsd(pricing, promptTokens, completionTokens, cachedTokens, cacheWriteTokens);
    return Math.max(0, hypothetical - actual);
}

/** Map deprecated model IDs → their replacement. */
export const DEPRECATED_MODEL_MAP: Record<string, string> = {
    'gemini-3-pro-preview': 'gemini-3.1-pro-preview',
};

/**
 * Resolve a model ID, mapping deprecated IDs to their current replacement.
 */
export function resolveModelId(modelId: string, registry: ModelConfig[]): string {
    const direct = registry.find(m => m.id === modelId);
    if (direct) return modelId;
    return DEPRECATED_MODEL_MAP[modelId] ?? modelId;
}

const GEMINI_ATTACHMENT_SUPPORT: AttachmentSupport = {
    image: true, pdf: true, audio: true, video: true, text: true,
};

const CLAUDE_ATTACHMENT_SUPPORT: AttachmentSupport = {
    image: true, pdf: true, audio: false, video: false, text: false,
};

/**
 * Build an `accept` attribute string from attachment support flags.
 * E.g. `"image/*,application/pdf"` for Claude models.
 */
export function getAcceptedMimeTypes(support: AttachmentSupport): string {
    const types: string[] = [];
    if (support.image) types.push('image/*');
    if (support.pdf) types.push('application/pdf');
    if (support.audio) types.push('audio/*');
    if (support.video) types.push('video/*');
    if (support.text) types.push('text/*');
    return types.join(',');
}

export const MODEL_REGISTRY: ModelConfig[] = [
    {
        id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', provider: 'gemini', contextLimit: 1_000_000,
        pricing: { inputPerMillion: 2.00, outputPerMillion: 12.00, inputPerMillionLong: 4.00, outputPerMillionLong: 18.00 },
        thinkingOptions: [
            { id: 'low', label: 'Low', value: 'low' },
            { id: 'medium', label: 'Medium', value: 'medium' },
            { id: 'high', label: 'High', value: 'high' },
        ],
        thinkingDefault: 'high',
        thinkingMode: 'level',
        attachmentSupport: GEMINI_ATTACHMENT_SUPPORT,
        imageTokensPerImage: 1090,
    },
    {
        id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', provider: 'gemini', contextLimit: 1_000_000,
        pricing: { inputPerMillion: 0.50, outputPerMillion: 3.00 },
        thinkingOptions: [
            { id: 'minimal', label: 'Minimal', value: 'minimal' },
            { id: 'low', label: 'Low', value: 'low' },
            { id: 'medium', label: 'Medium', value: 'medium' },
            { id: 'high', label: 'High', value: 'high' },
        ],
        thinkingDefault: 'low',
        thinkingMode: 'level',
        attachmentSupport: GEMINI_ATTACHMENT_SUPPORT,
        imageTokensPerImage: 1090,
    },
    {
        id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini', contextLimit: 1_000_000, isDefault: true,
        pricing: { inputPerMillion: 1.25, outputPerMillion: 10.00, inputPerMillionLong: 2.50, outputPerMillionLong: 15.00 },
        thinkingOptions: [
            { id: 'auto', label: 'Auto', value: -1 },
            { id: 'low', label: 'Low', value: 1024 },
            { id: 'medium', label: 'Medium', value: 8192 },
            { id: 'high', label: 'High', value: 24576 },
        ],
        thinkingDefault: 'auto',
        thinkingMode: 'budget',
        attachmentSupport: GEMINI_ATTACHMENT_SUPPORT,
        imageTokensPerImage: 258,
    },
    {
        id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini', contextLimit: 1_000_000,
        pricing: { inputPerMillion: 0.30, outputPerMillion: 2.50 },
        thinkingOptions: [
            { id: 'off', label: 'Off', value: 0 },
            { id: 'auto', label: 'Auto', value: -1 },
            { id: 'low', label: 'Low', value: 1024 },
            { id: 'medium', label: 'Medium', value: 8192 },
            { id: 'high', label: 'High', value: 24576 },
        ],
        thinkingDefault: 'auto',
        thinkingMode: 'budget',
        attachmentSupport: GEMINI_ATTACHMENT_SUPPORT,
        imageTokensPerImage: 258,
    },
    {
        id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic', contextLimit: 200_000,
        pricing: { inputPerMillion: 5.00, outputPerMillion: 25.00, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 2.0 },
        thinkingOptions: [
            { id: 'off', label: 'Off', value: 'off' },
            { id: 'low', label: 'Low', value: 'low' },
            { id: 'medium', label: 'Medium', value: 'medium' },
            { id: 'high', label: 'High', value: 'high' },
            { id: 'max', label: 'Max', value: 'max' },
        ],
        thinkingDefault: 'high',
        thinkingMode: 'adaptive',
        attachmentSupport: CLAUDE_ATTACHMENT_SUPPORT,
    },
    {
        id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic', contextLimit: 200_000,
        pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 2.0 },
        thinkingOptions: [
            { id: 'off', label: 'Off', value: 'off' },
            { id: 'low', label: 'Low', value: 'low' },
            { id: 'medium', label: 'Medium', value: 'medium' },
            { id: 'high', label: 'High', value: 'high' },
            { id: 'max', label: 'Max', value: 'max' },
        ],
        thinkingDefault: 'high',
        thinkingMode: 'adaptive',
        attachmentSupport: CLAUDE_ATTACHMENT_SUPPORT,
    },
    {
        id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic', contextLimit: 200_000,
        pricing: { inputPerMillion: 1.00, outputPerMillion: 5.00, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 2.0 },
        thinkingOptions: [
            { id: 'off', label: 'Off', value: 0 },
        ],
        thinkingDefault: 'off',
        thinkingMode: 'budget',
        attachmentSupport: CLAUDE_ATTACHMENT_SUPPORT,
    },
];

// ---------------------------------------------------------------------------
// Token Transparency — data model + cost calculation
// ---------------------------------------------------------------------------

/** History gets at most 60% of model context; rest reserved for response + system prompt. */
export const HISTORY_BUDGET_RATIO = 0.6;

/** Provider identifier as stored in normalized usage (Gemini maps to 'google'). */
export type NormalizedProvider = 'anthropic' | 'google';

/** Per-iteration token counts (input/output breakdown). */
export interface IterationSnapshot {
    input: { total: number; fresh: number; cached: number; cacheWrite: number };
    output: { total: number; thinking: number };
    cost: IterationCost;
}

/** Per-iteration USD cost breakdown. */
export interface IterationCost {
    input: number;
    cached: number;
    cacheWrite: number;
    output: number;
    total: number;
    /** Hypothetical cost if all input tokens were at full price (no cache). */
    withoutCache: number;
    /** Subset of output cost attributable to thinking tokens (NOT additive). */
    thinkingSubset: number;
}

/** Provider-agnostic normalized token usage for a message. */
export interface NormalizedTokenUsage {
    contextWindow: {
        inputTokens: number;
        outputTokens: number;
        thinkingTokens: number;
        limit: number;
        /** inputTokens / limit * 100 — FLOAT, NOT rounded. */
        percent: number;
    };
    billing: {
        input: { total: number; fresh: number; cached: number; cacheWrite: number };
        output: { total: number; thinking: number };
        iterations: number;
        cost: {
            input: number;
            cached: number;
            cacheWrite: number;
            output: number;
            total: number;
            withoutCache: number;
            thinkingSubset: number;
        };
    };
    iterationDetails?: IterationSnapshot[];
    provider: NormalizedProvider;
    model: string;
    partial?: boolean;
}

/** Raw char sizes of context components (text in chars, images in tokens). */
export interface ContextBreakdown {
    systemPrompt: number;
    toolDefinitions: number;
    history: number;
    memory: number;
    currentMessage: number;
    toolResults: number;
    /** Estimated image tokens (not chars). */
    imageTokens: number;
    imageCount: number;
    historyMessageCount: number;
    usedSummary: boolean;
    triggeredAuxiliary?: string[];
}

/** Auxiliary cost entry (summary, title, memorize). */
export interface AuxiliaryCost {
    id: string;
    type: 'summary' | 'title' | 'memorize' | 'thumbnail_upload';
    model: string;
    costUsd: number;
    tokens?: { input: number; output: number };
    triggeredByMessageId?: string;
    createdAt?: unknown;
}

/**
 * Compute USD cost for a single API iteration.
 * This is the ONLY place that knows about ModelPricing — aggregateIterations only sums.
 */
export function computeIterationCost(
    pricing: ModelPricing,
    tokens: Pick<IterationSnapshot, 'input' | 'output'>,
): IterationCost {
    const isLong = tokens.input.total > LONG_CONTEXT_THRESHOLD;
    const inputRate = (isLong && pricing.inputPerMillionLong != null)
        ? pricing.inputPerMillionLong : pricing.inputPerMillion;
    const outputRate = (isLong && pricing.outputPerMillionLong != null)
        ? pricing.outputPerMillionLong : pricing.outputPerMillion;
    const cacheReadRate = inputRate * (pricing.cacheReadMultiplier ?? 1);
    const cacheWriteRate = inputRate * (pricing.cacheWriteMultiplier ?? 1);

    const input = (tokens.input.fresh / 1_000_000) * inputRate;
    const cached = (tokens.input.cached / 1_000_000) * cacheReadRate;
    const cacheWrite = (tokens.input.cacheWrite / 1_000_000) * cacheWriteRate;
    const output = (tokens.output.total / 1_000_000) * outputRate;
    const total = input + cached + cacheWrite + output;

    const withoutCache = (tokens.input.total / 1_000_000) * inputRate + output;
    const thinkingSubset = tokens.output.thinking > 0
        ? (tokens.output.thinking / 1_000_000) * outputRate
        : 0;

    return { input, cached, cacheWrite, output, total, withoutCache, thinkingSubset };
}

/**
 * Aggregate multiple iteration snapshots into NormalizedTokenUsage.
 * Only sums — no pricing logic here.
 */
export function aggregateIterations(
    snapshots: IterationSnapshot[],
    model: Pick<ModelConfig, 'id' | 'provider' | 'contextLimit'>,
): NormalizedTokenUsage {
    if (snapshots.length === 0) {
        return {
            contextWindow: {
                inputTokens: 0,
                outputTokens: 0,
                thinkingTokens: 0,
                limit: model.contextLimit,
                percent: 0,
            },
            billing: {
                input: { total: 0, fresh: 0, cached: 0, cacheWrite: 0 },
                output: { total: 0, thinking: 0 },
                iterations: 0,
                cost: { input: 0, cached: 0, cacheWrite: 0, output: 0, total: 0, withoutCache: 0, thinkingSubset: 0 },
            },
            provider: model.provider === 'gemini' ? 'google' : 'anthropic',
            model: model.id,
        };
    }

    const billing = {
        input: { total: 0, fresh: 0, cached: 0, cacheWrite: 0 },
        output: { total: 0, thinking: 0 },
        iterations: snapshots.length,
        cost: { input: 0, cached: 0, cacheWrite: 0, output: 0, total: 0, withoutCache: 0, thinkingSubset: 0 },
    };

    for (const s of snapshots) {
        billing.input.total += s.input.total;
        billing.input.fresh += s.input.fresh;
        billing.input.cached += s.input.cached;
        billing.input.cacheWrite += s.input.cacheWrite;
        billing.output.total += s.output.total;
        billing.output.thinking += s.output.thinking;
        billing.cost.input += s.cost.input;
        billing.cost.cached += s.cost.cached;
        billing.cost.cacheWrite += s.cost.cacheWrite;
        billing.cost.output += s.cost.output;
        billing.cost.total += s.cost.total;
        billing.cost.withoutCache += s.cost.withoutCache;
        billing.cost.thinkingSubset += s.cost.thinkingSubset;
    }

    const last = snapshots[snapshots.length - 1];

    return {
        contextWindow: {
            inputTokens: last.input.total,
            outputTokens: last.output.total,
            thinkingTokens: last.output.thinking,
            limit: model.contextLimit,
            percent: (last.input.total / model.contextLimit) * 100,
        },
        billing,
        iterationDetails: snapshots.length > 1 ? snapshots : undefined,
        provider: model.provider === 'gemini' ? 'google' : 'anthropic',
        model: model.id,
    };
}
