import React, { useState, useEffect } from 'react';
import { Calendar, Tag, AlignLeft, GitCompare, TrendingUp } from 'lucide-react';
import { useVideoPlayer } from '../../../core/hooks/useVideoPlayer';
import { DiffHighlight } from './DiffHighlight';
import { CopyButton } from '../../../components/ui/atoms/CopyButton';
import { formatViewCount, formatDelta, getDeltaColor } from '../../../core/utils/formatUtils';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import type { VideoDeltaStats } from '../../../../shared/viewDeltas';
import type { VideoPreviewData } from '../types';

export { PREVIEW_DIMENSIONS } from '../types';

interface VideoPreviewTooltipProps {
    /** Core video data — dedicated tooltip type, source-agnostic */
    video: VideoPreviewData;
    /** Display mode: 'full' (800x700) for Trends/Traffic, 'mini' (~420x500) for Chat */
    mode?: 'full' | 'mini';
    /** Additional enrichments (Trends/Traffic only) */
    percentileGroup?: string;
    comparisonVideo?: VideoDetails;
    /** Override delta source (when VideoPreviewData deltas are null but external deltas exist) */
    deltaStats?: VideoDeltaStats;
    className?: string;
}

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
};

export const VideoPreviewTooltip: React.FC<VideoPreviewTooltipProps> = ({
    video,
    mode = 'full',
    percentileGroup,
    comparisonVideo,
    deltaStats,
    className = '',
}) => {
    const { videoId, title, channelTitle, viewCount, publishedAt, description, tags } = video;

    // Resolve the YouTube-embeddable ID:
    // - Regular videos: videoId IS the YouTube ID
    // - Custom published: youtubeVideoId = publishedVideoId (from backend)
    // - Custom drafts: no YouTube ID → no embed, show static thumbnail
    const embedId = video.youtubeVideoId ?? (videoId.startsWith('custom-') ? undefined : videoId);

    const [isExpanded, setIsExpanded] = useState(false);
    const [areTagsExpanded, setAreTagsExpanded] = useState(false);
    const [isComparing, setIsComparing] = useState(false);

    const { minimize, activeVideoId, isMinimized } = useVideoPlayer();

    // 300ms delay before loading iframe — prevents layout shift from killing
    // the tooltip on first render (tooltip flicker prevention).
    const [canLoad, setCanLoad] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setCanLoad(true), 300);
        return () => clearTimeout(timer);
    }, []);

    const isFull = mode === 'full';
    const isPlayingInMiniPlayer = isMinimized && activeVideoId === (embedId ?? videoId);

    // Resolve deltas: prefer external deltaStats, fallback to video inline deltas
    const d24h = deltaStats?.delta24h ?? video.delta24h ?? null;
    const d7d = deltaStats?.delta7d ?? video.delta7d ?? null;
    const d30d = deltaStats?.delta30d ?? video.delta30d ?? null;
    const hasDeltas = d24h !== null || d7d !== null || d30d !== null;

    return (
        <div className={`flex flex-col gap-3 w-full ${className} ${isComparing ? 'group/diff' : ''}`}>
            {/* Header with Actions */}
            <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-1.5">
                    {isComparing ? 'Comparison Mode' : 'Video Preview'}
                </span>
                <div className="flex items-center gap-2">
                    {isFull && comparisonVideo && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsComparing(!isComparing);
                            }}
                            className={`
                                flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md transition-all border
                                ${isComparing
                                    ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30 font-medium'
                                    : 'bg-white/5 text-text-secondary hover:text-text-primary border-white/5 hover:bg-white/10'
                                }
                            `}
                            title="Compare metadata with my video"
                        >
                            <GitCompare size={12} />
                            <span>Compare</span>
                        </button>
                    )}
                    {!isPlayingInMiniPlayer && embedId && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                minimize(embedId, title);
                            }}
                            className="flex items-center gap-1.5 text-[10px] bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary px-2 py-1 rounded-md transition-colors border border-white/5"
                            title="Minimize player"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                            </svg>
                            <span>Minimize</span>
                        </button>
                    )}
                </div>
            </div>

            {/* YouTube Player / Thumbnail */}
            <div className={`aspect-video w-full rounded-lg bg-black/40 overflow-hidden border border-border shrink-0 relative z-10 group/player transition-all duration-300 ${isComparing ? 'grayscale opacity-40' : ''}`}>
                {isPlayingInMiniPlayer ? (
                    <img
                        src={video.thumbnailUrl}
                        alt={title}
                        className="w-full h-full object-cover"
                    />
                ) : !embedId ? (
                    /* Draft / custom video without YouTube ID — static thumbnail */
                    <img
                        src={video.thumbnailUrl}
                        alt={title}
                        className="w-full h-full object-cover"
                    />
                ) : canLoad ? (
                    <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${embedId}?autoplay=0&mute=0&rel=0&modestbranding=1&controls=1`}
                        title={title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/20">
                        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/50 animate-spin" />
                    </div>
                )}
            </div>

            {/* Title & Channel */}
            <div className="flex flex-col gap-1 relative">
                <div className="flex items-start gap-2">
                    <div className="text-sm font-semibold text-text-primary line-clamp-2 leading-snug flex-1 pr-6">
                        {isComparing && comparisonVideo ? (
                            <DiffHighlight
                                text={title}
                                comparisonText={
                                    comparisonVideo.abTestTitles && comparisonVideo.abTestTitles.length > 0
                                        ? comparisonVideo.abTestTitles.join(' ')
                                        : comparisonVideo.title
                                }
                            />
                        ) : (
                            title
                        )}
                    </div>
                    <div className="absolute top-0 right-0 p-1 hover:bg-text-primary/5 rounded">
                        <CopyButton text={title} size={12} title="Copy title" className="!opacity-100 !text-text-tertiary hover:!text-text-primary" />
                    </div>
                </div>
                {channelTitle && (
                    <div className="text-xs text-text-secondary">
                        {channelTitle}
                    </div>
                )}
            </div>

            {/* Metadata Badges — "show what you have" */}
            {(viewCount !== undefined || publishedAt || percentileGroup) && (
                <div className="flex items-center flex-wrap gap-1.5 text-xs mt-1">
                    {viewCount !== undefined && (
                        <span className="text-text-primary font-bold px-2 py-1 bg-black/10 dark:bg-white/10 rounded-full whitespace-nowrap">
                            {formatViewCount(viewCount)} views
                        </span>
                    )}

                    {percentileGroup && (
                        <span className={`font-bold px-2 py-1 rounded-full whitespace-nowrap ${percentileGroup.includes('Top 1%') ? 'text-emerald-700 dark:text-white bg-emerald-500/30 border border-emerald-500/50' :
                            percentileGroup.includes('Top 5%') ? 'text-lime-700 dark:text-white bg-lime-500/30 border border-lime-500/50' :
                                percentileGroup.includes('Top 20%') ? 'text-blue-700 dark:text-white bg-blue-500/30 border border-blue-500/50' :
                                    percentileGroup.includes('Middle') ? 'text-purple-700 dark:text-white bg-purple-500/20 border border-purple-500/30' :
                                        'text-red-700 dark:text-white bg-red-500/30 border border-red-500/50'
                            }`}>
                            {percentileGroup}
                        </span>
                    )}

                    {publishedAt && (
                        <div className="flex items-center gap-1.5 text-text-secondary bg-black/5 dark:bg-white/10 px-2 py-1 rounded-full whitespace-nowrap ml-auto">
                            <Calendar size={12} />
                            <span>{formatDate(publishedAt)}</span>
                        </div>
                    )}
                </div>
            )}

            {/* View Growth — own section with icon, like description/tags */}
            {hasDeltas && (
                <div className="flex items-center gap-2 border-t border-border pt-3 text-xs">
                    <TrendingUp size={14} className="text-text-tertiary shrink-0" />
                    <div className="flex items-center gap-1.5">
                        {d24h !== null && (
                            <span className={`${getDeltaColor(d24h, viewCount)} font-medium px-2 py-1 rounded-full whitespace-nowrap`}>
                                <span className="font-bold">24h</span> — {formatDelta(d24h)} views
                            </span>
                        )}
                        {d7d !== null && (
                            <span className={`${getDeltaColor(d7d, viewCount)} font-medium px-2 py-1 rounded-full whitespace-nowrap`}>
                                <span className="font-bold">7d</span> — {formatDelta(d7d)} views
                            </span>
                        )}
                        {d30d !== null && (
                            <span className={`${getDeltaColor(d30d, viewCount)} font-medium px-2 py-1 rounded-full whitespace-nowrap`}>
                                <span className="font-bold">30d</span> — {formatDelta(d30d)} views
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Description */}
            {description && (
                <div className="flex gap-2 border-t border-border pt-3 relative">
                    <AlignLeft size={14} className="text-text-tertiary mt-0.5 shrink-0" />
                    <div
                        className={`text-[10px] text-text-secondary cursor-pointer hover:text-text-primary transition-colors whitespace-pre-wrap pr-6 ${isExpanded ? '' : 'line-clamp-2'}`}
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                        {isComparing && comparisonVideo ? (
                            <DiffHighlight text={description} comparisonText={comparisonVideo.description || ''} />
                        ) : (
                            description
                        )}
                    </div>
                    <div className="absolute top-3 right-0 p-1 hover:bg-text-primary/5 rounded">
                        <CopyButton text={description} size={12} title="Copy description" className="!opacity-100 !text-text-tertiary hover:!text-text-primary" />
                    </div>
                </div>
            )}

            {/* Tags */}
            {tags && tags.length > 0 && (
                <div className="flex gap-2 relative border-t border-border pt-3">
                    <Tag size={14} className="text-text-tertiary mt-0.5 shrink-0" />
                    <div className="flex flex-wrap gap-1 pr-6">
                        {isComparing && comparisonVideo ? (
                            <div className="text-[10px] bg-black/10 dark:bg-white/10 px-2 py-1 rounded-lg w-full">
                                <DiffHighlight
                                    text={tags.join(', ')}
                                    comparisonText={comparisonVideo.tags?.join(', ') || ''}
                                />
                            </div>
                        ) : (
                            <>
                                {(areTagsExpanded ? tags : tags.slice(0, 5)).map(tag => (
                                    <span key={tag} className="text-[9px] bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded-full text-text-secondary">
                                        #{tag}
                                    </span>
                                ))}
                                {!areTagsExpanded && tags.length > 5 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAreTagsExpanded(true);
                                        }}
                                        className="text-[9px] text-text-tertiary px-1.5 py-0.5 hover:text-text-primary transition-colors cursor-pointer"
                                    >
                                        +{tags.length - 5} more
                                    </button>
                                )}
                                {areTagsExpanded && tags.length > 5 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAreTagsExpanded(false);
                                        }}
                                        className="text-[9px] text-text-tertiary px-1.5 py-0.5 hover:text-text-primary transition-colors cursor-pointer"
                                    >
                                        Show less
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                    <div className="absolute top-3 right-0 p-1 hover:bg-text-primary/5 rounded">
                        <CopyButton text={tags.join(', ')} size={12} title="Copy all tags" className="!opacity-100 !text-text-tertiary hover:!text-text-primary" />
                    </div>
                </div>
            )}
        </div>
    );
};
