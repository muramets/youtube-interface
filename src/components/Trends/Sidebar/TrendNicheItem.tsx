import React, { useState } from 'react';
import { MoreVertical, Check } from 'lucide-react';
import type { TrendNiche } from '../../../types/trends';
import { useTrendStore } from '../../../stores/trendStore';

interface TrendNicheItemProps {
    niche: TrendNiche;
    isActive: boolean;
    onClick: (id: string) => void;
}

const formatViewCount = (num?: number) => {
    if (!num) return '0';
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(num);
};

export const TrendNicheItem: React.FC<TrendNicheItemProps> = ({
    niche,
    isActive,
    onClick
}) => {
    const { updateNiche, deleteNiche } = useTrendStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

    const PRESET_COLORS = [
        '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#F97316',
        '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#A855F7'
    ];

    return (
        <li className="relative group/niche">
            <div
                onClick={() => onClick(niche.id)}
                className={`
                    flex items-center pl-8 pr-2 py-1.5 cursor-pointer transition-colors
                    ${isActive ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white hover:bg-white/5'}
                `}
            >
                {/* Color Dot (Clickable) */}
                <div
                    role="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsColorPickerOpen(!isColorPickerOpen);
                        setIsMenuOpen(false);
                    }}
                    className="w-2 h-2 rounded-full mr-3 shrink-0 transition-transform hover:scale-125"
                    style={{ backgroundColor: niche.color }}
                />

                {/* Name */}
                <span className="text-xs truncate flex-1">{niche.name}</span>

                {/* View Count */}
                <span className="text-[10px] text-text-tertiary ml-2">
                    {formatViewCount(niche.viewCount)}
                </span>

                {/* Actions Trigger (Hidden unless hovered/active) */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(!isMenuOpen);
                        setIsColorPickerOpen(false);
                    }}
                    className={`
                        p-0.5 rounded ml-1 opacity-0 group-hover/niche:opacity-100 transition-opacity
                        ${isMenuOpen ? 'opacity-100 bg-white/10' : 'hover:bg-white/10'}
                    `}
                >
                    <MoreVertical size={12} />
                </button>
            </div>

            {/* Color Picker Popover */}
            {isColorPickerOpen && (
                <div className="absolute left-8 top-8 z-50 bg-[#1F1F1F] border border-white/10 rounded-lg p-2 shadow-xl animate-scale-in w-32 flex flex-wrap gap-1">
                    {PRESET_COLORS.map(color => (
                        <button
                            key={color}
                            onClick={(e) => {
                                e.stopPropagation();
                                updateNiche(niche.id, { color });
                                setIsColorPickerOpen(false);
                            }}
                            className="w-5 h-5 rounded-full hover:scale-110 transition-transform relative"
                            style={{ backgroundColor: color }}
                        >
                            {niche.color === color && <Check size={10} className="absolute inset-0 m-auto text-white" />}
                        </button>
                    ))}
                    {/* Backdrop to close */}
                    <div
                        className="fixed inset-0 z-[-1]"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsColorPickerOpen(false);
                        }}
                    />
                </div>
            )}

            {/* Context Menu */}
            {isMenuOpen && (
                <div className="absolute right-0 top-8 z-50 bg-[#1F1F1F] border border-white/10 rounded-lg py-1 shadow-xl animate-scale-in w-28">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete niche "${niche.name}"?`)) {
                                deleteNiche(niche.id);
                            }
                            setIsMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 transition-colors"
                    >
                        Delete
                    </button>
                    {/* Backdrop to close */}
                    <div
                        className="fixed inset-0 z-[-1]"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMenuOpen(false);
                        }}
                    />
                </div>
            )}
        </li>
    );
};
