// =============================================================================
// CHAT: VideoReferenceTooltip
// Inline component that renders "Video #3" as a highlighted @mention with a
// hover tooltip showing enriched video metadata.
//
// Tooltip structure follows VideoPreviewTooltip patterns:
// 1. Header: thumbnail + title + channel
// 2. Metrics: views / duration / published / type
// 3. Description: expandable (click to toggle, line-clamp-2 by default)
// 4. Tags: first 5 shown, "+N more" to expand
// =============================================================================

import React, { useState } from 'react';
import { AlignLeft, Tag } from 'lucide-react';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import type { VideoCardContext } from '../../../core/types/appContext';
import { OWNERSHIP_CONFIG } from '../../../core/config/referencePatterns';
import { formatDuration, formatViewCount } from '../../../core/utils/formatUtils';

// --- Constants ---

const MAX_VISIBLE_TAGS = 5;

// --- Props ---

interface VideoReferenceTooltipProps {
    /** The display text, e.g. "Video #3" */
    label: string;
    /** The resolved video data (null = reference not found) */
    video: VideoCardContext | null;
}

// --- Helpers ---

function formatPublishedDate(raw?: string): string | null {
    if (!raw) return null;
    try {
        return new Date(raw).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return raw;
    }
}

// --- Component ---

export const VideoReferenceTooltip: React.FC<VideoReferenceTooltipProps> = React.memo(({ label, video }) => {
    const [isDescExpanded, setIsDescExpanded] = useState(false);
    const [areTagsExpanded, setAreTagsExpanded] = useState(false);

    // Graceful fallback: if video not found, render plain text (no tooltip)
    if (!video) {
        return <span>{label}</span>;
    }

    const publishedDate = formatPublishedDate(video.publishedAt);
    const ownershipLabel = video.ownership !== 'own-published'
        ? (OWNERSHIP_CONFIG[video.ownership]?.label ?? null)
        : null;
    const hasMetrics = video.viewCount || video.duration || publishedDate || ownershipLabel;
    const visibleTags = areTagsExpanded
        ? (video.tags ?? [])
        : (video.tags?.slice(0, MAX_VISIBLE_TAGS) ?? []);
    const extraTagCount = (video.tags?.length ?? 0) - MAX_VISIBLE_TAGS;

    const tooltipContent = (
        <div className="flex flex-col gap-2 p-1 max-w-[300px]">
            {/* --- Header: Thumbnail + Title + Channel --- */}
            <div className="flex gap-2 items-start">
                {video.thumbnailUrl && (
                    <img
                        src={video.thumbnailUrl}
                        alt=""
                        className="w-24 h-[54px] object-cover rounded flex-shrink-0"
                        loading="lazy"
                    />
                )}
                <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-[12px] font-semibold text-white/90 leading-[1.3] line-clamp-2">
                        {video.title}
                    </span>
                    {video.channelTitle && (
                        <span className="text-[10px] text-white/40 truncate">
                            {video.channelTitle}
                        </span>
                    )}
                </div>
            </div>

            {/* --- Metrics Row --- */}
            {hasMetrics && (
                <>
                    <div className="h-px bg-white/5" />
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/60">
                        {video.viewCount && (
                            <span>
                                <span className="text-white/40">Views: </span>
                                <span className="font-mono text-white/80">{formatViewCount(video.viewCount)}</span>
                            </span>
                        )}
                        {video.duration && (
                            <span>
                                <span className="text-white/40">Duration: </span>
                                <span className="font-mono text-white/80">{formatDuration(video.duration)}</span>
                            </span>
                        )}
                        {publishedDate && (
                            <span>
                                <span className="text-white/40">Published: </span>
                                <span className="text-white/80">{publishedDate}</span>
                            </span>
                        )}
                        {ownershipLabel && (
                            <span>
                                <span className="text-white/40">Type: </span>
                                <span className="text-white/80">{ownershipLabel}</span>
                            </span>
                        )}
                    </div>
                </>
            )}

            {/* --- Description (expandable) --- */}
            {video.description && (
                <>
                    <div className="h-px bg-white/5" />
                    <div className="flex gap-2 relative">
                        <AlignLeft size={12} className="text-white/30 mt-0.5 shrink-0" />
                        <div
                            className={`text-[10px] text-white/50 cursor-pointer hover:text-white/70 transition-colors whitespace-pre-wrap ${isDescExpanded ? '' : 'line-clamp-2'}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsDescExpanded(!isDescExpanded);
                            }}
                            title={isDescExpanded ? 'Collapse' : 'Expand'}
                        >
                            {video.description}
                        </div>
                    </div>
                </>
            )}

            {/* --- Tags (expandable) --- */}
            {video.tags && video.tags.length > 0 && (
                <>
                    <div className="h-px bg-white/5" />
                    <div className="flex gap-2">
                        <Tag size={12} className="text-white/30 mt-0.5 shrink-0" />
                        <div className="flex flex-wrap gap-1">
                            {visibleTags.map(tag => (
                                <span
                                    key={tag}
                                    className="text-[9px] text-white/50 bg-white/5 rounded-full px-2 py-0.5"
                                >
                                    #{tag}
                                </span>
                            ))}
                            {!areTagsExpanded && extraTagCount > 0 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setAreTagsExpanded(true);
                                    }}
                                    className="text-[9px] text-white/30 hover:text-white/60 transition-colors cursor-pointer px-1.5 py-0.5"
                                >
                                    +{extraTagCount} more
                                </button>
                            )}
                            {areTagsExpanded && (video.tags?.length ?? 0) > MAX_VISIBLE_TAGS && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setAreTagsExpanded(false);
                                    }}
                                    className="text-[9px] text-white/30 hover:text-white/60 transition-colors cursor-pointer px-1.5 py-0.5"
                                >
                                    Show less
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <PortalTooltip
            content={tooltipContent}
            side="top"
            align="center"
            maxWidth={320}
            enterDelay={200}
            triggerClassName="!inline !flex-none"
            inline
        >
            <span className="video-reference-highlight">
                @{label}
            </span>
        </PortalTooltip>
    );
});
VideoReferenceTooltip.displayName = 'VideoReferenceTooltip';
