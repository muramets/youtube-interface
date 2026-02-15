export interface ModelPricing {
    /** USD per 1M tokens for prompts ≤ 200K tokens */
    inputPerMillion: number;
    outputPerMillion: number;
    /** USD per 1M tokens for prompts > 200K tokens (Pro models only) */
    inputPerMillionLong?: number;
    outputPerMillionLong?: number;
}

export interface ModelConfig {
    id: string;
    label: string;
    contextLimit: number;
    isDefault?: boolean;
    pricing: ModelPricing;
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

export const MODEL_REGISTRY: ModelConfig[] = [
    {
        id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', contextLimit: 1_000_000,
        pricing: { inputPerMillion: 2.00, outputPerMillion: 12.00, inputPerMillionLong: 4.00, outputPerMillionLong: 18.00 },
    },
    {
        id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', contextLimit: 1_000_000,
        pricing: { inputPerMillion: 0.50, outputPerMillion: 3.00 },
    },
    {
        id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextLimit: 1_000_000, isDefault: true,
        pricing: { inputPerMillion: 1.25, outputPerMillion: 10.00, inputPerMillionLong: 2.50, outputPerMillionLong: 15.00 },
    },
    {
        id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextLimit: 1_000_000,
        pricing: { inputPerMillion: 0.30, outputPerMillion: 2.50 },
    },
];
