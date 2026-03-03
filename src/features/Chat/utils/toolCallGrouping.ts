// =============================================================================
// Tool Call Grouping — pure utility for aggregating ToolCallRecord arrays
//
// Separation of concerns: ToolCallSummary = presentation,
// this module = pure data transformation (grouping, extraction, labeling).
// =============================================================================

import type { ToolCallRecord } from '../../../core/types/chat';

// --- Types ---

export interface ToolCallGroup {
    toolName: string;
    records: ToolCallRecord[];
    videoIds: string[];
    allResolved: boolean;
    hasErrors: boolean;
}

// --- Grouping ---

/** Group tool call records by tool name and extract video IDs. */
export function groupToolCalls(toolCalls: ToolCallRecord[]): ToolCallGroup[] {
    const map = new Map<string, ToolCallRecord[]>();

    for (const tc of toolCalls) {
        const existing = map.get(tc.name);
        if (existing) {
            existing.push(tc);
        } else {
            map.set(tc.name, [tc]);
        }
    }

    const groups: ToolCallGroup[] = [];

    for (const [toolName, records] of map) {
        const videoIds = toolName === 'mentionVideo'
            ? extractMentionVideoIds(records)
            : toolName === 'getMultipleVideoDetails'
                ? extractDetailVideoIds(records)
                : [];

        groups.push({
            toolName,
            records,
            videoIds,
            allResolved: records.every(r => r.result !== undefined),
            hasErrors: records.some(r => r.result?.error != null),
        });
    }

    return groups;
}

// --- Video ID extraction ---

/** Extract unique video IDs from mentionVideo tool call records. */
export function extractMentionVideoIds(records: ToolCallRecord[]): string[] {
    const ids: string[] = [];
    for (const r of records) {
        const id = r.args.videoId as string | undefined;
        if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
}

/** Extract unique video IDs from getMultipleVideoDetails tool call records. */
export function extractDetailVideoIds(records: ToolCallRecord[]): string[] {
    const ids: string[] = [];
    for (const r of records) {
        const videoIds = r.args.videoIds as string[] | undefined;
        if (videoIds) {
            for (const id of videoIds) {
                if (!ids.includes(id)) ids.push(id);
            }
        }
    }
    return ids;
}

// --- Labels ---

/** Get the consolidated label for a tool call group. */
export function getGroupLabel(group: ToolCallGroup): string {
    const count = group.videoIds.length || group.records.length;

    if (group.toolName === 'mentionVideo') {
        if (group.hasErrors) return 'Video not found';

        // Single video with title — show inline
        if (count === 1 && group.allResolved) {
            const title = group.records[0]?.result?.title as string | undefined;
            if (title) return `Mentioned: "${title}"`;
        }

        return group.allResolved
            ? `Mentioned ${count} ${pluralVideos(count)}`
            : `Searching for ${count === 1 ? 'video' : `${count} ${pluralVideos(count)}`}...`;
    }

    if (group.toolName === 'getMultipleVideoDetails') {
        if (group.hasErrors) return "Couldn't load details";
        return group.allResolved
            ? `Loaded details for ${count} ${pluralVideos(count)}`
            : `Loading video details...`;
    }

    if (group.toolName === 'analyzeSuggestedTraffic') {
        if (group.hasErrors) return "Couldn't analyze suggested traffic";
        return group.allResolved
            ? 'Suggested Traffic Analysis'
            : 'Analyzing suggested traffic...';
    }

    // Fallback for unknown tools
    return group.allResolved ? group.toolName : `Running ${group.toolName}...`;
}

/** Whether a group should be expandable (has video previews to show, or has result details). */
export function isExpandable(group: ToolCallGroup): boolean {
    if (group.videoIds.length > 0) return true;
    // Analysis tools are expandable when resolved (show summary stats)
    if (group.toolName === 'analyzeSuggestedTraffic' && group.allResolved) return true;
    return false;
}

// --- Helpers ---

function pluralVideos(count: number): string {
    return count === 1 ? 'video' : 'videos';
}
