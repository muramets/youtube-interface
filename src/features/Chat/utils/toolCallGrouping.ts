// =============================================================================
// Tool Call Grouping — pure utility for aggregating ToolCallRecord arrays
//
// Separation of concerns: ToolCallSummary = presentation,
// this module = pure data transformation (grouping, extraction, labeling).
// =============================================================================

import type { ToolCallRecord } from '../../../core/types/chat/chat';

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
        const videoIds = extractVideoIdsForTool(toolName, records);

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

/** Route to the correct video ID extractor by tool name. */
function extractVideoIdsForTool(toolName: string, records: ToolCallRecord[]): string[] {
    switch (toolName) {
        case 'mentionVideo': return extractMentionVideoIds(records);
        case 'getMultipleVideoDetails': return extractDetailVideoIds(records);
        case 'viewThumbnails': return extractViewThumbnailVideoIds(records);
        case 'browseTrendVideos': return extractResultVideoIds(records);
        case 'getNicheSnapshot': return extractNicheSnapshotVideoIds(records);
        case 'findSimilarVideos': return extractSimilarVideoIds(records);
        case 'getVideoComments': return extractCommentVideoIds(records);
        default: return [];
    }
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

/** Extract unique video IDs from viewThumbnails tool call records. */
export function extractViewThumbnailVideoIds(records: ToolCallRecord[]): string[] {
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

/** Extract unique video IDs from Layer 4 tool results (result.videos[].videoId). */
function extractResultVideoIds(records: ToolCallRecord[]): string[] {
    const ids: string[] = [];
    for (const r of records) {
        const videos = r.result?.videos as Array<{ videoId: string }> | undefined;
        if (videos) {
            for (const v of videos) {
                if (v.videoId && !ids.includes(v.videoId)) ids.push(v.videoId);
            }
        }
    }
    return ids;
}

/** Extract unique video IDs from findSimilarVideos results (result.similar[].videoId). */
function extractSimilarVideoIds(records: ToolCallRecord[]): string[] {
    const ids: string[] = [];
    for (const r of records) {
        const similar = r.result?.similar as Array<{ videoId: string }> | undefined;
        if (similar) {
            for (const v of similar) {
                if (v.videoId && !ids.includes(v.videoId)) ids.push(v.videoId);
            }
        }
    }
    return ids;
}

/** Extract unique video IDs from getVideoComments args (single videoId per call). */
function extractCommentVideoIds(records: ToolCallRecord[]): string[] {
    const ids: string[] = [];
    for (const r of records) {
        const id = r.args.videoId as string | undefined;
        if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
}

/** Extract unique video IDs from getNicheSnapshot results (nested in competitorActivity). */
function extractNicheSnapshotVideoIds(records: ToolCallRecord[]): string[] {
    const ids: string[] = [];
    for (const r of records) {
        const activity = r.result?.competitorActivity as Array<{ videos: Array<{ videoId: string }> }> | undefined;
        if (activity) {
            for (const channel of activity) {
                for (const v of channel.videos) {
                    if (v.videoId && !ids.includes(v.videoId)) ids.push(v.videoId);
                }
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

    if (group.toolName === 'viewThumbnails') {
        if (group.hasErrors) return "Couldn't load thumbnails";
        return group.allResolved
            ? `Viewed ${count} ${count === 1 ? 'thumbnail' : 'thumbnails'}`
            : `Loading thumbnails...`;
    }

    if (group.toolName === 'getChannelOverview') {
        if (group.hasErrors) return "Couldn't load channel info";
        if (!group.allResolved) return 'Loading channel info...';
        const result = group.records[0]?.result;
        const channelTitle = result?.channelTitle as string ?? '';
        return channelTitle ? `Channel: ${channelTitle}` : 'Channel info loaded';
    }

    if (group.toolName === 'browseChannelVideos') {
        if (group.hasErrors) return "Couldn't browse channel";
        if (!group.allResolved) return 'Browsing channel...';
        const result = group.records[group.records.length - 1]?.result;
        const videoCount = (result?.videos as unknown[] | undefined)?.length;
        if (videoCount != null) {
            return `Browsed ${videoCount} videos`;
        }
        return 'Channel videos loaded';
    }

    if (group.toolName === 'analyzeTrafficSources') {
        if (group.hasErrors) return "Couldn't analyze traffic sources";
        return group.allResolved
            ? 'Traffic Source Analysis'
            : 'Analyzing traffic sources...';
    }

    if (group.toolName === 'listTrendChannels') {
        if (group.hasErrors) return "Couldn't load trend channels";
        if (!group.allResolved) return 'Loading competitor channels...';
        const result = group.records[0]?.result;
        const totalChannels = result?.totalChannels as number | undefined;
        return totalChannels ? `${totalChannels} tracked channels` : 'Competitor channels loaded';
    }

    if (group.toolName === 'browseTrendVideos') {
        if (group.hasErrors) return "Couldn't browse trend videos";
        if (!group.allResolved) return 'Browsing competitor videos...';
        const result = group.records[group.records.length - 1]?.result;
        const totalMatched = result?.totalMatched as number | undefined;
        const videoCount = (result?.videos as unknown[] | undefined)?.length;
        if (totalMatched != null && videoCount != null) {
            return totalMatched > videoCount
                ? `${videoCount} of ${totalMatched} competitor videos`
                : `${totalMatched} competitor ${pluralVideos(totalMatched)}`;
        }
        return 'Competitor videos loaded';
    }

    if (group.toolName === 'getNicheSnapshot') {
        if (group.hasErrors) return "Couldn't load niche snapshot";
        if (!group.allResolved) return 'Analyzing niche activity...';
        const result = group.records[0]?.result;
        const total = (result?.aggregates as Record<string, unknown>)?.totalVideosInWindow as number | undefined;
        return total != null ? `Niche snapshot: ${total} videos` : 'Niche snapshot loaded';
    }

    if (group.toolName === 'findSimilarVideos') {
        if (group.hasErrors) return "Couldn't find similar videos";
        if (!group.allResolved) return 'Searching for similar videos...';
        const result = group.records[0]?.result;
        const similarCount = (result?.similar as unknown[] | undefined)?.length;
        const mode = result?.mode as string | undefined;
        const modeLabel = mode === 'packaging' ? 'by topic' : '';
        return similarCount != null
            ? `${similarCount} similar ${pluralVideos(similarCount)}${modeLabel ? ` ${modeLabel}` : ''}`
            : 'Similar videos found';
    }

    if (group.toolName === 'getVideoComments') {
        if (group.hasErrors) return "Couldn't load comments";
        if (!group.allResolved) return 'Reading comments...';
        const result = group.records[0]?.result;
        const fetchedCount = result?.fetchedCount as number | undefined;
        return fetchedCount != null
            ? `${fetchedCount} comments loaded`
            : 'Comments loaded';
    }

    // Fallback for unknown tools
    return group.allResolved ? group.toolName : `Running ${group.toolName}...`;
}

/** Whether a group should be expandable (has video previews to show, or has result details). */
export function isExpandable(group: ToolCallGroup): boolean {
    // Comments: not expandable in Stage 1 (no preview UI yet)
    if (group.toolName === 'getVideoComments') return false;
    if (group.videoIds.length > 0) return true;
    // Analysis tools are expandable when resolved (show summary stats)
    if (group.toolName === 'analyzeSuggestedTraffic' && group.allResolved) return true;
    if (group.toolName === 'analyzeTrafficSources' && group.allResolved) return true;
    if (group.toolName === 'getChannelOverview' && group.allResolved) return true;
    if (group.toolName === 'browseChannelVideos' && group.allResolved) return true;
    if (group.toolName === 'listTrendChannels' && group.allResolved) return true;
    if (group.toolName === 'browseTrendVideos' && group.allResolved) return true;
    if (group.toolName === 'getNicheSnapshot' && group.allResolved) return true;
    if (group.toolName === 'findSimilarVideos' && group.allResolved) return true;
    return false;
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

// --- Helpers ---

function pluralVideos(count: number): string {
    return count === 1 ? 'video' : 'videos';
}
