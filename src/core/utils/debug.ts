/**
 * Debug utility with category-based logging.
 * 
 * In development: logs are shown if the category is enabled.
 * In production: all debug code is stripped by Vite's tree-shaking.
 * 
 * Usage:
 *   import { debug } from '@/core/utils/debug';
 *   debug.tooltip('🎨 Render State:', { isVisible });
 *   debug.timeline('📍 Position:', x, y);
 * 
 * To enable/disable categories, modify DEBUG_ENABLED below.
 */

// Toggle individual debug categories here
export const DEBUG_ENABLED = {
    tooltip: false,      // PortalTooltip positioning and render state
    video: false,        // VideoPreviewTooltip resize events
    timeline: false,     // TimelineVideoLayer hover events
    timelineHook: false, // useTimelineTooltip state changes
    dots: false,         // TimelineDotsLayer hover detection
    chat: true,          // AI chat: system prompt, app context, token usage
    rawChatOutput: false, // Bypass markdown reference injection to view raw Gemini output
    scroll: false,       // ChatMessageList scroll state machine
    traffic: false,      // Traffic tab: Smart Assistant hooks, viewer type classification
    enrichment: false,   // Enrichment gate: classifySources breakdown, cache hits/misses, YouTube API fetch, CSV persistence
    trends: false,       // Trends table: snapshot loading, delta calculations
    canvas: false,       // Canvas: node re-renders, drag frame timing, memo hits
    context: false,       // App context: slot mutations, bridge pushes, consume/clear
    firestore: false,     // Firestore read tracking: document counts per collection
} as const;

type DebugCategory = keyof typeof DEBUG_ENABLED;

/**
 * Creates a debug logger for a specific category.
 * Returns a no-op function in production or when category is disabled.
 */
const createLogger = (category: DebugCategory) => {
    // In production, return no-op function (will be tree-shaken)
    if (!import.meta.env.DEV) {
        return (...args: unknown[]) => { void args; };
    }

    // In development, check if category is enabled
    return (...args: unknown[]) => {
        if (DEBUG_ENABLED[category]) {
            console.log(`[${category}]`, ...args);
        }
    };
};

/**
 * Grouped debug logger for console.group style logging.
 * Only works when category is enabled.
 */
const createGroupLogger = (category: DebugCategory) => {
    if (!import.meta.env.DEV) {
        return {
            start: (label: string) => { void label; },
            log: (...args: unknown[]) => { void args; },
            end: () => { /* no-op */ },
        };
    }

    return {
        start: (label: string, expanded?: boolean) => {
            if (DEBUG_ENABLED[category]) {
                if (expanded) console.group(label);
                else console.groupCollapsed(label);
            }
        },
        log: (...args: unknown[]) => {
            if (DEBUG_ENABLED[category]) {
                console.log(...args);
            }
        },
        end: () => {
            if (DEBUG_ENABLED[category]) {
                console.groupEnd();
            }
        },
    };
};

// ---------------------------------------------------------------------------
// Firestore Read Tracker
// Accumulates read counts by collection. Query in browser console:
//   window.__firestoreReads()        — summary table
//   window.__firestoreReads('reset') — reset counters
// ---------------------------------------------------------------------------
interface ReadEntry {
    reads: number;
    listeners: number;
    lastReadAt: number;
}

/** Extract a human-readable label from a Firestore path.
 *  `users/abc/channels/xyz/videos` → `videos`
 *  `users/abc/channels/xyz/chatConversations/id/messages` → `chatConversations/messages`
 *  `users/abc/channels/xyz/settings` + id `general` → `settings/general`
 */
const labelFromPath = (path: string, docId?: string): string => {
    // Strip user/channel prefix: everything after `channels/{id}/`
    const channelIdx = path.indexOf('/channels/');
    const stripped = channelIdx !== -1
        ? path.slice(channelIdx).replace(/^\/channels\/[^/]+\//, '')
        : path;

    // Collapse dynamic IDs in the middle (keep collection names only)
    const parts = stripped.split('/');
    const names = parts.filter((_, i) => i % 2 === 0); // even indices = collection names

    const label = names.join('/');
    return docId ? `${label}/${docId}` : label;
};

const firestoreReads = new Map<string, ReadEntry>();

const trackRead = (label: string, docCount: number, isListener: boolean) => {
    if (!import.meta.env.DEV) return;
    const entry = firestoreReads.get(label) ?? { reads: 0, listeners: 0, lastReadAt: 0 };
    entry.reads += docCount;
    if (isListener) entry.listeners++;
    entry.lastReadAt = Date.now();
    firestoreReads.set(label, entry);

    if (DEBUG_ENABLED.firestore) {
        const type = isListener ? 'listener' : 'fetch';
        console.log(`[firestore] ${type} ${label}: ${docCount} docs (total: ${entry.reads})`);
    }
};

// Expose to browser console
if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__firestoreReads = (cmd?: string) => {
        if (cmd === 'reset') {
            firestoreReads.clear();
            console.log('[firestore] Counters reset');
            return;
        }
        const rows = [...firestoreReads.entries()]
            .sort((a, b) => b[1].reads - a[1].reads)
            .map(([label, e]) => ({
                collection: label,
                reads: e.reads,
                listeners: e.listeners,
                lastRead: new Date(e.lastReadAt).toLocaleTimeString(),
            }));
        const total = rows.reduce((sum, r) => sum + r.reads, 0);
        console.table(rows);
        console.log(`[firestore] Total reads: ${total.toLocaleString()}`);
    };
}

export { trackRead, labelFromPath };

// Export debug loggers for each category
export const debug = {
    tooltip: createLogger('tooltip'),
    video: createLogger('video'),
    timeline: createLogger('timeline'),
    timelineHook: createLogger('timelineHook'),
    chat: createLogger('chat'),
    scroll: createLogger('scroll'),
    traffic: createLogger('traffic'),
    enrichment: createLogger('enrichment'),
    trends: createLogger('trends'),
    canvas: createLogger('canvas'),
    context: createLogger('context'),
    firestore: createLogger('firestore'),

    // Grouped logging for complex debugging sessions
    tooltipGroup: createGroupLogger('tooltip'),
    chatGroup: createGroupLogger('chat'),
    enrichmentGroup: createGroupLogger('enrichment'),
    trendsGroup: createGroupLogger('trends'),
    canvasGroup: createGroupLogger('canvas'),
    contextGroup: createGroupLogger('context'),

    /**
     * Performance measurement helper.
     * Usage: const stop = debug.perf('canvas', 'renderNodes'); ... stop();
     * Logs elapsed ms when stop() is called.
     */
    perf: import.meta.env.DEV
        ? (category: DebugCategory, label: string) => {
            if (!DEBUG_ENABLED[category]) return () => { /* no-op */ };
            const start = performance.now();
            return () => {
                const elapsed = performance.now() - start;
                console.log(`[${category}] ⏱ ${label}: ${elapsed.toFixed(2)}ms`);
            };
        }
        : (_category: DebugCategory, _label: string) => { void _category; void _label; return () => { /* no-op */ }; },

    /**
     * Render FPS tracker. Call from a component render body:
     *   debug.fps('canvas', 'CanvasOverlay');
     * Logs renders/sec every 1 second while the component is rendering.
     */
    fps: (() => {
        if (!import.meta.env.DEV) return (_category: DebugCategory, _label: string) => { void _category; void _label; };
        const counters = new Map<string, { count: number; lastLog: number }>();
        return (category: DebugCategory, label: string) => {
            if (!DEBUG_ENABLED[category]) return;
            const key = `${category}:${label}`;
            const now = performance.now();
            let entry = counters.get(key);
            if (!entry) {
                entry = { count: 0, lastLog: now };
                counters.set(key, entry);
            }
            entry.count++;
            const elapsed = now - entry.lastLog;
            if (elapsed >= 1000) {
                const fps = Math.round(entry.count / (elapsed / 1000));
                console.log(`[${category}] 📊 ${label}: ${fps} renders/sec (${entry.count} in ${(elapsed / 1000).toFixed(1)}s)`);
                entry.count = 0;
                entry.lastLog = now;
            }
        };
    })(),
};

// Export type for extending categories
export type { DebugCategory };
