// =============================================================================
// Tool Registry — single source of truth for tool presentation config.
//
// Each tool entry co-locates: icon, color, labels, video ID extraction,
// stats component, and expandability. Adding a new tool = one entry here.
//
// Consumed by: ToolCallSummary (rendering), toolCallGrouping (labels, videoIds).
// =============================================================================

import type { LucideIcon } from 'lucide-react';
import { Images, Globe, PieChart, Users, TrendingUp, Telescope, Search, BarChart3, MessageSquare, BookOpen, Brain } from 'lucide-react';
import type React from 'react';
import type { ToolCallRecord } from '../../../core/types/chat/chat';
import type { VideoPreviewData } from '../../Video/types';
import type { ToolCallGroup } from './toolCallGrouping';
import {
    AnalysisStats,
    TrafficSourceStats,
    ChannelOverviewStats,
    BrowseChannelStats,
    TrendChannelsStats,
    BrowseTrendStats,
    NicheSnapshotStats,
    FindSimilarStats,
    SearchDatabaseStats,
    SaveKnowledgeRecord,
    EditKnowledgeRecord,
    SaveMemoryRecord,
    EditMemoryRecord,
    ListKnowledgeStats,
    GetKnowledgeStats,
} from '../components/toolStats';

// --- Types ---

export type ToolColor = 'indigo' | 'amber' | 'emerald' | 'accent' | 'muted';

export interface ToolLabels {
    error: string;
    loading: string | ((group: ToolCallGroup) => string);
    preparing?: string;
    done: string | ((group: ToolCallGroup) => string);
}

export interface ToolConfig {
    /** Lucide icon component, or string literal (e.g. '@' for mentionVideo). */
    icon: LucideIcon | string;
    /** Color scheme for the pill. Static ToolColor or dynamic function based on group state. */
    color: ToolColor | ((group: ToolCallGroup) => ToolColor);
    /** Label text for each pill state (error, loading, done). */
    labels: ToolLabels;
    /** Optional stats component rendered in expanded view (receives first record's result). */
    StatsComponent?: React.FC<{ result: Record<string, unknown>; videoMap?: Map<string, VideoPreviewData> }>;
    /** Optional per-record component for expanded view (renders once per record in group). */
    RecordComponent?: React.FC<{ record: ToolCallRecord; videoMap?: Map<string, VideoPreviewData> }>;
    /** Whether this tool has expandable content (stats, records, or video list). */
    hasExpandableContent: boolean;
    /** Extract video IDs from tool call records for expanded preview list. */
    extractVideoIds?: (records: ToolCallRecord[]) => string[];
    /** Sort videos in expanded view by this field (default: preserve backend order). */
    sortVideosBy?: 'views';
    /** Sort channels in stats component by this field (default: preserve backend order). */
    sortChannelsBy?: 'averageViews';
    /** When true, each tool call gets its own pill instead of grouping by tool name. */
    separatePills?: boolean;
    /** When true, RecordComponent handles error state internally (renders error UI). */
    handlesErrors?: boolean;
}

// --- Video ID extraction helpers ---

/** Extract unique video IDs from a result array field (e.g. result.videos[].videoId). */
function fromResultField(field: string): (records: ToolCallRecord[]) => string[] {
    return (records) => {
        const ids: string[] = [];
        for (const r of records) {
            const items = r.result?.[field] as Array<{ videoId: string }> | undefined;
            if (items) {
                for (const item of items) {
                    if (item.videoId && !ids.includes(item.videoId)) ids.push(item.videoId);
                }
            }
        }
        return ids;
    };
}

/** Extract unique video IDs from a single-value args field (e.g. args.videoId). */
function fromArgsSingle(field: string): (records: ToolCallRecord[]) => string[] {
    return (records) => {
        const ids: string[] = [];
        for (const r of records) {
            const id = r.args[field] as string | undefined;
            if (id && !ids.includes(id)) ids.push(id);
        }
        return ids;
    };
}

/** Extract unique video IDs from an array args field (e.g. args.videoIds). */
function fromArgsArray(field: string): (records: ToolCallRecord[]) => string[] {
    return (records) => {
        const ids: string[] = [];
        for (const r of records) {
            const items = r.args[field] as string[] | undefined;
            if (items) {
                for (const id of items) {
                    if (!ids.includes(id)) ids.push(id);
                }
            }
        }
        return ids;
    };
}

// --- Helpers ---

function plural(count: number, singular: string, pluralForm: string): string {
    return count === 1 ? singular : pluralForm;
}

/** Dynamic color factory: returns base color when results present, 'muted' when empty. */
function emptyAwareColor(
    base: ToolColor,
    isEmpty: (group: ToolCallGroup) => boolean,
): (group: ToolCallGroup) => ToolColor {
    return (group) => isEmpty(group) ? 'muted' : base;
}

// --- Registry ---

const TOOL_REGISTRY: Record<string, ToolConfig> = {
    mentionVideo: {
        icon: '@',
        color: 'indigo',
        hasExpandableContent: true,
        extractVideoIds: fromArgsSingle('videoId'),
        labels: {
            error: 'Video not found',
            loading: (group) => {
                const count = group.videoIds.length || group.records.length;
                return `Searching for ${count === 1 ? 'video' : `${count} videos`}...`;
            },
            done: (group) => {
                const count = group.videoIds.length || group.records.length;
                if (count === 1 && group.records[0]?.result?.title) {
                    return `Mentioned: "${group.records[0].result.title as string}"`;
                }
                return `Mentioned ${count} ${plural(count, 'video', 'videos')}`;
            },
        },
    },
    getMultipleVideoDetails: {
        icon: BarChart3,
        color: 'emerald',
        hasExpandableContent: true,
        extractVideoIds: (records) => {
            const ids: string[] = [];
            for (const r of records) {
                // After resolution: use result.videos (only found — no hallucinated IDs)
                const resultVideos = r.result?.videos as Array<{ videoId: string }> | undefined;
                if (resultVideos?.length) {
                    for (const v of resultVideos) {
                        if (v.videoId && !ids.includes(v.videoId)) ids.push(v.videoId);
                    }
                } else if (!r.result) {
                    // During loading: fall back to args.videoIds for immediate feedback
                    const videoIds = r.args.videoIds as string[] | undefined;
                    if (videoIds) {
                        for (const id of videoIds) {
                            if (!ids.includes(id)) ids.push(id);
                        }
                    }
                }
            }
            return ids;
        },
        labels: {
            error: "Couldn't load details",
            loading: 'Loading video details...',
            done: (group) => {
                const count = group.videoIds.length || group.records.length;
                return `Loaded details for ${count} ${plural(count, 'video', 'videos')}`;
            },
        },
    },
    viewThumbnails: {
        icon: Images,
        color: 'amber',
        hasExpandableContent: true,
        extractVideoIds: fromArgsArray('videoIds'),
        labels: {
            error: "Couldn't load thumbnails",
            loading: 'Loading thumbnails...',
            done: (group) => {
                const count = group.videoIds.length || group.records.length;
                return `Viewed ${count} ${plural(count, 'thumbnail', 'thumbnails')}`;
            },
        },
    },
    analyzeSuggestedTraffic: {
        icon: TrendingUp,
        color: 'emerald',
        StatsComponent: AnalysisStats,
        hasExpandableContent: true,
        labels: {
            error: "Couldn't analyze suggested traffic",
            loading: 'Analyzing suggested traffic...',
            done: 'Suggested Traffic Analysis',
        },
    },
    analyzeTrafficSources: {
        icon: PieChart,
        color: 'emerald',
        StatsComponent: TrafficSourceStats,
        hasExpandableContent: true,
        labels: {
            error: "Couldn't analyze traffic sources",
            loading: 'Analyzing traffic sources...',
            done: 'Traffic Source Analysis',
        },
    },
    getChannelOverview: {
        icon: Globe,
        color: 'emerald',
        StatsComponent: ChannelOverviewStats,
        hasExpandableContent: true,
        labels: {
            error: "Couldn't load channel info",
            loading: 'Loading channel info...',
            done: (group) => {
                const channelTitle = group.records[0]?.result?.channelTitle as string ?? '';
                return channelTitle ? `Channel: ${channelTitle}` : 'Channel info loaded';
            },
        },
    },
    browseChannelVideos: {
        icon: Globe,
        color: emptyAwareColor('emerald', (g) => {
            const r = g.records[g.records.length - 1]?.result;
            return (r?.videos as unknown[] | undefined)?.length === 0;
        }),
        StatsComponent: BrowseChannelStats,
        hasExpandableContent: true,
        labels: {
            error: "Couldn't browse channel",
            loading: 'Browsing channel...',
            done: (group) => {
                const result = group.records[group.records.length - 1]?.result;
                const videoCount = (result?.videos as unknown[] | undefined)?.length;
                return videoCount != null ? `Browsed ${videoCount} videos` : 'Channel videos loaded';
            },
        },
    },
    listTrendChannels: {
        icon: Users,
        color: emptyAwareColor('emerald', (g) => (g.records[0]?.result?.totalChannels as number) === 0),
        StatsComponent: TrendChannelsStats,
        hasExpandableContent: true,
        sortChannelsBy: 'averageViews',
        labels: {
            error: "Couldn't load trend channels",
            loading: 'Loading competitor channels...',
            done: (group) => {
                const totalChannels = group.records[0]?.result?.totalChannels as number | undefined;
                return totalChannels ? `${totalChannels} tracked channels` : 'Competitor channels loaded';
            },
        },
    },
    browseTrendVideos: {
        icon: TrendingUp,
        color: emptyAwareColor('emerald', (g) => {
            const r = g.records[g.records.length - 1]?.result;
            return (r?.totalMatched as number) === 0;
        }),
        StatsComponent: BrowseTrendStats,
        hasExpandableContent: true,
        extractVideoIds: fromResultField('videos'),
        labels: {
            error: "Couldn't browse trend videos",
            loading: 'Browsing competitor videos...',
            done: (group) => {
                const result = group.records[group.records.length - 1]?.result;
                const totalMatched = result?.totalMatched as number | undefined;
                const videoCount = (result?.videos as unknown[] | undefined)?.length;
                if (totalMatched != null && videoCount != null) {
                    return totalMatched > videoCount
                        ? `${videoCount} of ${totalMatched} competitor videos`
                        : `${totalMatched} competitor ${plural(totalMatched, 'video', 'videos')}`;
                }
                return 'Competitor videos loaded';
            },
        },
    },
    getNicheSnapshot: {
        icon: Telescope,
        color: emptyAwareColor('emerald', (g) => {
            const agg = g.records[0]?.result?.aggregates as Record<string, unknown> | undefined;
            return (agg?.totalVideosInWindow as number) === 0;
        }),
        StatsComponent: NicheSnapshotStats,
        hasExpandableContent: true,
        sortVideosBy: 'views',
        extractVideoIds: (records) => {
            const ids: string[] = [];
            for (const r of records) {
                const activity = r.result?.competitorActivity as Array<{ videos: Array<{ videoId: string }> }> | undefined;
                if (activity) {
                    for (const ch of activity) {
                        for (const v of ch.videos) {
                            if (v.videoId && !ids.includes(v.videoId)) ids.push(v.videoId);
                        }
                    }
                }
            }
            return ids;
        },
        labels: {
            error: "Couldn't load niche snapshot",
            loading: 'Analyzing niche activity...',
            done: (group) => {
                const total = (group.records[0]?.result?.aggregates as Record<string, unknown>)?.totalVideosInWindow as number | undefined;
                return total != null ? `Niche snapshot: ${total} videos` : 'Niche snapshot loaded';
            },
        },
    },
    findSimilarVideos: {
        icon: Search,
        color: emptyAwareColor('emerald', (g) => (g.records[0]?.result?.similar as unknown[] | undefined)?.length === 0),
        StatsComponent: FindSimilarStats,
        hasExpandableContent: true,
        extractVideoIds: fromResultField('similar'),
        labels: {
            error: "Couldn't find similar videos",
            loading: 'Searching for similar videos...',
            done: (group) => {
                const result = group.records[0]?.result;
                const similarCount = (result?.similar as unknown[] | undefined)?.length;
                const mode = result?.mode as string | undefined;
                const modeLabel = mode === 'packaging' ? ' by topic' : '';
                return similarCount != null
                    ? `${similarCount} similar ${plural(similarCount, 'video', 'videos')}${modeLabel}`
                    : 'Similar videos found';
            },
        },
    },
    searchDatabase: {
        icon: Search,
        color: emptyAwareColor('emerald', (g) => (g.records[0]?.result?.results as unknown[] | undefined)?.length === 0),
        StatsComponent: SearchDatabaseStats,
        hasExpandableContent: true,
        extractVideoIds: fromResultField('results'),
        labels: {
            error: "Couldn't search database",
            loading: 'Searching database...',
            done: (group) => {
                const result = group.records[0]?.result;
                const resultCount = (result?.results as unknown[] | undefined)?.length;
                const query = result?.query as string | undefined;
                if (resultCount != null && query) return `${resultCount} results for "${query}"`;
                return resultCount != null
                    ? `${resultCount} search ${plural(resultCount, 'result', 'results')}`
                    : 'Database search complete';
            },
        },
    },
    getVideoComments: {
        icon: MessageSquare,
        color: emptyAwareColor('emerald', (g) => (g.records[0]?.result?.fetchedCount as number) === 0),
        hasExpandableContent: false,
        extractVideoIds: fromArgsSingle('videoId'),
        labels: {
            error: "Couldn't load comments",
            loading: 'Reading comments...',
            done: (group) => {
                const fetchedCount = group.records[0]?.result?.fetchedCount as number | undefined;
                return fetchedCount != null ? `${fetchedCount} comments loaded` : 'Comments loaded';
            },
        },
    },
    saveKnowledge: {
        icon: BookOpen,
        color: 'emerald',
        RecordComponent: SaveKnowledgeRecord,
        hasExpandableContent: true,
        labels: {
            error: "Couldn't save knowledge",
            loading: 'Saving knowledge...',
            done: (group) => {
                const savedCount = group.records.filter(r => !r.result?.skipped).length;
                const skippedCount = group.records.length - savedCount;
                const parts: string[] = [];
                if (savedCount > 0) parts.push(`${savedCount} saved`);
                if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
                return `Knowledge: ${parts.join(', ')}`;
            },
        },
    },
    editKnowledge: {
        icon: BookOpen,
        color: 'emerald',
        RecordComponent: EditKnowledgeRecord,
        hasExpandableContent: true,
        separatePills: true,
        handlesErrors: true,
        labels: {
            error: "Couldn't edit knowledge",
            loading: 'Editing knowledge...',
            preparing: 'Editing knowledge...',
            done: (group) => {
                const title = group.records[0]?.result?.title as string | undefined;
                return title ? `Edited: "${title}"` : 'Knowledge updated';
            },
        },
    },
    listKnowledge: {
        icon: BookOpen,
        color: emptyAwareColor('emerald', (g) => {
            const r = g.records[0]?.result;
            return (r?.count as number) === 0 || (r?.items as unknown[] | undefined)?.length === 0;
        }),
        StatsComponent: ListKnowledgeStats,
        hasExpandableContent: true,
        labels: {
            error: "Couldn't load knowledge",
            loading: 'Loading knowledge...',
            done: (group) => {
                const result = group.records[0]?.result;
                const count = (result?.count as number | undefined)
                    ?? (result?.items as unknown[] | undefined)?.length;
                if (count == null) return 'Knowledge checked';
                if (count === 0) return 'No existing KI';
                if (count === 1) {
                    const title = (result?.items as Array<{ title: string }> | undefined)?.[0]?.title;
                    return title ? `Listed KI: "${title}"` : '1 existing KI';
                }
                return `Listed ${count} existing KI`;
            },
        },
    },
    getKnowledge: {
        icon: BookOpen,
        color: emptyAwareColor('emerald', (g) => {
            const r = g.records[0]?.result;
            return (r?.count as number) === 0 || (r?.items as unknown[] | undefined)?.length === 0;
        }),
        StatsComponent: GetKnowledgeStats,
        hasExpandableContent: true,
        labels: {
            error: "Couldn't read knowledge",
            loading: 'Reading knowledge...',
            done: (group) => {
                const result = group.records[0]?.result;
                const count = result?.count as number | undefined;
                const items = result?.items as Array<{ title: string }> | undefined;
                if (count == null && !items?.length) return 'Knowledge read';
                if (count === 0 || items?.length === 0) return 'No KI found';
                const n = count ?? items?.length ?? 0;
                if (n === 1) {
                    const title = items?.[0]?.title;
                    return title ? `Read KI: "${title}"` : 'Read 1 KI';
                }
                return `Read ${n} KI`;
            },
        },
    },
    saveMemory: {
        icon: Brain,
        color: 'accent',
        RecordComponent: SaveMemoryRecord,
        hasExpandableContent: true,
        labels: {
            error: "Couldn't save memory",
            loading: 'Saving memory...',
            done: 'Memory saved',
        },
    },
    editMemory: {
        icon: Brain,
        color: 'accent',
        RecordComponent: EditMemoryRecord,
        hasExpandableContent: true,
        separatePills: true,
        handlesErrors: true,
        labels: {
            error: "Couldn't edit memory",
            loading: 'Editing memory...',
            preparing: 'Editing memory...',
            done: (group) => {
                const title = group.records[0]?.result?.memoryTitle as string | undefined;
                return title ? `Edited: "${title}"` : 'Memory updated';
            },
        },
    },
};

// --- API ---

/** Look up the presentation config for a tool by name. Returns undefined for unknown tools. */
export function getToolConfig(toolName: string): ToolConfig | undefined {
    return TOOL_REGISTRY[toolName];
}
