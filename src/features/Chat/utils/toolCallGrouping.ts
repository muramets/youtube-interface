// =============================================================================
// Tool Call Grouping — pure utility for aggregating ToolCallRecord arrays
//
// Separation of concerns: ToolCallSummary = presentation,
// toolRegistry = config (icons, labels, extractors),
// this module = pure data transformation (grouping, expandability, quota).
// =============================================================================

import type { ToolCallRecord } from '../../../core/types/chat/chat';
import { getToolConfig } from './toolRegistry';

// --- Types ---

export interface ToolCallGroup {
    toolName: string;
    records: ToolCallRecord[];
    videoIds: string[];
    allResolved: boolean;
    hasErrors: boolean;
    /** True when any unresolved record is in "preparing" state (model generating tool JSON). */
    preparing: boolean;
}

// --- Grouping ---

/** Group tool call records by tool name and extract video IDs. */
export function groupToolCalls(toolCalls: Array<ToolCallRecord & { preparing?: boolean }>): ToolCallGroup[] {
    const map = new Map<string, Array<ToolCallRecord & { preparing?: boolean }>>();

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
        const config = getToolConfig(toolName);
        const videoIds = config?.extractVideoIds?.(records) ?? [];

        groups.push({
            toolName,
            records,
            videoIds,
            allResolved: records.every(r => r.result !== undefined),
            hasErrors: records.some(r => r.result?.error != null),
            preparing: records.some(r => !r.result && r.preparing === true),
        });
    }

    return groups;
}

// --- Labels ---

/** Get the consolidated label for a tool call group. Registry-driven with fallback. */
export function getGroupLabel(group: ToolCallGroup): string {
    const config = getToolConfig(group.toolName);
    if (!config) {
        return group.allResolved ? group.toolName : `Running ${group.toolName}...`;
    }

    const { labels } = config;
    if (group.hasErrors) return labels.error;

    if (!group.allResolved) {
        if (group.preparing && labels.preparing) return labels.preparing;
        return typeof labels.loading === 'function' ? labels.loading(group) : labels.loading;
    }

    return typeof labels.done === 'function' ? labels.done(group) : labels.done;
}

// --- Expandability ---

/** Whether a group should be expandable (has video previews, stats, or inline content). */
export function isExpandable(group: ToolCallGroup): boolean {
    const config = getToolConfig(group.toolName);
    if (!config?.hasExpandableContent) return false;
    if (config.inlineExpand) return group.allResolved;
    return group.allResolved && (group.videoIds.length > 0 || !!config.StatsComponent);
}

/** Whether a group is thumbnail-related (drives amber color scheme). */
export function isThumbnailTool(group: ToolCallGroup): boolean {
    return group.toolName === 'viewThumbnails';
}

// --- Quota ---

/** Extract total quotaUsed from all records in a group. */
export function getGroupQuota(group: ToolCallGroup): number {
    let total = 0;
    for (const r of group.records) {
        const q = r.result?.quotaUsed;
        if (typeof q === 'number') total += q;
    }
    return total;
}
