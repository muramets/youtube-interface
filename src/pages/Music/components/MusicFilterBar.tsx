// =============================================================================
// MUSIC FILTER BAR: Genre, tag, and BPM filter categories with chip rows
// =============================================================================

import React, { useState } from 'react';
import { Settings2, ChevronRight } from 'lucide-react';
import type { MusicGenre, MusicTag } from '../../../core/types/track';

interface MusicFilterBarProps {
    genres: MusicGenre[];
    tags: MusicTag[];
    categoryOrder: string[];
    featuredCategories: string[];
    genreFilter: string | null;
    tagFilters: string[];
    bpmFilter: [number, number] | null;
    bpmRange: { min: number; max: number };
    hasActiveFilters: boolean;
    setGenreFilter: (genre: string | null) => void;
    toggleTagFilter: (tagId: string) => void;
    setBpmFilter: (range: [number, number] | null) => void;
    clearFilters: () => void;
}

export const MusicFilterBar: React.FC<MusicFilterBarProps> = ({
    genres,
    tags,
    categoryOrder,
    featuredCategories,
    genreFilter,
    tagFilters,
    bpmFilter,
    bpmRange,
    hasActiveFilters,
    setGenreFilter,
    toggleTagFilter,
    setBpmFilter,
    clearFilters,
}) => {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [filterIconHovered, setFilterIconHovered] = useState(false);
    const [showAll, setShowAll] = useState(false);

    if (genres.length === 0 && tags.length === 0) return null;

    const toggleCategory = (cat: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const tagsByCategory = tags.reduce<Record<string, typeof tags>>((acc, tag) => {
        const cat = tag.category || 'Other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(tag);
        return acc;
    }, {});

    // Sort tag categories by categoryOrder
    const sortedTagCategoryKeys = Object.keys(tagsByCategory).sort((a, b) => {
        const idxA = categoryOrder.indexOf(a);
        const idxB = categoryOrder.indexOf(b);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });

    // Build all categories in stable order (Genres first, then tags by categoryOrder, BPM last)
    const allCategories: { key: string; label: string; type: 'genre' | 'tag' | 'bpm' }[] = [
        ...(genres.length > 0 ? [{ key: '__genre__', label: 'Genres', type: 'genre' as const }] : []),
        ...sortedTagCategoryKeys.map(cat => ({ key: cat, label: cat, type: 'tag' as const })),
        { key: '__bpm__', label: 'BPM', type: 'bpm' as const },
    ];

    // Determine which categories are featured
    const hasFeatured = featuredCategories.length > 0;
    const isFeatured = (key: string) => featuredCategories.includes(key);

    // Visible categories: featured-only when collapsed, all when expanded or no featured set
    const visibleCategories = (!hasFeatured || showAll)
        ? allCategories
        : allCategories.filter(c => isFeatured(c.key));

    // Are there any non-featured categories that can be toggled?
    const hasNonFeatured = hasFeatured && allCategories.some(c => !isFeatured(c.key));

    return (
        <div className="flex flex-col gap-2.5">
            {/* Row 1: Category labels as plain text */}
            <div className="flex items-center gap-5">
                <button
                    onMouseEnter={() => setFilterIconHovered(true)}
                    onMouseLeave={() => setFilterIconHovered(false)}
                    onClick={() => {
                        const targetKeys = (showAll || !hasFeatured) ? allCategories : visibleCategories;
                        const allKeys = targetKeys.map(c => c.key);
                        const allExpanded = allKeys.every(k => expandedCategories.has(k));
                        setExpandedCategories(allExpanded ? new Set() : new Set(allKeys));
                    }}
                    className="bg-transparent border-none cursor-pointer p-0 flex-shrink-0 text-text-secondary hover:text-text-primary transition-colors"
                >
                    <Settings2 size={16} />
                </button>
                {visibleCategories.map(({ key, label, type }) => {
                    const isExpanded = expandedCategories.has(key);
                    const isActive = type === 'genre'
                        ? !!genreFilter
                        : type === 'bpm'
                            ? !!bpmFilter
                            : tagsByCategory[key]?.some(t => tagFilters.includes(t.id));
                    return (
                        <button
                            key={key}
                            onClick={() => toggleCategory(key)}
                            className={`text-sm font-medium transition-colors bg-transparent border-none cursor-pointer whitespace-nowrap ${filterIconHovered || isExpanded
                                ? 'text-text-primary'
                                : isActive
                                    ? 'text-text-primary'
                                    : 'text-text-secondary hover:text-text-primary'
                                }`}
                        >
                            {label}
                        </button>
                    );
                })}

                {/* Expand arrow to show non-featured categories */}
                {hasNonFeatured && (
                    <button
                        onClick={() => setShowAll(prev => !prev)}
                        className="bg-transparent border-none cursor-pointer p-0 flex-shrink-0 text-text-tertiary hover:text-text-primary transition-all"
                    >
                        <ChevronRight
                            size={16}
                            className={`transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
                        />
                    </button>
                )}

                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className="text-xs text-text-tertiary hover:text-text-primary transition-colors ml-auto"
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Chip rows for each expanded category */}
            {allCategories.filter(c => expandedCategories.has(c.key)).map(({ key, type }) => (
                <div key={key} className="flex flex-wrap gap-1.5 animate-fade-in">
                    {type === 'genre' && genres.map(genre => (
                        <button
                            key={genre.id}
                            onClick={() => setGenreFilter(genreFilter === genre.id ? null : genre.id)}
                            className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer border-none font-medium ${genreFilter === genre.id
                                ? 'bg-text-primary text-bg-primary'
                                : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'
                                }`}
                        >
                            <span
                                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: genre.color }}
                            />
                            {genre.name}
                        </button>
                    ))}
                    {type === 'tag' && tagsByCategory[key]?.map(tag => {
                        const active = tagFilters.includes(tag.id);
                        return (
                            <button
                                key={tag.id}
                                onClick={() => toggleTagFilter(tag.id)}
                                className={`text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer border-none font-medium ${active
                                    ? 'bg-text-primary text-bg-primary'
                                    : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'
                                    }`}
                            >
                                {tag.name}
                            </button>
                        );
                    })}
                    {type === 'bpm' && (() => {
                        const min = bpmRange.min;
                        const max = bpmRange.max;
                        const currentMin = bpmFilter?.[0] ?? min;
                        const currentMax = bpmFilter?.[1] ?? max;
                        const range = max - min || 1;
                        const leftPercent = ((currentMin - min) / range) * 100;
                        const rightPercent = ((max - currentMax) / range) * 100;

                        return (
                            <div className="flex items-center gap-3 w-full max-w-sm">
                                <span className="text-xs text-text-secondary font-medium tabular-nums w-8 text-right">{currentMin}</span>
                                <div className="relative flex-1 h-8 flex items-center">
                                    {/* Track background */}
                                    <div className="absolute inset-x-0 h-1 bg-bg-secondary rounded-full" />
                                    {/* Filled range */}
                                    <div
                                        className="absolute h-1 bg-text-primary rounded-full"
                                        style={{ left: `${leftPercent}%`, right: `${rightPercent}%` }}
                                    />
                                    {/* Min thumb */}
                                    <input
                                        type="range"
                                        min={min}
                                        max={max}
                                        value={currentMin}
                                        onChange={(e) => {
                                            const v = Number(e.target.value);
                                            const newMin = Math.min(v, currentMax);
                                            if (newMin === min && currentMax === max) {
                                                setBpmFilter(null);
                                            } else {
                                                setBpmFilter([newMin, currentMax]);
                                            }
                                        }}
                                        className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg-primary"
                                    />
                                    {/* Max thumb */}
                                    <input
                                        type="range"
                                        min={min}
                                        max={max}
                                        value={currentMax}
                                        onChange={(e) => {
                                            const v = Number(e.target.value);
                                            const newMax = Math.max(v, currentMin);
                                            if (currentMin === min && newMax === max) {
                                                setBpmFilter(null);
                                            } else {
                                                setBpmFilter([currentMin, newMax]);
                                            }
                                        }}
                                        className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg-primary"
                                    />
                                </div>
                                <span className="text-xs text-text-secondary font-medium tabular-nums w-8">{currentMax}</span>
                            </div>
                        );
                    })()}
                </div>
            ))}
        </div>
    );
};
