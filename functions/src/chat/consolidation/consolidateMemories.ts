// =============================================================================
// consolidateMemories — Cloud Function (onCall)
//
// Stateless one-shot endpoint: receives memories + model + intention,
// returns consolidated JSON via provider router's generateText.
// Does NOT read or write Firestore — pure AI function.
// =============================================================================

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { ALLOWED_MODEL_IDS } from "../../config/models.js";
import { MODEL_REGISTRY, computeIterationCost } from "../../shared/models.js";
import { createProviderRouter } from "../../services/ai/providerRouter.js";
import { geminiFactory } from "../../services/gemini/factory.js";
import { claudeFactory } from "../../services/claude/factory.js";
import {
    CONSOLIDATION_SYSTEM_PROMPT,
    CONSOLIDATION_SCHEMA,
    buildUserPrompt,
    validateConsolidationResult,
} from "./prompt.js";
import { validateContentLimits } from "./validation.js";
import type { ConsolidationResult } from "./prompt.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

/** Pre-built model→provider mapping (deterministic, computed once per cold start). */
const MODEL_TO_PROVIDER = Object.fromEntries(
    MODEL_REGISTRY.map(m => [m.id, m.provider]),
);

interface ConsolidateRequest {
    model: string;
    memories: Array<{ id: string; title: string; content: string; createdAt: string }>;
    intention?: string;
}

export const consolidateMemories = onCall(
    {
        secrets: [geminiApiKey, anthropicApiKey],
        timeoutSeconds: 300,
        memory: "512MiB",
        maxInstances: 3,
    },
    async (request): Promise<ConsolidationResult> => {
        const requestStart = Date.now();

        // 1. Auth guard
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;

        // 2. Validate required fields
        const { model, memories, intention } = request.data as ConsolidateRequest;

        if (!model || typeof model !== "string") {
            throw new HttpsError("invalid-argument", "Model is required.");
        }
        if (!Array.isArray(memories) || memories.length < 2) {
            throw new HttpsError(
                "invalid-argument",
                "At least 2 memories are required for consolidation.",
            );
        }

        // 3. Model whitelist
        if (!ALLOWED_MODEL_IDS.has(model)) {
            throw new HttpsError(
                "invalid-argument",
                `Model "${model}" is not supported. Please select a valid model.`,
            );
        }

        console.info(
            `[consolidate] ── Request ── user=${userId} model=${model} memories=${memories.length}` +
            `${intention ? ` intention="${intention.slice(0, 60)}"` : ""}`,
        );

        // 4. Build user prompt + content limits check (zero cost on overflow)
        const userPrompt = buildUserPrompt(memories, intention);
        validateContentLimits(userPrompt, model);

        // 5. Create provider router
        const router = createProviderRouter({
            registry: {
                gemini: {
                    factory: geminiFactory,
                    config: { apiKey: geminiApiKey.value() },
                },
                anthropic: {
                    factory: claudeFactory,
                    config: { apiKey: anthropicApiKey.value() },
                },
            },
            modelToProvider: MODEL_TO_PROVIDER,
        });

        // 6. Call generateText via provider router
        try {
            const result = await router.generateText({
                model,
                systemPrompt: CONSOLIDATION_SYSTEM_PROMPT,
                text: userPrompt,
                responseSchema: CONSOLIDATION_SCHEMA as Record<string, unknown>,
            });

            // 7. Parse + validate result
            const parsed = result.parsed ?? JSON.parse(result.text);
            const validated = validateConsolidationResult(parsed);

            // 8. Compute cost from tokenUsage + ModelPricing (thinking-aware)
            const modelConfig = MODEL_REGISTRY.find(m => m.id === model);
            const tu = result.tokenUsage as { promptTokens: number; completionTokens: number; thinkingTokens?: number } | undefined;
            if (tu && modelConfig) {
                const inputTokens = tu.promptTokens;
                const outputTokens = tu.completionTokens;
                const thinkingTokens = tu.thinkingTokens ?? 0;
                const iterationCost = computeIterationCost(modelConfig.pricing, {
                    input: { total: inputTokens, fresh: inputTokens, cached: 0, cacheWrite: 0 },
                    output: { total: outputTokens, thinking: thinkingTokens },
                });
                validated.costUsd = iterationCost.total;
                validated.tokens = { input: inputTokens, output: outputTokens };
            }

            const duration = Date.now() - requestStart;
            console.info(
                `[consolidate] ── Response ── model=${model} ` +
                `noChanges=${validated.noChangesNeeded} outputMemories=${validated.memories.length} ` +
                `tokens=${validated.tokens?.input ?? 0}in/${validated.tokens?.output ?? 0}out ` +
                `cost=$${validated.costUsd?.toFixed(4) ?? "?"} duration=${duration}ms`,
            );

            return validated;
        } catch (error: unknown) {
            // Re-throw HttpsError as-is (e.g. from validateContentLimits)
            if (error instanceof HttpsError) throw error;

            // Validation errors from validateConsolidationResult
            if (error instanceof Error && error.message.includes("Consolidation result")) {
                throw new HttpsError("internal", `Model returned invalid structure: ${error.message}`);
            }

            // LLM or network errors
            const message = error instanceof Error ? error.message : "Unknown error";
            console.warn(`[consolidate] ── Error ── model=${model} duration=${Date.now() - requestStart}ms error="${message}"`);
            throw new HttpsError(
                "unavailable",
                `AI model failed to process consolidation: ${message}`,
            );
        }
    },
);
