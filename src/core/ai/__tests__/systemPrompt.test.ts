import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../systemPrompt';
import type { AiAssistantSettings } from '../../types/chat/chat';
import type { ChannelMetadata } from '../../types/appContext';
import type { KnowledgeCategoryEntry } from '../../types/knowledge';

const DEFAULT_SETTINGS: AiAssistantSettings = {
    defaultModel: 'gemini-2.0-flash',
    responseLanguage: 'auto',
    responseStyle: 'balanced',
    globalSystemPrompt: '',
};

describe('buildSystemPrompt', () => {
    it('includes channel metadata in prompt when provided', () => {
        const channel: ChannelMetadata = { name: 'My Channel', handle: 'mychannel' };
        const { prompt } = buildSystemPrompt(DEFAULT_SETTINGS, [], null, undefined, undefined, channel);
        expect(prompt).toContain('### Channel');
        expect(prompt).toContain('"My Channel" (@mychannel)');
    });

    it('includes knowledge categories in prompt when provided', () => {
        const cats: KnowledgeCategoryEntry[] = [
            { slug: 'packaging-analysis', label: 'Packaging Analysis', level: 'video', description: 'Title analysis' },
        ];
        const { prompt } = buildSystemPrompt(DEFAULT_SETTINGS, [], null, undefined, undefined, undefined, cats);
        expect(prompt).toContain('### Knowledge Categories');
        expect(prompt).toContain('**packaging-analysis** (video)');
    });

    it('tracks persistentContext layer size including channel + categories', () => {
        const channel: ChannelMetadata = { name: 'Ch' };
        const cats: KnowledgeCategoryEntry[] = [
            { slug: 'test', label: 'Test', level: 'video', description: 'Test' },
        ];
        const { layerSizes: withKI } = buildSystemPrompt(DEFAULT_SETTINGS, [], null, undefined, undefined, channel, cats);
        const { layerSizes: without } = buildSystemPrompt(DEFAULT_SETTINGS, [], null);
        expect(withKI.persistentContext).toBeGreaterThan(without.persistentContext);
    });

    it('works without channel metadata or categories', () => {
        const { prompt } = buildSystemPrompt(DEFAULT_SETTINGS, [], null);
        expect(prompt).toBeDefined();
        expect(prompt).not.toContain('### Channel');
        expect(prompt).not.toContain('### Knowledge Categories');
    });
});
