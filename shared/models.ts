// =============================================================================
// Model Registry — TRUE Single Source of Truth
// Both client (src/) and server (functions/src/) import from this file.
// Server accesses via symlink: functions/src/shared → ../../shared
// =============================================================================

export interface ModelConfig {
    id: string;
    label: string;
    contextLimit: number;
    isDefault?: boolean;
}

export const MODEL_REGISTRY: ModelConfig[] = [
    { id: 'gemini-3-pro', label: 'Gemini 3 Pro', contextLimit: 1_000_000 },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextLimit: 1_000_000, isDefault: true },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextLimit: 1_000_000 },
];
