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
import { Loader2, Check, AlertCircle, ChevronDown, BarChart3, TrendingUp, Images, Satellite, Globe, PieChart, Users, Telescope } from 'lucide-react';
import type { ToolCallRecord } from '../../../core/types/chat/chat';
import type { VideoCardContext } from '../../../core/types/appContext';
import { groupToolCalls, getGroupLabel, isExpandable, isThumbnailTool, getGroupQuota } from '../utils/toolCallGrouping';
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

/** Compact thumbnail grid for viewThumbnails expanded view. */
const ThumbnailGrid: React.FC<{ group: ToolCallGroup }> = ({ group }) => {
    type ThumbnailEntry = { videoId: string; title: string; thumbnailUrl: string };
    const videos: ThumbnailEntry[] = [];
    for (const record of group.records) {
        const list = record.result?.videos as ThumbnailEntry[] | undefined;
        if (list) {
            for (const v of list) {
                if (!videos.find(x => x.videoId === v.videoId)) videos.push(v);
            }
        }
    }
    if (videos.length === 0) return null;
    return (
        <div className="mt-1.5 grid grid-cols-4 gap-1">
            {videos.map(v => (
                <div key={v.videoId} className="flex flex-col gap-0.5 min-w-0">
                    <img
                        src={v.thumbnailUrl}
                        alt=""
                        className="w-full aspect-video object-cover rounded"
                        loading="lazy"
                    />
                    <span className="text-[10px] text-text-tertiary truncate leading-tight">{v.title}</span>
                </div>
            ))}
        </div>
    );
};

/** Compact stats for analyzeTrafficSources expanded view. */
const TrafficSourceStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const sources = result.sources as Array<{ source: string; views: number }> | undefined;
    const timeline = result.snapshotTimeline as Array<{ date: string; label: string; totalSources: number }> | undefined;
    const sourceVideo = result.sourceVideo as { title?: string } | undefined;

    const sourceCount = sources?.length ?? 0;
    const snapshotCount = timeline?.length ?? 0;
    const topSources = sources?.slice(0, 5) ?? [];

    return (
        <div className="flex flex-col gap-1.5 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            {sourceVideo?.title && (
                <span className="text-text-primary text-[10px] font-medium truncate">{sourceVideo.title}</span>
            )}
            <span className="inline-flex items-center gap-1.5">
                <PieChart size={11} className="shrink-0 opacity-60" />
                {sourceCount} traffic {sourceCount === 1 ? 'source' : 'sources'} across {snapshotCount} {snapshotCount === 1 ? 'snapshot' : 'snapshots'}
            </span>
            {topSources.length > 0 && (
                <div className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                    {topSources.map(s => (
                        <span key={s.source} className="truncate">
                            {s.source}: {s.views?.toLocaleString() ?? '—'} views
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Compact stats for getChannelOverview expanded view (quota gate). */
const ChannelOverviewStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
                <Globe size={11} className="shrink-0 opacity-60" />
                {result.channelTitle as string}
                {result.handle ? ` (${result.handle as string})` : null}
                {result.subscriberCount ? ` — ${(result.subscriberCount as number).toLocaleString()} subs` : null}
            </span>
            <span className="text-[10px] text-text-tertiary">
                {(result.videoCount as number | undefined)?.toLocaleString() ?? '—'} videos
                {result.quotaCost != null && ` · Estimated cost: ~${result.quotaCost as number} quota units`}
            </span>
        </div>
    );
};

/** Compact stats for browseChannelVideos expanded view. */
const BrowseChannelStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const videos = result.videos as unknown[] | undefined;
    const totalOnYT = result.totalVideosOnYouTube as number | undefined;
    const cached = result.alreadyCached as number | undefined;
    const fetched = result.fetchedFromYouTube as number | undefined;
    const quotaUsed = result.quotaUsed as number | undefined;
    const sync = result.ownChannelSync as { inApp: number; onYouTube: number; notInApp: number } | undefined;

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="text-[10px] text-text-tertiary">
                {videos?.length ?? 0} videos returned
                {totalOnYT != null && ` (${totalOnYT} on YouTube)`}
                {cached != null && fetched != null && ` · ${cached} cached, ${fetched} fetched`}
                {quotaUsed != null && quotaUsed > 0 && ` · ${quotaUsed} quota units`}
            </span>
            {sync && (
                <span className="text-[10px] text-text-tertiary">
                    {sync.inApp} in app · {sync.onYouTube} on YouTube · {sync.notInApp} not imported
                </span>
            )}
        </div>
    );
};

/** Compact stats for listTrendChannels expanded view. */
const TrendChannelsStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const channels = result.channels as Array<{ title: string; videoCount?: number; averageViews?: number }> | undefined;
    const totalChannels = result.totalChannels as number | undefined;
    const totalVideos = result.totalVideos as number | undefined;

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
                <Users size={11} className="shrink-0 opacity-60" />
                {totalChannels ?? 0} channels · {(totalVideos ?? 0).toLocaleString()} videos
            </span>
            {channels && channels.length > 0 && (
                <div className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                    {channels.slice(0, 5).map(ch => (
                        <span key={ch.title} className="truncate">
                            {ch.title}: {(ch.videoCount ?? 0).toLocaleString()} videos
                            {ch.averageViews != null && ` · avg ${formatViewCount(ch.averageViews)}`}
                        </span>
                    ))}
                    {channels.length > 5 && (
                        <span className="text-text-tertiary">+{channels.length - 5} more</span>
                    )}
                </div>
            )}
        </div>
    );
};

/** Compact stats for browseTrendVideos expanded view. */
const BrowseTrendStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const videos = result.videos as unknown[] | undefined;
    const totalMatched = result.totalMatched as number | undefined;
    const channels = result.channels as Array<{ title: string; matchedCount: number }> | undefined;

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="text-[10px] text-text-tertiary">
                {videos?.length ?? 0} videos returned
                {totalMatched != null && totalMatched > (videos?.length ?? 0) && ` (${totalMatched} matched)`}
            </span>
            {channels && channels.length > 0 && (
                <div className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                    {channels.map(ch => (
                        <span key={ch.title} className="truncate">
                            {ch.title}: {ch.matchedCount} matched
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Compact stats for getNicheSnapshot expanded view. */
const NicheSnapshotStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const window = result.window as { from: string; to: string } | undefined;
    const aggregates = result.aggregates as {
        totalVideosInWindow?: number;
        commonTags?: Array<{ tag: string; count: number }>;
        avgViewsInWindow?: number;
    } | undefined;
    const activity = result.competitorActivity as Array<{ channelTitle: string; videosPublished: number }> | undefined;

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            {window && (
                <span className="text-[10px] text-text-tertiary">
                    Window: {window.from} — {window.to}
                </span>
            )}
            <span className="inline-flex items-center gap-1.5">
                <Telescope size={11} className="shrink-0 opacity-60" />
                {aggregates?.totalVideosInWindow ?? 0} videos
                {aggregates?.avgViewsInWindow != null && ` · avg ${formatViewCount(aggregates.avgViewsInWindow)}`}
            </span>
            {activity && activity.length > 0 && (
                <div className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                    {activity.slice(0, 5).map(ch => (
                        <span key={ch.channelTitle} className="truncate">
                            {ch.channelTitle}: {ch.videosPublished} videos
                        </span>
                    ))}
                </div>
            )}
            {aggregates?.commonTags && aggregates.commonTags.length > 0 && (
                <span className="text-[10px] text-text-tertiary truncate">
                    Tags: {aggregates.commonTags.slice(0, 5).map(t => t.tag).join(', ')}
                </span>
            )}
        </div>
    );
};

/** Quota badge — shows API cost when a tool used YouTube quota. */
const QuotaBadge: React.FC<{ quota: number }> = ({ quota }) => {
    if (quota <= 0) return null;
    return (
        <span className="inline-flex items-center gap-0.5 ml-1 text-[9px] text-text-tertiary opacity-70">
            <Satellite size={9} className="shrink-0" />
            {quota}
        </span>
    );
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

    // Color scheme:
    //   mentionVideo     → indigo  (matches inline mention highlight)
    //   viewThumbnails   → amber   (visual / image tool)
    //   everything else  → emerald (data/audit)
    const isMention = group.toolName === 'mentionVideo';
    const isThumbnail = isThumbnailTool(group);
    const stateClasses = group.hasErrors
        ? 'bg-red-500/[0.06] text-red-400'
        : group.allResolved
            ? isMention
                ? 'bg-indigo-400/[0.08] text-indigo-400'
                : isThumbnail
                    ? 'bg-amber-400/[0.08] text-amber-400'
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
                {/* Status icon — specialized icons per tool when resolved */}
                {isMention && group.allResolved && !group.hasErrors ? (
                    <span className="text-[12px] font-semibold shrink-0">@</span>
                ) : isThumbnail && group.allResolved && !group.hasErrors ? (
                    <Images size={12} className="shrink-0" />
                ) : group.toolName === 'getChannelOverview' && group.allResolved && !group.hasErrors ? (
                    <Globe size={12} className="shrink-0" />
                ) : group.toolName === 'browseChannelVideos' && group.allResolved && !group.hasErrors ? (
                    <Globe size={12} className="shrink-0" />
                ) : group.toolName === 'analyzeTrafficSources' && group.allResolved && !group.hasErrors ? (
                    <PieChart size={12} className="shrink-0" />
                ) : group.toolName === 'listTrendChannels' && group.allResolved && !group.hasErrors ? (
                    <Users size={12} className="shrink-0" />
                ) : group.toolName === 'browseTrendVideos' && group.allResolved && !group.hasErrors ? (
                    <TrendingUp size={12} className="shrink-0" />
                ) : group.toolName === 'getNicheSnapshot' && group.allResolved && !group.hasErrors ? (
                    <Telescope size={12} className="shrink-0" />
                ) : (
                    <StatusIcon
                        size={12}
                        className={`shrink-0 ${!group.allResolved && !group.hasErrors ? 'animate-spin' : ''}`}
                    />
                )}
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
                    {/* Analysis tools: compact stats summaries */}
                    {group.toolName === 'analyzeSuggestedTraffic' && group.records[0]?.result && (
                        <AnalysisStats result={group.records[0].result} />
                    )}
                    {group.toolName === 'analyzeTrafficSources' && group.records[0]?.result && (
                        <TrafficSourceStats result={group.records[0].result} />
                    )}
                    {/* Channel overview: quota gate stats */}
                    {group.toolName === 'getChannelOverview' && group.records[0]?.result && (
                        <ChannelOverviewStats result={group.records[0].result} />
                    )}
                    {/* Browse channel: video stats */}
                    {group.toolName === 'browseChannelVideos' && group.records[group.records.length - 1]?.result && (
                        <BrowseChannelStats result={group.records[group.records.length - 1].result!} />
                    )}
                    {/* Layer 4: Competition tools */}
                    {group.toolName === 'listTrendChannels' && group.records[0]?.result && (
                        <TrendChannelsStats result={group.records[0].result} />
                    )}
                    {group.toolName === 'browseTrendVideos' && group.records[group.records.length - 1]?.result && (
                        <BrowseTrendStats result={group.records[group.records.length - 1].result!} />
                    )}
                    {group.toolName === 'getNicheSnapshot' && group.records[0]?.result && (
                        <NicheSnapshotStats result={group.records[0].result} />
                    )}
                    {/* Thumbnail tool: image grid */}
                    {isThumbnail && <ThumbnailGrid group={group} />}
                    {/* Video-based tools: video preview list (skip for thumbnails — ThumbnailGrid above already shows them) */}
                    {!isThumbnail && group.videoIds.map(videoId => {
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
