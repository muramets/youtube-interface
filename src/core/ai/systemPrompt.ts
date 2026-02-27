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

import type { AiAssistantSettings, ChatProject, ConversationMemory } from '../types/chat';
import type { AppContextItem } from '../types/appContext';
import { buildSettingsLayer } from './layers/settingsLayer';
import { buildPersistentContextLayer } from './layers/persistentContextLayer';
import { buildCrossConversationLayer } from './layers/crossConversationLayer';

/** Build system prompt by composing all layers. */
export function buildSystemPrompt(
    aiSettings: AiAssistantSettings,
    projects: ChatProject[],
    activeProjectId: string | null,
    appContext?: AppContextItem[],
    memories?: ConversationMemory[],
): string {
    const sections = [
        ...buildSettingsLayer(aiSettings, projects, activeProjectId),
        // --- Memory Layers (system prompt) ---
        ...buildPersistentContextLayer(appContext),   // Layer 1: Persistent Context
        // Layer 2 (per-message context) lives server-side in gemini.ts buildHistory()
        // Layer 3 (summarization) lives server-side in memory.ts buildMemory()
        ...buildCrossConversationLayer(memories),     // Layer 4: Cross-Conversation Memory
    ];

    return sections.join('\n\n');
}
