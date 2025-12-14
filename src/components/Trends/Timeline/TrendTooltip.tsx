import React, { useState } from 'react';
import { AlignLeft, Tag, Copy, Check, Calendar } from 'lucide-react';

export interface TrendVideoNode {
    id: string;
    title: string;
    thumbnail: string;
    viewCount: number;
    publishedAt: string; // ISO string
    publishedAtTimestamp: number;
    description?: string;
    tags?: string[];
    channelId: string;
    channelTitle?: string;
}

interface TrendTooltipProps {
    video: TrendVideoNode;
    style?: React.CSSProperties;
    className?: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

export const TrendTooltip: React.FC<TrendTooltipProps> = ({ video, style, className, onMouseEnter, onMouseLeave }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [areTagsExpanded, setAreTagsExpanded] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return (
        <div
            className={`fixed z-[200] bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 pointer-events-auto w-[340px] animate-fade-in flex flex-col gap-3 ${className || ''}`}
            style={style}
            // Prevent clicks from propagating to the timeline which might trigger auto-fit or panning
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {/* Thumbnail / Mini Player */}
            <div className="aspect-video w-full rounded-lg bg-black/40 overflow-hidden border border-white/5 shrink-0 relative z-10">
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
                <div className="text-sm font-semibold text-white line-clamp-2 leading-snug">
                    {video.title}
                </div>
                {video.channelTitle && (
                    <div className="text-xs text-[#AAAAAA]">
                        {video.channelTitle}
                    </div>
                )}
            </div>

            {/* Metadata Badges */}
            <div className="flex justify-between items-center text-xs">
                <span className="text-white font-bold px-2 py-1 bg-white/10 rounded-full">
                    {video.viewCount.toLocaleString()} views
                </span>
                <div className="flex items-center gap-1.5 text-[#AAAAAA]">
                    <Calendar size={12} />
                    <span>{formatDate(video.publishedAt)}</span>
                </div>
            </div>

            {/* Description */}
            {video.description && (
                <div className="flex gap-2 border-t border-white/5 pt-3">
                    <AlignLeft size={14} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                    <div
                        className={`text-[10px] text-[#CCCCCC] cursor-pointer hover:text-white transition-colors whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-2'}`}
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? "Collapse" : "Expand"}
                    >
                        {video.description}
                    </div>
                </div>
            )}

            {/* Tags */}
            {video.tags && video.tags.length > 0 && (
                <div className="flex gap-2 relative border-t border-white/5 pt-3">
                    <Tag size={14} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                    <div className="flex flex-wrap gap-1 pr-6">
                        {(areTagsExpanded ? video.tags : video.tags.slice(0, 5)).map(tag => (
                            <span key={tag} className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-[#DDDDDD]">
                                #{tag}
                            </span>
                        ))}
                        {!areTagsExpanded && video.tags.length > 5 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setAreTagsExpanded(true);
                                }}
                                className="text-[9px] text-[#AAAAAA] px-1.5 py-0.5 hover:text-white transition-colors cursor-pointer"
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
                                className="text-[9px] text-[#AAAAAA] px-1.5 py-0.5 hover:text-white transition-colors cursor-pointer"
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
                        className="absolute top-3 right-0 text-[#AAAAAA] hover:text-white transition-colors p-1 hover:bg-white/5 rounded"
                        title="Copy all tags"
                    >
                        {isCopied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
                </div>
            )}
        </div>
    );
};
