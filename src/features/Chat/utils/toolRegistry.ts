// =============================================================================
// Tool Registry — maps tool names to icons, colors, and stats components.
//
// Single source of truth for tool presentation config. Consumed by
// ToolCallSummary (icon/color rendering) and isExpandable() (expandability).
// =============================================================================

import type { LucideIcon } from 'lucide-react';
import { Images, Globe, PieChart, Users, TrendingUp, Telescope, Search, BarChart3, MessageSquare, BookOpen, Brain } from 'lucide-react';
import type React from 'react';
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
} from '../components/toolStats';

// --- Types ---

export type ToolColor = 'indigo' | 'amber' | 'emerald';

export interface ToolConfig {
    /** Lucide icon component, or string literal (e.g. '@' for mentionVideo). */
    icon: LucideIcon | string;
    /** Color scheme for the pill: indigo (references), amber (visual), emerald (data). */
    color: ToolColor;
    /** Optional stats component rendered in expanded view. */
    StatsComponent?: React.FC<{ result: Record<string, unknown> }>;
    /** Whether this tool has expandable content (stats or video list). */
    hasExpandableContent: boolean;
    /** Sort videos in expanded view by this field (default: preserve backend order). */
    sortVideosBy?: 'views';
    /** Sort channels in stats component by this field (default: preserve backend order). */
    sortChannelsBy?: 'averageViews';
}

// --- Registry ---

const TOOL_REGISTRY: Record<string, ToolConfig> = {
    mentionVideo: {
        icon: '@',
        color: 'indigo',
        hasExpandableContent: true,
    },
    getMultipleVideoDetails: {
        icon: BarChart3,
        color: 'emerald',
        hasExpandableContent: true,
    },
    viewThumbnails: {
        icon: Images,
        color: 'amber',
        hasExpandableContent: true,
    },
    analyzeSuggestedTraffic: {
        icon: TrendingUp,
        color: 'emerald',
        StatsComponent: AnalysisStats,
        hasExpandableContent: true,
    },
    analyzeTrafficSources: {
        icon: PieChart,
        color: 'emerald',
        StatsComponent: TrafficSourceStats,
        hasExpandableContent: true,
    },
    getChannelOverview: {
        icon: Globe,
        color: 'emerald',
        StatsComponent: ChannelOverviewStats,
        hasExpandableContent: true,
    },
    browseChannelVideos: {
        icon: Globe,
        color: 'emerald',
        StatsComponent: BrowseChannelStats,
        hasExpandableContent: true,
    },
    listTrendChannels: {
        icon: Users,
        color: 'emerald',
        StatsComponent: TrendChannelsStats,
        hasExpandableContent: true,
        sortChannelsBy: 'averageViews',
    },
    browseTrendVideos: {
        icon: TrendingUp,
        color: 'emerald',
        StatsComponent: BrowseTrendStats,
        hasExpandableContent: true,
    },
    getNicheSnapshot: {
        icon: Telescope,
        color: 'emerald',
        StatsComponent: NicheSnapshotStats,
        hasExpandableContent: true,
        sortVideosBy: 'views',
    },
    findSimilarVideos: {
        icon: Search,
        color: 'emerald',
        StatsComponent: FindSimilarStats,
        hasExpandableContent: true,
    },
    searchDatabase: {
        icon: Search,
        color: 'emerald',
        StatsComponent: SearchDatabaseStats,
        hasExpandableContent: true,
    },
    getVideoComments: {
        icon: MessageSquare,
        color: 'emerald',
        hasExpandableContent: false,
    },
    saveKnowledge: {
        icon: BookOpen,
        color: 'emerald',
        hasExpandableContent: true,
    },
    listKnowledge: {
        icon: BookOpen,
        color: 'emerald',
        hasExpandableContent: false,
    },
    getKnowledge: {
        icon: BookOpen,
        color: 'emerald',
        hasExpandableContent: false,
    },
    saveMemory: {
        icon: Brain,
        color: 'indigo',
        hasExpandableContent: true,
    },
};

// --- API ---

/** Look up the presentation config for a tool by name. Returns undefined for unknown tools. */
export function getToolConfig(toolName: string): ToolConfig | undefined {
    return TOOL_REGISTRY[toolName];
}
