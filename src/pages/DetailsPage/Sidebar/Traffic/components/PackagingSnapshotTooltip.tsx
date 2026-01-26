import React, { useState } from 'react';
import { ImageIcon, SplitSquareHorizontal, Copy, Check, Tag, AlignLeft, Layout } from 'lucide-react';

import type { VideoLocalization } from '../../../../../core/utils/youtubeApi';

interface PackagingData {
    title: string;
    description: string;
    tags: string[];
    coverImage?: string;
    abTestTitles?: string[];
    abTestThumbnails?: string[];
    abTestResults?: {
        titles?: Array<{ variant: string; ctr: number; impressions: number }>;
        thumbnails?: Array<{ variant: string; ctr: number; impressions: number }>;
    };
    localizations?: Record<string, VideoLocalization>;
}

interface PackagingSnapshotTooltipProps {
    version: number;
    data: PackagingData;
}

/**
 * Premium tooltip content for deleted versions.
 * Matches aesthetics of TrendTooltip (Trends page) with copy functions and rich formatting.
 */
export const PackagingSnapshotTooltip: React.FC<PackagingSnapshotTooltipProps> = ({ version, data }) => {
    const [isDescriptionCopied, setIsDescriptionCopied] = useState(false);
    const [isTagsCopied, setIsTagsCopied] = useState(false);
    const [areTagsExpanded, setAreTagsExpanded] = useState(false);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [copiedTitleIndex, setCopiedTitleIndex] = useState<number | null>(null);

    const handleCopy = (text: string, setter: (v: boolean) => void) => {
        navigator.clipboard.writeText(text);
        setter(true);
        setTimeout(() => setter(false), 2000);
    };

    const handleTitleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedTitleIndex(index);
        setTimeout(() => setCopiedTitleIndex(null), 2000);
    };

    const hasAbTestTitles = data.abTestTitles && data.abTestTitles.length > 0;
    const hasAbTestThumbnails = data.abTestThumbnails && data.abTestThumbnails.length > 0;
    const isBundleTest = hasAbTestTitles && hasAbTestThumbnails;

    return (
        <div className="flex flex-col gap-4 w-full">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                    PRESERVED DATA v.{version}
                </span>
            </div>

            {/* A/B Test Bundle (Titles + Thumbnails) */}
            {isBundleTest ? (
                <div className="flex flex-col gap-2 p-3 bg-white/5 rounded-xl border border-white/10 relative group/ab">
                    <div className="flex items-center gap-2 text-yellow-400/90 font-bold text-[10px] uppercase tracking-wider mb-1">
                        <SplitSquareHorizontal size={12} />
                        <span>Legacy A/B Test Stats ({data.abTestTitles?.length} Variants)</span>
                    </div>

                    <div className="flex flex-col gap-3">
                        {data.abTestTitles?.map((title, index) => {
                            const thumb = data.abTestThumbnails?.[index];
                            return (
                                <div key={index} className="flex gap-3 items-start group/variant">
                                    {/* Thumbnail Variant */}
                                    <div className="w-[100px] aspect-video rounded-lg bg-black/20 overflow-hidden border border-white/10 shrink-0 relative">
                                        {thumb ? (
                                            <img src={thumb} className="w-full h-full object-cover" alt={`Variant ${index + 1}`} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-text-tertiary text-[9px]">No img</div>
                                        )}
                                        <div className="absolute top-0.5 left-0.5 bg-black/60 backdrop-blur-[2px] px-1.5 py-0.5 rounded text-[9px] text-white font-medium border border-white/10">
                                            {String.fromCharCode(65 + index)}
                                        </div>
                                    </div>

                                    {/* Title Variant */}
                                    <div className="flex-1 min-w-0 relative pt-1">
                                        <div className="text-xs text-text-primary font-medium leading-snug line-clamp-2 pr-6">
                                            {title}
                                        </div>
                                        <button
                                            onClick={() => handleTitleCopy(title, index)}
                                            className="absolute top-0 right-0 p-1 rounded hover:bg-white/10 text-text-tertiary hover:text-text-primary transition-opacity opacity-0 group-hover/variant:opacity-100"
                                            title="Copy Variant Title"
                                        >
                                            {copiedTitleIndex === index ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <>
                    {/* Titles Section (Single or A/B) */}
                    <div className="flex flex-col gap-1.5 group/copy relative">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                                <Layout size={10} />
                                <span>{hasAbTestTitles ? `Titles (${data.abTestTitles?.length} tested)` : 'Title'}</span>
                            </div>
                        </div>

                        {hasAbTestTitles ? (
                            <div className="flex flex-col gap-1.5 pl-1">
                                {data.abTestTitles?.map((title, index) => (
                                    <div key={index} className="relative group/variant pl-5">
                                        <span className="absolute left-0 top-0 text-[10px] font-mono text-text-tertiary opacity-70 mt-0.5">{String.fromCharCode(65 + index)}.</span>
                                        <div className="text-xs text-text-secondary hover:text-text-primary transition-colors font-medium leading-snug pr-6 cursor-default">
                                            {title}
                                        </div>
                                        <button
                                            onClick={() => handleTitleCopy(title, index)}
                                            className="absolute top-0 right-0 p-1 rounded hover:bg-white/10 text-text-tertiary hover:text-text-primary transition-opacity opacity-0 group-hover/variant:opacity-100"
                                            title="Copy Title"
                                        >
                                            {copiedTitleIndex === index ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="text-sm text-text-primary font-medium leading-snug pr-8 line-clamp-2">
                                    {data.title}
                                </div>
                                <button
                                    onClick={() => handleTitleCopy(data.title, -1)}
                                    className="absolute -top-1 right-0 p-1.5 rounded-md hover:bg-white/10 text-text-tertiary hover:text-text-primary transition-all opacity-0 group-hover/copy:opacity-100"
                                    title="Copy Title"
                                >
                                    {copiedTitleIndex === -1 ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Thumbnails Section (Single or A/B) */}
                    <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                            <ImageIcon size={10} />
                            <span>{hasAbTestThumbnails ? `Thumbnails (${data.abTestThumbnails?.length} tested)` : 'Thumbnail'}</span>
                        </div>

                        {hasAbTestThumbnails ? (
                            <div className="grid grid-cols-2 gap-2">
                                {data.abTestThumbnails?.map((thumb, index) => (
                                    <div key={index} className="relative aspect-video rounded-lg overflow-hidden border border-white/10 group/thumb">
                                        <img src={thumb} className="w-full h-full object-cover" alt={`Variant ${index + 1}`} />
                                        <div className="absolute top-0.5 left-0.5 bg-black/60 backdrop-blur-[2px] px-1.5 py-0.5 rounded text-[9px] text-white font-medium border border-white/10">
                                            {String.fromCharCode(65 + index)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : data.coverImage ? (
                            <div className="aspect-video w-[140px] rounded-lg overflow-hidden border border-white/10 relative">
                                <img src={data.coverImage} className="w-full h-full object-cover" alt="Cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />
                                <div className="absolute bottom-1 left-1.5 text-[9px] text-white/90 font-medium">Original</div>
                            </div>
                        ) : (
                            <div className="text-xs text-text-tertiary italic">Default YouTube thumbnail used</div>
                        )}
                    </div>
                </>
            )}

            {/* Description (Common) */}
            {data.description && (
                <div className="flex flex-col gap-1.5 group/copy relative border-t border-white/5 pt-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                        <AlignLeft size={10} />
                        <span>Description</span>
                    </div>
                    <div className="relative">
                        <div
                            className={`text-xs text-text-secondary leading-relaxed pr-8 transition-colors cursor-pointer hover:text-text-primary whitespace-pre-wrap ${isDescriptionExpanded ? '' : 'line-clamp-3'}`}
                            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                            title={isDescriptionExpanded ? "Click to collapse" : "Click to expand"}
                        >
                            {data.description}
                        </div>
                        <button
                            onClick={() => handleCopy(data.description, setIsDescriptionCopied)}
                            className="absolute -top-1 right-0 p-1.5 rounded-md hover:bg-white/10 text-text-tertiary hover:text-text-primary transition-all opacity-0 group-hover/copy:opacity-100"
                            title="Copy Description"
                        >
                            {isDescriptionCopied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                        </button>
                    </div>
                </div>
            )}

            {/* Tags (Common, Fixed Expansion) */}
            {data.tags && data.tags.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-white/5 pt-3 group/copy relative">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                        <Tag size={10} />
                        <span>Tags</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pr-8">
                        {(areTagsExpanded ? data.tags : data.tags.slice(0, 8)).map((tag, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 bg-white/5 text-text-secondary rounded-full border border-white/10">
                                #{tag}
                            </span>
                        ))}
                        {!areTagsExpanded && data.tags.length > 8 && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setAreTagsExpanded(true);
                                }}
                                className="text-[10px] px-2 py-0.5 text-text-tertiary bg-white/5 rounded-full border border-white/5 border-dashed hover:bg-white/10 hover:text-text-secondary transition-colors cursor-pointer"
                            >
                                +{data.tags.length - 8} more
                            </button>
                        )}
                        {areTagsExpanded && data.tags.length > 8 && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setAreTagsExpanded(false);
                                }}
                                className="text-[10px] px-2 py-0.5 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
                            >
                                Show less
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => handleCopy(data.tags.join(', '), setIsTagsCopied)}
                        className="absolute bottom-0 right-0 p-1.5 rounded-md hover:bg-white/10 text-text-tertiary hover:text-text-primary transition-all opacity-0 group-hover/copy:opacity-100"
                        title="Copy All Tags"
                    >
                        {isTagsCopied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                </div>
            )}
        </div>
    );
};

