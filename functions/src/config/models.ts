// =============================================================================
// Model Config — Server-side derived helpers
// Imports the canonical MODEL_REGISTRY from shared/ (via symlink)
// and derives server-specific constants.
// =============================================================================

import { MODEL_REGISTRY } from '../shared/models.js';
export type { ModelConfig } from '../shared/models.js';
export { MODEL_REGISTRY } from '../shared/models.js';

// --- Derived helpers (used server-side) ---

/** Set of allowed model IDs for input validation. */
export const ALLOWED_MODEL_IDS = new Set(MODEL_REGISTRY.map(m => m.id));

/** Default model ID (first entry marked isDefault, or first entry). */
export const DEFAULT_MODEL_ID =
    MODEL_REGISTRY.find(m => m.isDefault)?.id ?? MODEL_REGISTRY[0].id;

/** Context window limits keyed by model ID. */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = Object.fromEntries(
    MODEL_REGISTRY.map(m => [m.id, m.contextLimit])
);
