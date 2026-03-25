// =============================================================================
// Layer 4: Cross-Conversation Memory Layer
//
// Injects memories (insights from previous conversations) into the system
// prompt so the AI accumulates knowledge about the user's channel over time.
// =============================================================================

import type { ConversationMemory } from '../../types/chat/chat';

/**
 * Format memories into system prompt sections.
 * Returns string[] to be joined with other layers in buildSystemPrompt().
 */
export function buildCrossConversationLayer(memories?: ConversationMemory[]): string[] {
    if (!memories || memories.length === 0) return [];

    const header = '## Conversation Memories\n\nThese are insights from previous conversations. Use them for continuity — refer to past decisions and context when relevant.';

    const OWNERSHIP_LABELS: Record<string, string> = {
        'own-published': 'your published',
        'own-draft': 'your draft',
        'competitor': 'competitor',
    };

    const memoryBlocks = memories.map(m => {
        const date = m.createdAt?.toDate?.()
            ? m.createdAt.toDate().toISOString().slice(0, 10)
            : 'Unknown date';

        const protectedTag = m.protected ? ' 🔒' : '';
        let block = `### "${m.conversationTitle}" (${date}) [mem:${m.id}]${protectedTag}`;

        if (m.videoRefs && m.videoRefs.length > 0) {
            const refs = m.videoRefs.map(v =>
                `"${v.title}" [id: ${v.videoId}] (${OWNERSHIP_LABELS[v.ownership] || v.ownership})`
            ).join(', ');
            block += `\n**Videos referenced:** ${refs}`;
        }

        block += `\n${m.content}`;
        return block;
    });

    return [header + '\n\n' + memoryBlocks.join('\n\n')];
}
