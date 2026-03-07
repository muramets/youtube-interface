// =============================================================================
// Settings Layer — date/time, language, style, global + project prompts.
// Not a memory layer — just infrastructure for configuring the AI's behavior.
// =============================================================================

import type { AiAssistantSettings, ChatProject } from '../../types/chat/chat';
import {
    STYLE_CONCISE,
    STYLE_DETAILED,
    THINKING_DISCIPLINE,
    AGENTIC_BEHAVIOR_RULES,
    ANTI_HALLUCINATION_RULES,
} from '../../config/prompts';

const LANGUAGE_NAMES: Record<string, string> = {
    en: 'English', ru: 'Russian', uk: 'Ukrainian',
    es: 'Spanish', de: 'German', fr: 'French',
};

/** Settings layer — date/time, language, style, global + project prompts. */
export function buildSettingsLayer(
    aiSettings: AiAssistantSettings, projects: ChatProject[], activeProjectId: string | null
): string[] {
    const sections: string[] = [];

    // Date-only (no time): any time component would invalidate Claude's prefix cache
    // because system prompt is the first segment in the cache prefix.
    // For YouTube analytics, date awareness is sufficient — hour/minute is irrelevant.
    sections.push(`Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`);

    // Language instruction
    if (aiSettings.responseLanguage && aiSettings.responseLanguage !== 'auto') {
        const name = LANGUAGE_NAMES[aiSettings.responseLanguage] || aiSettings.responseLanguage;
        sections.push(`Always respond in ${name}.`);
    }

    // Style instruction
    if (aiSettings.responseStyle === 'concise') {
        sections.push(STYLE_CONCISE);
    } else if (aiSettings.responseStyle === 'detailed') {
        sections.push(STYLE_DETAILED);
    }

    // Thinking discipline — prevent chain-of-thought leaking into response text
    sections.push(THINKING_DISCIPLINE);

    // Global + project prompts
    if (aiSettings.globalSystemPrompt) sections.push(aiSettings.globalSystemPrompt);
    const project = projects.find(p => p.id === activeProjectId);
    if (project?.systemPrompt) sections.push(project.systemPrompt);

    // Agentic behavior rules (planning, tool strategy, self-check)
    sections.push(AGENTIC_BEHAVIOR_RULES);

    // Anti-hallucination rules (always last in Settings — right before context data)
    sections.push(ANTI_HALLUCINATION_RULES);

    return sections;
}
