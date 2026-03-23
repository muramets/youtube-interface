// =============================================================================
// Consolidation Validation — Content limits check using MODEL_REGISTRY
// =============================================================================

import { HttpsError } from "firebase-functions/v2/https";
import { MODEL_REGISTRY } from "../../shared/models.js";
import { CHARS_PER_TOKEN } from "../../services/memory.js";

/** Fraction of context window reserved for input (rest = system prompt + output). */
const INPUT_BUDGET_RATIO = 0.7;

/**
 * Validate that the total memory text fits within the selected model's context window.
 * Throws HttpsError("invalid-argument") if memories exceed the limit.
 * This check runs BEFORE the LLM call — zero cost on overflow.
 */
export function validateContentLimits(memoriesText: string, modelId: string): void {
    const modelConfig = MODEL_REGISTRY.find(m => m.id === modelId);
    if (!modelConfig) {
        throw new HttpsError(
            "invalid-argument",
            `Unknown model "${modelId}". Please select a valid model.`,
        );
    }

    const maxInputChars = modelConfig.contextLimit * CHARS_PER_TOKEN * INPUT_BUDGET_RATIO;

    if (memoriesText.length > maxInputChars) {
        throw new HttpsError(
            "invalid-argument",
            `Selected memories exceed the context window of ${modelConfig.label}. ` +
            `Deselect some memories or choose a model with a larger context. ` +
            `(${memoriesText.length.toLocaleString()} chars vs ${Math.floor(maxInputChars).toLocaleString()} max)`,
        );
    }
}
