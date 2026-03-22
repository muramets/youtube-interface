// =============================================================================
// Shared Clock — synchronized relative timestamps for chat messages.
//
// One global setInterval (60 s) notifies all subscribers simultaneously,
// eliminating per-message timer drift that caused display inconsistencies.
// The clock auto-starts on the first subscriber and stops on the last.
// =============================================================================

import { useSyncExternalStore } from 'react';
import type { Timestamp } from 'firebase/firestore';
import { formatRelativeTime } from './formatRelativeTime';

type Listener = () => void;
const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    if (listeners.size === 1) {
        intervalId = setInterval(() => {
            listeners.forEach((l) => l());
        }, 60_000);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };
}

/**
 * Returns a live relative-time string ("3m ago", "2h ago", etc.)
 * that stays synchronized across all mounted components.
 */
export function useRelativeTime(ts: Timestamp): string {
    return useSyncExternalStore(subscribe, () => formatRelativeTime(ts));
}

/** @internal Exposed for unit tests only */
export const _testApi = { subscribe } as const;
