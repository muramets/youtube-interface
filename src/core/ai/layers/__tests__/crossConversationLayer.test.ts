import { describe, it, expect } from 'vitest';
import { buildCrossConversationLayer } from '../crossConversationLayer';
import type { ConversationMemory } from '../../../types/chat/chat';
import { Timestamp } from 'firebase/firestore';

function makeMemory(overrides: Partial<ConversationMemory> = {}): ConversationMemory {
    return {
        id: 'mem-abc-123',
        conversationTitle: 'Test Memory',
        content: '## Decisions\nWe decided X.',
        createdAt: Timestamp.fromDate(new Date('2026-03-20T00:00:00Z')),
        updatedAt: Timestamp.fromDate(new Date('2026-03-20T00:00:00Z')),
        ...overrides,
    };
}

describe('buildCrossConversationLayer', () => {
    it('returns empty array for no memories', () => {
        expect(buildCrossConversationLayer([])).toEqual([]);
        expect(buildCrossConversationLayer(undefined)).toEqual([]);
    });

    it('includes memory ID in [mem:id] format', () => {
        const result = buildCrossConversationLayer([makeMemory()]);
        expect(result[0]).toContain('[mem:mem-abc-123]');
    });

    it('includes title and date in header', () => {
        const result = buildCrossConversationLayer([makeMemory()]);
        expect(result[0]).toContain('### "Test Memory" (2026-03-20) [mem:mem-abc-123]');
    });

    it('includes memory content after header', () => {
        const result = buildCrossConversationLayer([makeMemory()]);
        expect(result[0]).toContain('## Decisions\nWe decided X.');
    });

    it('renders multiple memories with unique IDs', () => {
        const memories = [
            makeMemory({ id: 'mem-1', conversationTitle: 'First' }),
            makeMemory({ id: 'mem-2', conversationTitle: 'Second' }),
        ];
        const result = buildCrossConversationLayer(memories);
        expect(result[0]).toContain('[mem:mem-1]');
        expect(result[0]).toContain('[mem:mem-2]');
    });

    it('includes video refs when present', () => {
        const memory = makeMemory({
            videoRefs: [{
                videoId: 'vid-1',
                title: 'My Video',
                ownership: 'own-published',
                thumbnailUrl: 'https://example.com/thumb.jpg',
            }],
        });
        const result = buildCrossConversationLayer([memory]);
        expect(result[0]).toContain('**Videos referenced:**');
        expect(result[0]).toContain('[id: vid-1]');
        expect(result[0]).toContain('(your published)');
    });

    it('includes section header about conversation memories', () => {
        const result = buildCrossConversationLayer([makeMemory()]);
        expect(result[0]).toContain('## Conversation Memories');
        expect(result[0]).toContain('Use them for continuity');
    });

    it('shows 🔒 marker for protected memories', () => {
        const result = buildCrossConversationLayer([makeMemory({ protected: true })]);
        expect(result[0]).toContain('[mem:mem-abc-123] 🔒');
    });

    it('does not show 🔒 marker for unprotected memories', () => {
        const result = buildCrossConversationLayer([makeMemory({ protected: false })]);
        expect(result[0]).not.toContain('🔒');
    });

    it('does not show 🔒 marker when protected is undefined', () => {
        const result = buildCrossConversationLayer([makeMemory()]);
        expect(result[0]).not.toContain('🔒');
    });
});
