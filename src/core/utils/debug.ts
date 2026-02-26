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
    chat: true,         // AI chat: system prompt, app context, token usage
    scroll: false,       // ChatMessageList scroll state machine
    traffic: false,      // Traffic tab: unenriched calculation, repair flows
    trends: false,        // Trends table: snapshot loading, delta calculations
    canvas: false,       // Canvas: node re-renders, drag frame timing, memo hits
    context: true,       // App context: slot mutations, bridge pushes, consume/clear
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
        start: (label: string) => {
            if (DEBUG_ENABLED[category]) {
                console.group(label);
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

// Export debug loggers for each category
export const debug = {
    tooltip: createLogger('tooltip'),
    video: createLogger('video'),
    timeline: createLogger('timeline'),
    timelineHook: createLogger('timelineHook'),
    chat: createLogger('chat'),
    scroll: createLogger('scroll'),
    traffic: createLogger('traffic'),
    trends: createLogger('trends'),
    canvas: createLogger('canvas'),
    context: createLogger('context'),

    // Grouped logging for complex debugging sessions
    tooltipGroup: createGroupLogger('tooltip'),
    chatGroup: createGroupLogger('chat'),
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
