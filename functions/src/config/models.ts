// =============================================================================
// Model Config — Server-side derived helpers
// Imports the canonical MODEL_REGISTRY from shared/models.ts (auto-copied by
// scripts/copy-shared.mjs) and derives server-specific constants.
// =============================================================================

import { MODEL_REGISTRY, DEPRECATED_MODEL_MAP } from '../shared/models.js';
export type { ModelConfig } from '../shared/models.js';
export { MODEL_REGISTRY, DEPRECATED_MODEL_MAP, HISTORY_BUDGET_RATIO } from '../shared/models.js';

// --- Derived helpers (used server-side) ---

/** Set of allowed model IDs for input validation. */
export const ALLOWED_MODEL_IDS = new Set(MODEL_REGISTRY.map(m => m.id));

/**
 * Resolve a model ID, mapping deprecated IDs to their replacements.
 * Returns the resolved model ID or undefined if completely unknown.
 */
export function resolveModelId(modelId: string): string | undefined {
    if (ALLOWED_MODEL_IDS.has(modelId)) return modelId;
    return DEPRECATED_MODEL_MAP[modelId];
}

/** Default model ID (first entry marked isDefault, or first entry). */
export const DEFAULT_MODEL_ID =
    MODEL_REGISTRY.find(m => m.isDefault)?.id ?? MODEL_REGISTRY[0].id;

/** Cheapest Gemini model — used for utility tasks (title gen, summarization). */
export const UTILITY_MODEL_ID = 'gemini-2.5-flash';

/**
 * Resolve which Gemini model to use for quality-sensitive utility tasks (memorization).
 * - If user's model is a Gemini model → use it (preserves quality for Pro users)
 * - If user's model is non-Gemini (Claude etc.) → fallback to DEFAULT_MODEL_ID (Pro)
 */
export function resolveUtilityModel(userModelId: string): string {
    const config = MODEL_REGISTRY.find(m => m.id === userModelId);
    return config?.provider === 'gemini' ? userModelId : DEFAULT_MODEL_ID;
}

/** Context window limits keyed by model ID. */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = Object.fromEntries(
    MODEL_REGISTRY.map(m => [m.id, m.contextLimit])
);

/**
 * Validate that a thinkingOptionId is valid for the given model.
 * Returns the validated option id, or undefined if invalid/missing.
 */
export function validateThinkingOptionId(modelId: string, thinkingOptionId?: string): string | undefined {
    if (!thinkingOptionId) return undefined;
    const modelConfig = MODEL_REGISTRY.find(m => m.id === modelId);
    if (!modelConfig) return undefined;
    const valid = modelConfig.thinkingOptions.some(o => o.id === thinkingOptionId);
    return valid ? thinkingOptionId : undefined;
}
