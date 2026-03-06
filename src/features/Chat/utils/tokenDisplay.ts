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
