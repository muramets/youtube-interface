// =============================================================================
// Token Display Level — determines how much billing detail is visible per message.
//
// Two concerns: user preference (what they want) × access control (what tier allows).
// Current: solo user, hardcoded preference = 'debug', maxAllowed = 'debug'.
// Future: reads from Firestore user settings + subscription tier.
// =============================================================================

/** Available display levels, ordered from least to most verbose. */
export type TokenDisplayLevel = 'minimal' | 'standard' | 'detailed' | 'debug';

/** Numeric rank for each level (higher = more verbose). */
export const LEVEL_RANK: Record<TokenDisplayLevel, number> = {
    minimal: 0,
    standard: 1,
    detailed: 2,
    debug: 3,
};

/**
 * Resolve the effective display level as min(preference, maxAllowed).
 * Pure function — no side effects.
 */
export function getEffectiveDisplayLevel(
    preference: TokenDisplayLevel,
    maxAllowed: TokenDisplayLevel,
): TokenDisplayLevel {
    return LEVEL_RANK[preference] <= LEVEL_RANK[maxAllowed] ? preference : maxAllowed;
}

// =============================================================================
// Token Formatting
// =============================================================================

/** Format token count as compact string: 120000 → "120.0K", 1500000 → "1.5M". */
export function fmtTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

// =============================================================================
// Context Breakdown Scaling — chars → proportional tokens
// =============================================================================

import type { ContextBreakdown } from '../../../../shared/models';

/** Scaled breakdown with each component in estimated tokens, summing to actualTotal. */
export interface ScaledBreakdown {
    systemPrompt: number;
    /** System prompt sub-layers (only present when systemLayers data is available). */
    systemSettings: number;
    persistentContext: number;
    crossMemory: number;
    toolDefinitions: number;
    history: number;
    memory: number;
    currentMessage: number;
    toolResults: number;
    images: number;
    /** Whether system prompt is split into sub-layers. */
    hasSystemLayers: boolean;
}

/** Text keys used for proportional scaling — all keys that represent char-based measurements. */
const TEXT_KEYS = ['systemPrompt', 'toolDefinitions', 'history', 'memory', 'currentMessage', 'toolResults'] as const;

/**
 * Scale raw char sizes proportionally to fit `actualTotal` tokens.
 * Images keep their token estimate; text shares the remainder.
 * When systemLayers are present, splits systemPrompt into sub-layer tokens.
 * Guarantee: sum of all values === actualTotal.
 */
export function scaleBreakdown(raw: ContextBreakdown, actualTotal: number): ScaledBreakdown {
    const textCharsSum = raw.systemPrompt + raw.toolDefinitions + raw.history
        + raw.memory + raw.currentMessage + raw.toolResults;
    const imageShare = Math.min(raw.imageTokens, actualTotal);
    const textBudget = actualTotal - imageShare;
    const textScale = textCharsSum > 0 ? textBudget / textCharsSum : 0;

    const scaledSystemPrompt = Math.round(raw.systemPrompt * textScale);
    const hasLayers = !!raw.systemLayers;

    // Split systemPrompt into sub-layers proportionally
    let systemSettings = 0;
    let persistentContext = 0;
    let crossMemory = 0;
    if (hasLayers && raw.systemLayers) {
        const layerTotal = raw.systemLayers.settings + raw.systemLayers.persistentContext + raw.systemLayers.crossMemory;
        if (layerTotal > 0) {
            systemSettings = Math.round((raw.systemLayers.settings / layerTotal) * scaledSystemPrompt);
            persistentContext = Math.round((raw.systemLayers.persistentContext / layerTotal) * scaledSystemPrompt);
            crossMemory = Math.round((raw.systemLayers.crossMemory / layerTotal) * scaledSystemPrompt);
            // Fix rounding remainder: adjust largest sub-layer
            const layerSum = systemSettings + persistentContext + crossMemory;
            const layerRemainder = scaledSystemPrompt - layerSum;
            if (layerRemainder !== 0) {
                const layers = { systemSettings, persistentContext, crossMemory };
                const largest = (Object.keys(layers) as (keyof typeof layers)[])
                    .reduce((a, b) => layers[a] >= layers[b] ? a : b);
                if (largest === 'systemSettings') systemSettings += layerRemainder;
                else if (largest === 'persistentContext') persistentContext += layerRemainder;
                else crossMemory += layerRemainder;
            }
        } else {
            systemSettings = scaledSystemPrompt;
        }
    }

    const scaled: ScaledBreakdown = {
        systemPrompt: scaledSystemPrompt,
        systemSettings,
        persistentContext,
        crossMemory,
        toolDefinitions: Math.round(raw.toolDefinitions * textScale),
        history: Math.round(raw.history * textScale),
        memory: Math.round(raw.memory * textScale),
        currentMessage: Math.round(raw.currentMessage * textScale),
        toolResults: Math.round(raw.toolResults * textScale),
        images: imageShare,
        hasSystemLayers: hasLayers,
    };

    // Fix rounding remainder: adjust largest text component so sum === actualTotal
    const scaledTextSum = TEXT_KEYS.reduce((s, k) => s + scaled[k], 0);
    const remainder = textBudget - scaledTextSum;
    if (remainder !== 0) {
        const largest = TEXT_KEYS.reduce((a, b) => scaled[a] >= scaled[b] ? a : b);
        scaled[largest] += remainder;
    }

    return scaled;
}
