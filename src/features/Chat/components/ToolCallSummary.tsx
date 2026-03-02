// =============================================================================
// ToolCallSummary — consolidated pill display for tool calls in AI responses
//
// Replaces individual ToolCallBadge mapping. Groups tool calls by type and
// renders 1-2 consolidated pills with expandable video previews.
//
// Two pill types:
//   1. mentionVideo  → "Based on N videos" — which videos Gemini references
//   2. getMultipleVideoDetails → "Fetched details for N videos" — audit trail
// =============================================================================

import React, { useState } from 'react';
import { Loader2, Check, AlertCircle, ChevronDown } from 'lucide-react';
import type { ToolCallRecord } from '../../../core/types/chat';
import type { VideoCardContext } from '../../../core/types/appContext';
import { groupToolCalls, getGroupLabel, isExpandable } from '../utils/toolCallGrouping';
import type { ToolCallGroup } from '../utils/toolCallGrouping';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { VideoTooltipContent } from './VideoTooltipContent';
import { formatViewCount } from '../../../core/utils/formatUtils';

// --- Props ---

interface ToolCallSummaryProps {
    toolCalls: ToolCallRecord[];
    videoMap?: Map<string, VideoCardContext>;
    isStreaming?: boolean;
}

// --- Sub-components ---

/** Single consolidated pill for a tool call group. */
const GroupPill: React.FC<{
    group: ToolCallGroup;
    videoMap?: Map<string, VideoCardContext>;
}> = ({ group, videoMap }) => {
    const [expanded, setExpanded] = useState(false);

    const label = getGroupLabel(group);
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] leading-tight transition-colors duration-200 ${stateClasses} ${expandable ? 'cursor-pointer hover:brightness-125' : 'cursor-default'} ${!group.allResolved ? 'animate-stream-pulse' : ''}`}
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

            {/* Expanded video preview list */}
            {expanded && group.allResolved && (
                <div className="mt-1.5 flex flex-col gap-1 w-full">
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
                />
            ))}
        </div>
    );
});
ToolCallSummary.displayName = 'ToolCallSummary';
