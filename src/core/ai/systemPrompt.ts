// =============================================================================
// System Prompt — Layered Memory Architecture
//
// This is the compositor that assembles all layers into a single system prompt.
// Each "layer" is a function in ./layers/ returning string[] sections.
//
// To add a new memory layer:
//   1. Create src/core/ai/layers/xxxLayer.ts exporting buildXxxLayer()
//   2. Import and add it to the layers array below
// =============================================================================

import type { AiAssistantSettings, ChatProject, ConversationMemory } from '../types/chat/chat';
import type { AppContextItem } from '../types/appContext';
import { buildSettingsLayer } from './layers/settingsLayer';
import { buildPersistentContextLayer } from './layers/persistentContextLayer';
import { buildCrossConversationLayer } from './layers/crossConversationLayer';

export interface SystemPromptResult {
    prompt: string;
    layerSizes: {
        settings: number;
        persistentContext: number;
        crossMemory: number;
    };
}

/** Build system prompt by composing all layers. Returns prompt + per-layer char sizes. */
export function buildSystemPrompt(
    aiSettings: AiAssistantSettings,
    projects: ChatProject[],
    activeProjectId: string | null,
    appContext?: AppContextItem[],
    memories?: ConversationMemory[],
): SystemPromptResult {
    const settingsSections = buildSettingsLayer(aiSettings, projects, activeProjectId);
    const contextSections = buildPersistentContextLayer(appContext);   // Layer 1
    // Layer 2 (per-message context) lives server-side in buildHistory()
    // Layer 3 (summarization) lives server-side in buildMemory()
    const memorySections = buildCrossConversationLayer(memories);      // Layer 4

    const sections = [...settingsSections, ...contextSections, ...memorySections];
    const joinWith = '\n\n';

    // Measure each layer's contribution including join separators
    const measure = (s: string[]) => s.length > 0
        ? s.join(joinWith).length
        : 0;

    return {
        prompt: sections.join(joinWith),
        layerSizes: {
            settings: measure(settingsSections),
            persistentContext: measure(contextSections),
            crossMemory: measure(memorySections),
        },
    };
}
