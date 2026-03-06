// =============================================================================
// shouldShowMessage — unit tests
//
// Covers all message status combinations and ordering rules:
//   - complete/undefined: always visible
//   - deleted/error: always hidden
//   - stopped: visible when last model message, hidden when newer complete exists
// =============================================================================

import { describe, it, expect } from 'vitest';
import { shouldShowMessage } from '../chat';
import type { ChatMessage } from '../chat';
import { Timestamp } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let counter = 0;

function makeMessage(
    overrides: Partial<ChatMessage> & { role: 'user' | 'model' },
): ChatMessage {
    counter++;
    return {
        id: `msg-${counter}`,
        text: `Message ${counter}`,
        createdAt: Timestamp.fromMillis(Date.now() + counter * 1000),
        ...overrides,
    } as ChatMessage;
}

function makeTimestamp(offsetMs: number): Timestamp {
    return Timestamp.fromMillis(1_700_000_000_000 + offsetMs);
}

// ---------------------------------------------------------------------------
// Suite A: Basic status visibility
// ---------------------------------------------------------------------------

describe('shouldShowMessage', () => {
    describe('A — basic status rules', () => {
        it('shows complete messages', () => {
            const msg = makeMessage({ role: 'model', status: 'complete' });
            expect(shouldShowMessage(msg, [msg])).toBe(true);
        });

        it('shows legacy messages (undefined status)', () => {
            const msg = makeMessage({ role: 'model' });
            expect(shouldShowMessage(msg, [msg])).toBe(true);
        });

        it('hides deleted messages', () => {
            const msg = makeMessage({ role: 'model', status: 'deleted' });
            expect(shouldShowMessage(msg, [msg])).toBe(false);
        });

        it('hides error messages', () => {
            const msg = makeMessage({ role: 'model', status: 'error' });
            expect(shouldShowMessage(msg, [msg])).toBe(false);
        });
    });

    // ---------------------------------------------------------------------------
    // Suite B: Stopped messages visibility
    // ---------------------------------------------------------------------------

    describe('B — stopped messages', () => {
        it('shows stopped when it is the last model message', () => {
            const stopped = makeMessage({
                role: 'model',
                status: 'stopped',
                createdAt: makeTimestamp(2000),
            });
            const userMsg = makeMessage({
                role: 'user',
                createdAt: makeTimestamp(1000),
            });
            const allMessages = [userMsg, stopped];

            expect(shouldShowMessage(stopped, allMessages)).toBe(true);
        });

        it('hides stopped when a newer complete model message exists', () => {
            const stopped = makeMessage({
                role: 'model',
                status: 'stopped',
                createdAt: makeTimestamp(2000),
            });
            const complete = makeMessage({
                role: 'model',
                status: 'complete',
                createdAt: makeTimestamp(3000),
            });
            const allMessages = [stopped, complete];

            expect(shouldShowMessage(stopped, allMessages)).toBe(false);
        });

        it('hides stopped when a newer legacy (undefined status) model message exists', () => {
            const stopped = makeMessage({
                role: 'model',
                status: 'stopped',
                createdAt: makeTimestamp(2000),
            });
            const legacy = makeMessage({
                role: 'model',
                createdAt: makeTimestamp(3000),
            });
            const allMessages = [stopped, legacy];

            expect(shouldShowMessage(stopped, allMessages)).toBe(false);
        });

        it('shows stopped when newer messages are user-only (no newer model)', () => {
            const stopped = makeMessage({
                role: 'model',
                status: 'stopped',
                createdAt: makeTimestamp(2000),
            });
            const userAfter = makeMessage({
                role: 'user',
                createdAt: makeTimestamp(3000),
            });
            const allMessages = [stopped, userAfter];

            expect(shouldShowMessage(stopped, allMessages)).toBe(true);
        });

        it('shows stopped when newer model message is also stopped (not complete)', () => {
            const stopped1 = makeMessage({
                role: 'model',
                status: 'stopped',
                createdAt: makeTimestamp(2000),
            });
            const stopped2 = makeMessage({
                role: 'model',
                status: 'stopped',
                createdAt: makeTimestamp(3000),
            });
            const allMessages = [stopped1, stopped2];

            // Both visible — neither is superseded by a complete message
            expect(shouldShowMessage(stopped1, allMessages)).toBe(true);
            expect(shouldShowMessage(stopped2, allMessages)).toBe(true);
        });

        it('shows stopped when newer model message is deleted', () => {
            const stopped = makeMessage({
                role: 'model',
                status: 'stopped',
                createdAt: makeTimestamp(2000),
            });
            const deleted = makeMessage({
                role: 'model',
                status: 'deleted',
                createdAt: makeTimestamp(3000),
            });
            const allMessages = [stopped, deleted];

            // Deleted doesn't supersede stopped
            expect(shouldShowMessage(stopped, allMessages)).toBe(true);
        });
    });

    // ---------------------------------------------------------------------------
    // Suite C: Real conversation sequences
    // ---------------------------------------------------------------------------

    describe('C — conversation sequences', () => {
        it('user→stopped→user→complete: stopped hidden, complete shown', () => {
            const user1 = makeMessage({ role: 'user', createdAt: makeTimestamp(1000) });
            const stopped = makeMessage({ role: 'model', status: 'stopped', createdAt: makeTimestamp(2000) });
            const user2 = makeMessage({ role: 'user', createdAt: makeTimestamp(3000) });
            const complete = makeMessage({ role: 'model', status: 'complete', createdAt: makeTimestamp(4000) });
            const all = [user1, stopped, user2, complete];

            expect(shouldShowMessage(stopped, all)).toBe(false);
            expect(shouldShowMessage(complete, all)).toBe(true);
            expect(shouldShowMessage(user1, all)).toBe(true);
            expect(shouldShowMessage(user2, all)).toBe(true);
        });

        it('all statuses in one conversation', () => {
            const msgs: ChatMessage[] = [
                makeMessage({ role: 'user', createdAt: makeTimestamp(1000) }),
                makeMessage({ role: 'model', status: 'error', createdAt: makeTimestamp(2000) }),
                makeMessage({ role: 'model', status: 'stopped', createdAt: makeTimestamp(3000) }),
                makeMessage({ role: 'model', status: 'deleted', createdAt: makeTimestamp(4000) }),
                makeMessage({ role: 'model', status: 'complete', createdAt: makeTimestamp(5000) }),
            ];

            expect(shouldShowMessage(msgs[0], msgs)).toBe(true);  // user
            expect(shouldShowMessage(msgs[1], msgs)).toBe(false); // error
            expect(shouldShowMessage(msgs[2], msgs)).toBe(false); // stopped (newer complete exists)
            expect(shouldShowMessage(msgs[3], msgs)).toBe(false); // deleted
            expect(shouldShowMessage(msgs[4], msgs)).toBe(true);  // complete
        });
    });
});
