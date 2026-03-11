// =============================================================================
// ToolCallSummary — consolidated pill display for tool calls in AI responses
//
// Orchestrator component. Tool presentation config lives in toolRegistry.ts,
// stats sub-components live in toolStats/.
// =============================================================================

import React, { useState } from 'react';
import { Loader2, Check, AlertCircle, ChevronDown } from 'lucide-react';
import type { ToolCallRecord } from '../../../core/types/chat/chat';
import type { VideoPreviewData } from '../../Video/types';
import { groupToolCalls, getGroupLabel, isExpandable, isThumbnailTool, getGroupQuota } from '../utils/toolCallGrouping';
import type { ToolCallGroup } from '../utils/toolCallGrouping';
import { getToolConfig } from '../utils/toolRegistry';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { VideoPreviewTooltip, PREVIEW_DIMENSIONS } from '../../Video/components/VideoPreviewTooltip';
import { formatViewCount } from '../../../core/utils/formatUtils';
import { ThumbnailGrid, QuotaBadge } from './toolStats';

// --- Types ---

/** ToolCallRecord extended with optional real-time progress (mirrors ActiveToolCall in chatStore). */
type ToolCallWithProgress = ToolCallRecord & { progressMessage?: string };

// --- Props ---

interface ToolCallSummaryProps {
    toolCalls: ToolCallWithProgress[];
    videoMap?: Map<string, VideoPreviewData>;
    isStreaming?: boolean;
}

// --- Color helpers ---

const COLOR_CLASSES: Record<string, string> = {
    indigo: 'bg-indigo-400/[0.08] text-indigo-400',
    amber: 'bg-amber-400/[0.08] text-amber-400',
    emerald: 'bg-emerald-500/[0.06] text-emerald-400',
};

// --- Sub-components ---

/** Single consolidated pill for a tool call group. */
const GroupPill: React.FC<{
    group: ToolCallGroup;
    videoMap?: Map<string, VideoPreviewData>;
    /** Real-time progress message for the first unresolved call in this group. */
    progressMessage?: string;
}> = ({ group, videoMap, progressMessage }) => {
    const [expanded, setExpanded] = useState(false);

    // Show progressMessage when the group is still pending (not all resolved) and one is available
    const label = (!group.allResolved && progressMessage) ? progressMessage : getGroupLabel(group);
    const expandable = isExpandable(group);

    const config = getToolConfig(group.toolName);
    const colorClass = config ? COLOR_CLASSES[config.color] ?? COLOR_CLASSES.emerald : COLOR_CLASSES.emerald;

    const stateClasses = group.hasErrors
        ? 'bg-red-500/[0.06] text-red-400'
        : group.allResolved
            ? colorClass
            : 'bg-blue-400/[0.06] text-blue-400';

    // Status icon — specialized icons per tool when resolved, fallback to status indicators
    const renderIcon = () => {
        if (group.hasErrors) return <AlertCircle size={12} className="shrink-0" />;
        if (!group.allResolved) return <Loader2 size={12} className="shrink-0 animate-spin" />;

        // Resolved — use registry icon
        if (config) {
            if (typeof config.icon === 'string') {
                return <span className="text-[12px] font-semibold shrink-0">{config.icon}</span>;
            }
            const Icon = config.icon;
            return <Icon size={12} className="shrink-0" />;
        }

        return <Check size={12} className="shrink-0" />;
    };

    // Determine which result to pass to StatsComponent
    const getStatsResult = (): Record<string, unknown> | null => {
        if (!config?.StatsComponent || !group.allResolved || group.hasErrors) return null;
        // browseChannelVideos & browseTrendVideos use last record (paginated)
        const useLast = group.toolName === 'browseChannelVideos' || group.toolName === 'browseTrendVideos';
        const record = useLast ? group.records[group.records.length - 1] : group.records[0];
        return record?.result ?? null;
    };

    const StatsComponent = config?.StatsComponent;
    const statsResult = getStatsResult();

    return (
        <div className="flex flex-col items-start max-w-full">
            <button
                type="button"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] leading-tight max-w-full overflow-hidden transition-colors duration-200 ${stateClasses} ${expandable ? 'cursor-pointer hover:brightness-125' : 'cursor-default'} ${!group.allResolved ? 'animate-stream-pulse' : ''}`}
                onClick={() => expandable && setExpanded(v => !v)}
                disabled={!expandable}
            >
                {renderIcon()}
                <span className="truncate">{label}</span>
                {group.allResolved && <QuotaBadge quota={getGroupQuota(group)} />}
                {expandable && group.allResolved && (
                    <ChevronDown
                        size={10}
                        className={`shrink-0 opacity-50 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                    />
                )}
            </button>

            {/* Expanded content */}
            {expanded && group.allResolved && !group.hasErrors && (
                <div className="mt-1.5 flex flex-col gap-1 w-full">
                    {/* Stats component from registry */}
                    {StatsComponent && statsResult && <StatsComponent result={statsResult} />}
                    {/* Thumbnail tool: image grid */}
                    {isThumbnailTool(group) && <ThumbnailGrid group={group} />}
                    {/* Video-based tools: video preview list (skip for thumbnails — ThumbnailGrid above already shows them) */}
                    {!isThumbnailTool(group) && group.videoIds.map(videoId => {
                        const video = videoMap?.get(videoId);

                        const row = (
                            <div
                                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] cursor-default hover:bg-white/[0.06] transition-colors min-w-0 overflow-hidden"
                            >
                                {video?.thumbnailUrl ? (
                                    <img
                                        src={video.thumbnailUrl}
                                        alt=""
                                        className="w-14 h-8 object-cover rounded flex-shrink-0"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-14 h-8 rounded bg-white/[0.06] flex-shrink-0" />
                                )}
                                <div className="min-w-0 flex flex-col gap-0.5">
                                    <span className="text-text-primary truncate leading-tight">
                                        {video?.title || videoId}
                                    </span>
                                    {video?.viewCount != null && (
                                        <span className="text-[10px] text-text-tertiary">
                                            {formatViewCount(video.viewCount)} views
                                        </span>
                                    )}
                                </div>
                            </div>
                        );

                        // Wrap in tooltip if we have full video data
                        if (video) {
                            return (
                                <PortalTooltip
                                    key={videoId}
                                    content={<VideoPreviewTooltip video={video} mode="mini" />}
                                    variant="glass"
                                    side="top"
                                    align="center"
                                    sizeMode="fixed"
                                    fixedDimensions={PREVIEW_DIMENSIONS.mini}
                                    enterDelay={300}
                                    triggerClassName="!justify-start w-full"
                                >
                                    {row}
                                </PortalTooltip>
                            );
                        }

                        return <div key={videoId}>{row}</div>;
                    })}
                </div>
            )}
        </div>
    );
};

// --- Main Component ---

export const ToolCallSummary: React.FC<ToolCallSummaryProps> = React.memo(({
    toolCalls,
    videoMap,
}) => {
    if (!toolCalls || toolCalls.length === 0) return null;

    const groups = groupToolCalls(toolCalls);

    // Build a map from toolName -> first progressMessage from unresolved calls
    const progressMap = new Map<string, string>();
    for (const tc of toolCalls) {
        if (!tc.result && tc.progressMessage && !progressMap.has(tc.name)) {
            progressMap.set(tc.name, tc.progressMessage);
        }
    }

    // Render order: getMultipleVideoDetails first (data fetch), then mentionVideo (references)
    const sorted = [...groups].sort((a, b) => {
        if (a.toolName === 'getMultipleVideoDetails') return -1;
        if (b.toolName === 'getMultipleVideoDetails') return 1;
        return 0;
    });

    return (
        <div className="flex flex-wrap gap-1.5 mb-2">
            {sorted.map(group => (
                <GroupPill
                    key={group.toolName}
                    group={group}
                    videoMap={videoMap}
                    progressMessage={progressMap.get(group.toolName)}
                />
            ))}
        </div>
    );
});
ToolCallSummary.displayName = 'ToolCallSummary';
