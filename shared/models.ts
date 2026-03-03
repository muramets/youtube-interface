// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Source of truth: /shared/models.ts
// Copied by: functions/scripts/copy-shared.mjs

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
}

export interface ThinkingOption {
    /** Unique identifier for this thinking level (e.g. 'low', 'medium', 'high') */
    id: string;
    /** Display label in the UI */
    label: string;
    /** Value passed to the Gemini API (thinkingLevel string or thinkingBudget number) */
    value: string | number;
}

export interface ModelConfig {
    id: string;
    label: string;
    contextLimit: number;
    isDefault?: boolean;
    pricing: ModelPricing;
    /** Available thinking depth options for this model */
    thinkingOptions: ThinkingOption[];
    /** Default thinking option id */
    thinkingDefault: string;
    /** Which Gemini API param to use: 'thinkingLevel' (enum) or 'thinkingBudget' (token count) */
    thinkingParam: 'thinkingLevel' | 'thinkingBudget';
}

// Fixed EUR/USD rate — approximate, updated manually as needed
export const USD_TO_EUR = 0.92;

const LONG_CONTEXT_THRESHOLD = 200_000;

/**
 * Estimate cost in EUR for a single API call.
 * Uses the appropriate pricing tier based on prompt size.
 */
export function estimateCostEur(
    pricing: ModelPricing,
    promptTokens: number,
    completionTokens: number,
): number {
    const isLong = promptTokens > LONG_CONTEXT_THRESHOLD;
    const inputRate = (isLong && pricing.inputPerMillionLong != null)
        ? pricing.inputPerMillionLong : pricing.inputPerMillion;
    const outputRate = (isLong && pricing.outputPerMillionLong != null)
        ? pricing.outputPerMillionLong : pricing.outputPerMillion;

    const costUsd = (promptTokens / 1_000_000) * inputRate
        + (completionTokens / 1_000_000) * outputRate;
    return costUsd * USD_TO_EUR;
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

export const MODEL_REGISTRY: ModelConfig[] = [
    {
        id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', contextLimit: 1_000_000,
        pricing: { inputPerMillion: 2.00, outputPerMillion: 12.00, inputPerMillionLong: 4.00, outputPerMillionLong: 18.00 },
        thinkingOptions: [
            { id: 'low', label: 'Low', value: 'low' },
            { id: 'medium', label: 'Medium', value: 'medium' },
            { id: 'high', label: 'High', value: 'high' },
        ],
        thinkingDefault: 'high',
        thinkingParam: 'thinkingLevel',
    },
    {
        id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', contextLimit: 1_000_000,
        pricing: { inputPerMillion: 0.50, outputPerMillion: 3.00 },
        thinkingOptions: [
            { id: 'minimal', label: 'Minimal', value: 'minimal' },
            { id: 'low', label: 'Low', value: 'low' },
            { id: 'medium', label: 'Medium', value: 'medium' },
            { id: 'high', label: 'High', value: 'high' },
        ],
        thinkingDefault: 'low',
        thinkingParam: 'thinkingLevel',
    },
    {
        id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextLimit: 1_000_000, isDefault: true,
        pricing: { inputPerMillion: 1.25, outputPerMillion: 10.00, inputPerMillionLong: 2.50, outputPerMillionLong: 15.00 },
        thinkingOptions: [
            { id: 'auto', label: 'Auto', value: -1 },
            { id: 'low', label: 'Low', value: 1024 },
            { id: 'medium', label: 'Medium', value: 8192 },
            { id: 'high', label: 'High', value: 24576 },
        ],
        thinkingDefault: 'auto',
        thinkingParam: 'thinkingBudget',
    },
    {
        id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextLimit: 1_000_000,
        pricing: { inputPerMillion: 0.30, outputPerMillion: 2.50 },
        thinkingOptions: [
            { id: 'off', label: 'Off', value: 0 },
            { id: 'auto', label: 'Auto', value: -1 },
            { id: 'low', label: 'Low', value: 1024 },
            { id: 'medium', label: 'Medium', value: 8192 },
            { id: 'high', label: 'High', value: 24576 },
        ],
        thinkingDefault: 'auto',
        thinkingParam: 'thinkingBudget',
    },
];
