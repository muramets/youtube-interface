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
const DEBUG_ENABLED = {
    tooltip: false,      // PortalTooltip positioning and render state
    video: false,        // VideoPreviewTooltip resize events
    timeline: false,     // TimelineVideoLayer hover events
    timelineHook: false, // useTimelineTooltip state changes
    dots: false,         // TimelineDotsLayer hover detection
} as const;

type DebugCategory = keyof typeof DEBUG_ENABLED;

/**
 * Creates a debug logger for a specific category.
 * Returns a no-op function in production or when category is disabled.
 */
const createLogger = (category: DebugCategory) => {
    // In production, return no-op function (will be tree-shaken)
    if (!import.meta.env.DEV) {
        return (..._args: unknown[]) => { };
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
            start: (_label: string) => { },
            log: (..._args: unknown[]) => { },
            end: () => { },
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

    // Grouped logging for complex debugging sessions
    tooltipGroup: createGroupLogger('tooltip'),
};

// Export type for extending categories
export type { DebugCategory };
