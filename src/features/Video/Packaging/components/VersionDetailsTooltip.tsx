import React, { useState } from 'react';
import { Type, AlignLeft, Tag, Copy, Check, Image as ImageIcon } from 'lucide-react';
import type { PackagingSnapshot } from '../types';

export const VersionDetailsTooltipContent: React.FC<{ snapshot: PackagingSnapshot }> = ({ snapshot }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const hasAbTest = snapshot.abTestVariants && snapshot.abTestVariants.length > 0;

    return (
        <div className="flex flex-col gap-3 w-full">
            {/* Title */}
            <div className="flex gap-2">
                <Type size={14} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                <div className="text-xs font-medium text-white">{snapshot.title}</div>
            </div>

            {/* Description */}
            <div className="flex gap-2">
                <AlignLeft size={14} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                <div
                    className={`text-[10px] text-[#CCCCCC] cursor-pointer hover:text-white transition-colors ${isExpanded ? '' : 'line-clamp-2'}`}
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {snapshot.description}
                </div>
            </div>

            {/* Tags */}
            <div className="flex gap-2 relative">
                <Tag size={14} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                <div className="flex flex-wrap gap-1 pr-6">
                    {snapshot.tags.map(tag => (
                        <span key={tag} className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-[#DDDDDD]">
                            #{tag}
                        </span>
                    ))}
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        const cleanTags = snapshot.tags.map(tag => tag.replace(/^#/, ''));
                        navigator.clipboard.writeText(cleanTags.join(', '));
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                    }}
                    className="absolute top-0.5 right-0 text-[#AAAAAA] hover:text-white transition-colors"
                    title="Copy all tags"
                >
                    {isCopied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                </button>
            </div>

            {/* Images */}
            <div className="flex gap-2 mt-1">
                <ImageIcon size={14} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                <div className="flex flex-col gap-3 w-full">
                    {/* Main / Variant A */}
                    <div className="flex flex-col gap-1 w-full">
                        {hasAbTest && <span className="text-[9px] text-[#AAAAAA]">Variant A</span>}
                        <img src={snapshot.coverImage || ''} alt="Cover" className="w-full aspect-video object-cover rounded border border-white/10" />
                    </div>
                    {/* AB Variants (B, C...) */}
                    {snapshot.abTestVariants?.map((url, i) => (
                        <div key={i} className="flex flex-col gap-1 w-full">
                            <span className="text-[9px] text-[#AAAAAA]">Variant {String.fromCharCode(66 + i)}</span>
                            <img src={url} alt={`Variant ${i}`} className="w-full aspect-video object-cover rounded border border-white/10 opacity-90" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
