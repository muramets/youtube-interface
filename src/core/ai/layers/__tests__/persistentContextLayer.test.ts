import { describe, it, expect } from 'vitest';
import { formatChannelContext, formatCategoryRegistry, buildPersistentContextLayer } from '../persistentContextLayer';
import type { ChannelMetadata } from '../../../types/appContext';
import type { KnowledgeCategoryEntry } from '../../../types/knowledge';

// =============================================================================
// formatChannelContext
// =============================================================================

describe('formatChannelContext', () => {
    it('formats channel with full metadata', () => {
        const channel: ChannelMetadata = {
            name: 'Test Channel',
            handle: 'testchannel',
            subscriberCount: 150_000,
            videoCount: 200,
        };
        const result = formatChannelContext(channel);
        expect(result).toContain('### Channel');
        expect(result).toContain('"Test Channel" (@testchannel)');
        expect(result).toContain('150,000 subscribers');
        expect(result).toContain('200 videos');
    });

    it('formats channel with minimal metadata', () => {
        const channel: ChannelMetadata = { name: 'Minimal' };
        const result = formatChannelContext(channel);
        expect(result).toContain('"Minimal"');
        expect(result).not.toContain('@');
        expect(result).not.toContain('subscribers');
    });

    it('includes KI discovery flags when present', () => {
        const channel: ChannelMetadata = {
            name: 'KI Channel',
            knowledgeItemCount: 5,
            knowledgeCategories: ['packaging-analysis', 'audience-retention'],
            lastAnalyzedAt: '2026-03-10',
        };
        const result = formatChannelContext(channel);
        expect(result).toContain('AI Research: 5 items');
        expect(result).toContain('packaging-analysis, audience-retention');
        expect(result).toContain('last analyzed 2026-03-10');
    });

    it('omits KI line when knowledgeItemCount is 0', () => {
        const channel: ChannelMetadata = {
            name: 'No KI',
            knowledgeItemCount: 0,
        };
        const result = formatChannelContext(channel);
        expect(result).not.toContain('AI Research');
    });
});

// =============================================================================
// formatCategoryRegistry
// =============================================================================

describe('formatCategoryRegistry', () => {
    it('formats categories with slug, level, description', () => {
        const cats: KnowledgeCategoryEntry[] = [
            { slug: 'packaging-analysis', label: 'Packaging Analysis', level: 'video', description: 'Title, thumbnail, tags' },
            { slug: 'audience-retention', label: 'Audience Retention', level: 'video', description: 'Retention curve analysis' },
        ];
        const result = formatCategoryRegistry(cats);
        expect(result).toContain('### Knowledge Categories');
        expect(result).toContain('**packaging-analysis** (video): Title, thumbnail, tags');
        expect(result).toContain('**audience-retention** (video): Retention curve analysis');
    });

    it('returns empty string for empty array', () => {
        expect(formatCategoryRegistry([])).toBe('');
    });
});

// =============================================================================
// buildPersistentContextLayer — channelMetadata + knowledgeCategories integration
// =============================================================================

describe('buildPersistentContextLayer', () => {
    it('includes channel section when channelMetadata provided', () => {
        const sections = buildPersistentContextLayer(
            undefined,
            { name: 'My Channel', handle: 'mychannel' },
        );
        expect(sections.length).toBeGreaterThanOrEqual(1);
        expect(sections[0]).toContain('### Channel');
        expect(sections[0]).toContain('"My Channel" (@mychannel)');
    });

    it('includes category registry when knowledgeCategories provided', () => {
        const cats: KnowledgeCategoryEntry[] = [
            { slug: 'test-cat', label: 'Test Cat', level: 'channel', description: 'Test' },
        ];
        const sections = buildPersistentContextLayer(undefined, undefined, cats);
        expect(sections.some(s => s.includes('### Knowledge Categories'))).toBe(true);
    });

    it('includes both channel + categories when both provided', () => {
        const cats: KnowledgeCategoryEntry[] = [
            { slug: 'test-cat', label: 'Test Cat', level: 'channel', description: 'Test' },
        ];
        const sections = buildPersistentContextLayer(
            undefined,
            { name: 'Ch' },
            cats,
        );
        expect(sections.some(s => s.includes('### Channel'))).toBe(true);
        expect(sections.some(s => s.includes('### Knowledge Categories'))).toBe(true);
    });

    it('returns empty array when no data provided', () => {
        const sections = buildPersistentContextLayer();
        expect(sections).toEqual([]);
    });

    it('includes KI discovery flags in video context', () => {
        const sections = buildPersistentContextLayer([
            {
                type: 'video-card',
                ownership: 'own-published',
                videoId: 'v1',
                title: 'Test Video',
                thumbnailUrl: 'https://example.com/thumb.jpg',
                knowledgeItemCount: 3,
                knowledgeCategories: ['packaging-analysis'],
                lastAnalyzedAt: '2026-03-10',
            },
        ]);
        const videoSection = sections.find(s => s.includes('Test Video'));
        expect(videoSection).toBeDefined();
        expect(videoSection).toContain('KI: 3 items');
        expect(videoSection).toContain('packaging-analysis');
    });
});
