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
}

// Fixed EUR/USD rate — approximate, updated manually as needed
export const USD_TO_EUR = 0.92;

const LONG_CONTEXT_THRESHOLD = 200_000;

/**
 * Estimate cost in EUR for a single API call.
 * Accounts for cache pricing when cache token counts are provided.
 * Backward-compatible: without cache params, works as before.
 */
export function estimateCostEur(
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
    return costUsd * USD_TO_EUR;
}

/**
 * Estimate how much EUR was saved by caching for a single API call.
 * Returns 0 when no cache data is present or savings are negative.
 */
export function estimateCacheSavingsEur(
    pricing: ModelPricing,
    promptTokens: number,
    completionTokens: number,
    cachedTokens?: number,
    cacheWriteTokens?: number,
): number {
    if (!cachedTokens && !cacheWriteTokens) return 0;
    // Hypothetical: all input tokens at full price
    const hypothetical = estimateCostEur(
        pricing,
        promptTokens + (cachedTokens ?? 0) + (cacheWriteTokens ?? 0),
        completionTokens,
    );
    // Actual: with cache pricing
    const actual = estimateCostEur(pricing, promptTokens, completionTokens, cachedTokens, cacheWriteTokens);
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
