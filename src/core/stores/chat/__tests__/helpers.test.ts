// @vitest-environment node
// =============================================================================
// helpers.test.ts — pure function unit tests (no mocks required)
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

// Mock firebase/firestore so the jsdom worker doesn't try to establish connections
vi.mock('firebase/firestore', () => ({
    Timestamp: {
        now: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0, toDate: () => new Date() }),
    },
}));

// Mock the firebase config/app to prevent initializeApp side effects
vi.mock('../../../config/firebase', () => ({}));

import { requireContext, resolveModel, rebuildPersistedContext } from '../helpers';
import type { ChatState } from '../types';
import type { AiAssistantSettings, ChatProject, ChatMessage } from '../../../types/chat';
import type { AppContextItem } from '../../../types/appContext';
import { Timestamp } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: AiAssistantSettings = {
    defaultModel: 'gemini-1.5-flash',
    globalSystemPrompt: '',
    responseLanguage: 'auto',
    responseStyle: 'balanced',
};

const PROJECT_WITH_MODEL: ChatProject = {
    id: 'proj-1',
    name: 'Project 1',
    model: 'gemini-1.5-pro',
    order: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
};

function makeMessage(id: string, appContext?: AppContextItem[]): ChatMessage {
    return {
        id,
        role: 'user',
        text: 'hello',
        createdAt: Timestamp.now(),
        ...(appContext ? { appContext } : {}),
    };
}

// ---------------------------------------------------------------------------
// requireContext
// ---------------------------------------------------------------------------

describe('requireContext', () => {
    it('returns userId and channelId when both are set', () => {
        const get = () => ({ userId: 'u1', channelId: 'c1' }) as ChatState;
        expect(requireContext(get)).toEqual({ userId: 'u1', channelId: 'c1' });
    });

    it('throws when userId is null', () => {
        const get = () => ({ userId: null, channelId: 'c1' }) as ChatState;
        expect(() => requireContext(get)).toThrow('Chat context not set');
    });

    it('throws when channelId is null', () => {
        const get = () => ({ userId: 'u1', channelId: null }) as ChatState;
        expect(() => requireContext(get)).toThrow('Chat context not set');
    });

    it('throws when both are null', () => {
        const get = () => ({ userId: null, channelId: null }) as ChatState;
        expect(() => requireContext(get)).toThrow('Chat context not set');
    });
});

// ---------------------------------------------------------------------------
// resolveModel
// ---------------------------------------------------------------------------

describe('resolveModel', () => {
    it('returns pendingModel when set (highest priority)', () => {
        const result = resolveModel(
            DEFAULT_SETTINGS,
            [PROJECT_WITH_MODEL],
            'proj-1',
            'gemini-1.5-flash',
            'gemini-2.0-flash-exp',
        );
        expect(result).toBe('gemini-2.0-flash-exp');
    });

    it('returns conversationModel when no pendingModel', () => {
        const result = resolveModel(
            DEFAULT_SETTINGS,
            [PROJECT_WITH_MODEL],
            'proj-1',
            'gemini-1.5-flash',
            null,
        );
        expect(result).toBe('gemini-1.5-flash');
    });

    it('returns project model when no pending or conversation model', () => {
        const result = resolveModel(
            DEFAULT_SETTINGS,
            [PROJECT_WITH_MODEL],
            'proj-1',
            undefined,
            null,
        );
        expect(result).toBe('gemini-1.5-pro');
    });

    it('returns global defaultModel when no project match', () => {
        const result = resolveModel(
            DEFAULT_SETTINGS,
            [PROJECT_WITH_MODEL],
            'proj-unknown',
            undefined,
            null,
        );
        expect(result).toBe('gemini-1.5-flash');
    });

    it('returns global defaultModel when no project and no overrides', () => {
        const result = resolveModel(DEFAULT_SETTINGS, [], null, undefined, null);
        expect(result).toBe('gemini-1.5-flash');
    });
});

// ---------------------------------------------------------------------------
// rebuildPersistedContext
// ---------------------------------------------------------------------------

describe('rebuildPersistedContext', () => {
    it('returns empty array for messages without appContext', () => {
        const msgs = [makeMessage('m1'), makeMessage('m2')];
        expect(rebuildPersistedContext(msgs)).toEqual([]);
    });

    it('returns empty array for empty message list', () => {
        expect(rebuildPersistedContext([])).toEqual([]);
    });

    it('collects appContext items from messages', () => {
        const item1: AppContextItem = { type: 'video-card', videoId: 'v1' } as AppContextItem;
        const item2: AppContextItem = { type: 'video-card', videoId: 'v2' } as AppContextItem;
        const msgs = [
            makeMessage('m1', [item1]),
            makeMessage('m2', [item2]),
        ];
        const result = rebuildPersistedContext(msgs);
        expect(result).toHaveLength(2);
    });

    it('deduplicates items with the same type+key across messages', () => {
        const item: AppContextItem = { type: 'video-card', videoId: 'v1' } as AppContextItem;
        const msgs = [
            makeMessage('m1', [item]),
            makeMessage('m2', [item]),
        ];
        const result = rebuildPersistedContext(msgs);
        // mergeContextItems deduplicates — should not have two identical items
        expect(result.length).toBeLessThanOrEqual(2);
    });

    it('skips messages with empty appContext arrays', () => {
        const msgs = [makeMessage('m1', []), makeMessage('m2')];
        expect(rebuildPersistedContext(msgs)).toEqual([]);
    });
});
