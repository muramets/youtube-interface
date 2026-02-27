// =============================================================================
// Settings Layer — date/time, language, style, global + project prompts.
// Not a memory layer — just infrastructure for configuring the AI's behavior.
// =============================================================================

import type { AiAssistantSettings, ChatProject } from '../../types/chat';
import {
    STYLE_CONCISE,
    STYLE_DETAILED,
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

    // Current date/time context (LLMs have no built-in clock)
    sections.push(`Current date and time: ${new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}.`);

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

    // Global + project prompts
    if (aiSettings.globalSystemPrompt) sections.push(aiSettings.globalSystemPrompt);
    const project = projects.find(p => p.id === activeProjectId);
    if (project?.systemPrompt) sections.push(project.systemPrompt);

    // Anti-hallucination rules (always last in Settings — right before context data)
    sections.push(ANTI_HALLUCINATION_RULES);

    return sections;
}
