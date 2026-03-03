// =============================================================================
// ToolCallSummary — consolidated pill display for tool calls in AI responses
//
// Replaces individual ToolCallBadge mapping. Groups tool calls by type and
// renders consolidated pills with expandable details.
//
// Pill types:
//   1. mentionVideo  → "Mentioned N videos" — which videos Gemini references
//   2. getMultipleVideoDetails → "Loaded details for N videos" — audit trail
//   3. analyzeSuggestedTraffic → "Suggested Traffic Analysis" — expandable stats
// =============================================================================

import React, { useState } from 'react';
import { Loader2, Check, AlertCircle, ChevronDown, BarChart3, TrendingUp } from 'lucide-react';
import type { ToolCallRecord } from '../../../core/types/chat';
import type { VideoCardContext } from '../../../core/types/appContext';
import { groupToolCalls, getGroupLabel, isExpandable } from '../utils/toolCallGrouping';
import type { ToolCallGroup } from '../utils/toolCallGrouping';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { VideoTooltipContent } from './VideoTooltipContent';
import { formatViewCount } from '../../../core/utils/formatUtils';

// --- Types ---

/** ToolCallRecord extended with optional real-time progress (mirrors ActiveToolCall in chatStore). */
type ToolCallWithProgress = ToolCallRecord & { progressMessage?: string };

// --- Props ---

interface ToolCallSummaryProps {
    toolCalls: ToolCallWithProgress[];
    videoMap?: Map<string, VideoCardContext>;
    isStreaming?: boolean;
}

// --- Sub-components ---

/** Compact stats for analyzeSuggestedTraffic expanded view. */
const AnalysisStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const timeline = result.snapshotTimeline as Array<{ date: string; label?: string; totalSources: number }> | undefined;
    const topSources = result.topSources as unknown[] | undefined;
    const tail = result.tail as { count: number } | undefined;
    const transitions = result.transitions as Array<{
        periodFromDate: string;
        periodToDate: string;
        newCount: number;
        droppedCount: number;
    }> | undefined;

    const snapshotCount = timeline?.length ?? 0;
    const totalSources = (topSources?.length ?? 0) + (tail?.count ?? 0);
    const topCount = topSources?.length ?? 0;

    // Derive depth label from topCount
    const depthLabel = topCount >= totalSources
        ? 'Full analysis'
        : topCount >= 100
            ? 'Detailed analysis'
            : topCount >= 50
                ? 'Standard analysis'
                : 'Quick analysis';

    // Build tooltip content for transitions timeline
    const tooltipContent = timeline && timeline.length > 0 ? (
        <div className="flex flex-col gap-1 text-[11px] text-text-secondary min-w-[200px]">
            <span className="text-[10px] text-text-tertiary font-medium mb-0.5">Timeline:</span>
            {timeline.map((snap, i) => {
                const transition = transitions && i > 0 ? transitions[i - 1] : null;
                return (
                    <div key={snap.date} className="flex items-baseline gap-1.5">
                        <span className="text-text-primary">
                            {snap.date}{snap.label ? ` (${snap.label})` : ''}:
                        </span>
                        <span>{snap.totalSources} sources</span>
                        {transition && (transition.newCount > 0 || transition.droppedCount > 0) && (
                            <span className="text-text-tertiary text-[10px]">
                                ({transition.newCount > 0 ? `+${transition.newCount} new` : ''}
                                {transition.newCount > 0 && transition.droppedCount > 0 ? ', ' : ''}
                                {transition.droppedCount > 0 ? `-${transition.droppedCount} dropped` : ''})
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    ) : null;

    const statsContent = (
        <div className="flex flex-col gap-1.5 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
                <BarChart3 size={11} className="shrink-0 opacity-60" />
                {snapshotCount} {snapshotCount === 1 ? 'snapshot' : 'snapshots'}
            </span>
            <span className="inline-flex items-center gap-1.5">
                <TrendingUp size={11} className="shrink-0 opacity-60" />
                {totalSources} active sources ({depthLabel.toLowerCase()}: top {topCount})
            </span>
        </div>
    );

    if (tooltipContent) {
        return (
            <PortalTooltip
                content={tooltipContent}
                side="top"
                align="left"
                maxWidth={320}
                enterDelay={200}
                triggerClassName="!justify-start w-full"
            >
                {statsContent}
            </PortalTooltip>
        );
    }

    return statsContent;
};

/** Single consolidated pill for a tool call group. */
const GroupPill: React.FC<{
    group: ToolCallGroup;
    videoMap?: Map<string, VideoCardContext>;
    /** Real-time progress message for the first unresolved call in this group. */
    progressMessage?: string;
}> = ({ group, videoMap, progressMessage }) => {
    const [expanded, setExpanded] = useState(false);

    // Show progressMessage when the group is still pending (not all resolved) and one is available
    const label = (!group.allResolved && progressMessage) ? progressMessage : getGroupLabel(group);
    const expandable = isExpandable(group);

    // Color scheme — mentionVideo uses indigo (matching inline mention highlight),
    // getMultipleVideoDetails uses emerald (audit trail)
    const isMention = group.toolName === 'mentionVideo';
    const stateClasses = group.hasErrors
        ? 'bg-red-500/[0.06] text-red-400'
        : group.allResolved
            ? isMention
                ? 'bg-indigo-400/[0.08] text-indigo-400'
                : 'bg-emerald-500/[0.06] text-emerald-400'
            : 'bg-blue-400/[0.06] text-blue-400';

    // Status icon
    const StatusIcon = group.hasErrors
        ? AlertCircle
        : group.allResolved
            ? Check
            : Loader2;

    return (
        <div className="flex flex-col items-start max-w-full">
            <button
                type="button"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] leading-tight max-w-full overflow-hidden transition-colors duration-200 ${stateClasses} ${expandable ? 'cursor-pointer hover:brightness-125' : 'cursor-default'} ${!group.allResolved ? 'animate-stream-pulse' : ''}`}
                onClick={() => expandable && setExpanded(v => !v)}
                disabled={!expandable}
            >
                {/* Status icon — @ for mentions, standard icons for others */}
                {isMention && group.allResolved && !group.hasErrors ? (
                    <span className="text-[12px] font-semibold shrink-0">@</span>
                ) : (
                    <StatusIcon
                        size={12}
                        className={`shrink-0 ${!group.allResolved && !group.hasErrors ? 'animate-spin' : ''}`}
                    />
                )}
                <span className="truncate">{label}</span>
                {expandable && group.allResolved && (
                    <ChevronDown
                        size={10}
                        className={`shrink-0 opacity-50 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                    />
                )}
            </button>

            {/* Expanded content */}
            {expanded && group.allResolved && (
                <div className="mt-1.5 flex flex-col gap-1 w-full">
                    {/* Analysis tool: compact stats summary */}
                    {group.toolName === 'analyzeSuggestedTraffic' && group.records[0]?.result && (
                        <AnalysisStats result={group.records[0].result} />
                    )}
                    {/* Video-based tools: video preview list */}
                    {group.videoIds.map(videoId => {
                        const video = videoMap?.get(videoId);
                        const fallbackTitle = getFallbackTitle(group, videoId);

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
                                        {video?.title || fallbackTitle || videoId}
                                    </span>
                                    {video?.viewCount && (
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
                                    content={<VideoTooltipContent video={video} />}
                                    side="top"
                                    align="center"
                                    maxWidth={320}
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

// --- Helpers ---

/** Extract a fallback title from tool result data when videoMap doesn't have it. */
function getFallbackTitle(group: ToolCallGroup, videoId: string): string | null {
    for (const record of group.records) {
        if (group.toolName === 'mentionVideo') {
            if (record.args.videoId === videoId && record.result?.title) {
                return record.result.title as string;
            }
        }
        if (group.toolName === 'getMultipleVideoDetails') {
            const videos = record.result?.videos as Array<{ videoId: string; title: string }> | undefined;
            const match = videos?.find(v => v.videoId === videoId);
            if (match) return match.title;
        }
    }
    return null;
}

// --- Main Component ---

export const ToolCallSummary: React.FC<ToolCallSummaryProps> = React.memo(({
    toolCalls,
    videoMap,
}) => {
    if (!toolCalls || toolCalls.length === 0) return null;

    const groups = groupToolCalls(toolCalls);

    // Build a map from toolName → first progressMessage from unresolved calls
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
