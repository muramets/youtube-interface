import React, { useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, Tag, Copy, Check, Calendar } from 'lucide-react';
import type { TrendVideo } from '../../../core/types/trends';

interface TrendTooltipProps {
    video: TrendVideo;
    anchorPos: { x: number; y: number; width: number; height: number }; // x=center, y=top, width/height=element dims
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    percentileGroup?: string;
    className?: string; // Optional custom class
    isClosing?: boolean;
}

export const TrendTooltip: React.FC<TrendTooltipProps> = ({
    video,
    anchorPos,
    className,
    onMouseEnter,
    onMouseLeave,
    percentileGroup,
    isClosing = false
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [areTagsExpanded, setAreTagsExpanded] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    // Smart Positioning
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({
        opacity: 0, // start invisible to calculate layout
        left: 0,
        top: 0
    });

    useLayoutEffect(() => {
        const el = tooltipRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const { innerWidth, innerHeight } = window;
        const GAP = 16; // Increased gap for better separation
        const SCREEN_MARGIN = 12;

        // --- Vertical Logic ---
        // 1. Try Top
        let top = anchorPos.y - rect.height - GAP;
        let placement = 'top';

        if (top < SCREEN_MARGIN) {
            // 2. Try Bottom
            const bottomY = anchorPos.y + anchorPos.height + GAP;
            if (bottomY + rect.height <= innerHeight - SCREEN_MARGIN) {
                top = bottomY;
                placement = 'bottom';
            } else {
                // Both vertical fail. Determine fallback.
                // We will constrain vertical position but MUST move horizontally to avoid overlapping.
                placement = 'side';

                // Center vertically relative to dot (clamped)
                // Ideal center:
                const dotCenterY = anchorPos.y + anchorPos.height / 2;
                top = dotCenterY - rect.height / 2;

                // Clamp vertical to screen
                if (top < SCREEN_MARGIN) top = SCREEN_MARGIN;
                if (top + rect.height > innerHeight - SCREEN_MARGIN) top = innerHeight - rect.height - SCREEN_MARGIN;
            }
        }

        // --- Horizontal Logic ---
        let left = 0;

        if (placement === 'side') {
            // 3. Try Right Side
            const rightX = anchorPos.x + anchorPos.width / 2 + GAP;
            if (rightX + rect.width <= innerWidth - SCREEN_MARGIN) {
                left = rightX;
            } else {
                // 4. Try Left Side
                const leftX = anchorPos.x - anchorPos.width / 2 - GAP - rect.width;
                if (leftX >= SCREEN_MARGIN) {
                    left = leftX;
                } else {
                    // All sides failed. Overlap is inevitable. 
                    // Default to Right but clamped (it will cover, but stay on screen)
                    left = innerWidth - rect.width - SCREEN_MARGIN;
                }
            }
        } else {
            // Normal Top/Bottom center alignment
            left = anchorPos.x - rect.width / 2;

            // Clamp horizontal
            if (left < SCREEN_MARGIN) left = SCREEN_MARGIN;
            else if (left + rect.width > innerWidth - SCREEN_MARGIN) {
                left = innerWidth - rect.width - SCREEN_MARGIN;
            }
        }

        setPositionStyle({
            left,
            top,
            opacity: 1
        });
    }, [anchorPos.x, anchorPos.y, anchorPos.width, anchorPos.height, isExpanded, areTagsExpanded, video.id]);
    // Re-run if content expands (height changes) or anchor moves

    // Apply isClosing override
    const activeStyle = {
        ...positionStyle,
        opacity: (positionStyle.opacity === 1 && isClosing) ? 0 : positionStyle.opacity
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return createPortal(
        <div
            ref={tooltipRef}
            className={`fixed z-[1050] bg-bg-secondary/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl p-4 pointer-events-auto w-[340px] flex flex-col gap-3 transition-opacity duration-150 ${className || ''}`}
            style={activeStyle}
            // Prevent clicks from propagating logic (scrolling etc)
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {/* Thumbnail / Mini Player */}
            <div className="aspect-video w-full rounded-lg bg-black/40 overflow-hidden border border-border shrink-0 relative z-10">
                <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${video.id}?autoplay=0&rel=0&modestbranding=1&controls=1`}
                    title={video.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                ></iframe>
            </div>

            {/* Title & Channel */}
            <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold text-text-primary line-clamp-2 leading-snug">
                    {video.title}
                </div>
                {video.channelTitle && (
                    <div className="text-xs text-text-secondary">
                        {video.channelTitle}
                    </div>
                )}
            </div>

            {/* Metadata Badges */}
            <div className="flex items-center justify-between text-xs">
                {/* Views - left aligned */}
                <span className="text-text-primary font-bold px-2 py-1 bg-black/10 dark:bg-white/10 rounded-full whitespace-nowrap">
                    {video.viewCount.toLocaleString()} views
                </span>

                {/* Percentile - center */}
                {percentileGroup === 'Top 1%' && (
                    <span className="text-emerald-700 dark:text-white font-bold px-2 py-1 bg-gradient-to-r from-emerald-500/30 to-green-500/30 border border-emerald-500/50 rounded-full whitespace-nowrap">
                        {percentileGroup}
                    </span>
                )}
                {percentileGroup === 'Top 5%' && (
                    <span className="text-lime-700 dark:text-white font-bold px-2 py-1 bg-gradient-to-r from-lime-500/30 to-teal-500/30 border border-lime-500/50 rounded-full whitespace-nowrap">
                        {percentileGroup}
                    </span>
                )}
                {percentileGroup === 'Top 20%' && (
                    <span className="text-blue-700 dark:text-white font-bold px-2 py-1 bg-gradient-to-r from-blue-500/30 to-cyan-500/30 border border-blue-500/50 rounded-full whitespace-nowrap">
                        {percentileGroup}
                    </span>
                )}
                {percentileGroup === 'Middle 60%' && (
                    <span className="text-purple-700 dark:text-white font-bold px-2 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-full whitespace-nowrap">
                        {percentileGroup}
                    </span>
                )}
                {percentileGroup === 'Bottom 20%' && (
                    <span className="text-red-700 dark:text-white font-bold px-2 py-1 bg-gradient-to-r from-red-500/30 to-rose-500/30 border border-red-500/50 rounded-full whitespace-nowrap">
                        {percentileGroup}
                    </span>
                )}
                {!percentileGroup && <span />}

                {/* Date - right aligned */}
                <div className="flex items-center gap-1.5 text-text-secondary bg-black/5 dark:bg-white/10 px-2 py-1 rounded-full whitespace-nowrap">
                    <Calendar size={12} />
                    <span>{formatDate(video.publishedAt)}</span>
                </div>
            </div>

            {/* Description */}
            {video.description && (
                <div className="flex gap-2 border-t border-border pt-3">
                    <AlignLeft size={14} className="text-text-tertiary mt-0.5 shrink-0" />
                    <div
                        className={`text-[10px] text-text-secondary cursor-pointer hover:text-text-primary transition-colors whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-2'}`}
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? "Collapse" : "Expand"}
                    >
                        {video.description}
                    </div>
                </div>
            )}

            {/* Tags */}
            {video.tags && video.tags.length > 0 && (
                <div className="flex gap-2 relative border-t border-border pt-3">
                    <Tag size={14} className="text-text-tertiary mt-0.5 shrink-0" />
                    <div className="flex flex-wrap gap-1 pr-6">
                        {(areTagsExpanded ? video.tags : video.tags.slice(0, 5)).map(tag => (
                            <span key={tag} className="text-[9px] bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded-full text-text-secondary">
                                #{tag}
                            </span>
                        ))}
                        {!areTagsExpanded && video.tags.length > 5 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setAreTagsExpanded(true);
                                }}
                                className="text-[9px] text-text-tertiary px-1.5 py-0.5 hover:text-text-primary transition-colors cursor-pointer"
                            >
                                +{video.tags.length - 5} more
                            </button>
                        )}
                        {areTagsExpanded && video.tags.length > 5 && (
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
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const cleanTags = video.tags?.map(tag => tag.replace(/^#/, '')) || [];
                            navigator.clipboard.writeText(cleanTags.join(', '));
                            setIsCopied(true);
                            setTimeout(() => setIsCopied(false), 2000);
                        }}
                        className="absolute top-3 right-0 text-text-tertiary hover:text-text-primary transition-colors p-1 hover:bg-text-primary/5 rounded"
                        title="Copy all tags"
                    >
                        {isCopied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
                </div>
            )}
        </div>,
        document.body
    );
};
