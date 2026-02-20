// =============================================================================
// MUSIC FILTER BAR: Genre, tag, and BPM filter categories with chip rows
// =============================================================================

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Settings2, ChevronRight } from 'lucide-react';
import type { MusicGenre, MusicTag } from '../../../core/types/track';

interface MusicFilterBarProps {
    genres: MusicGenre[];
    tags: MusicTag[];
    categoryOrder: string[];
    featuredCategories: string[];
    genreFilters: string[];
    tagFilters: string[];
    bpmFilter: [number, number] | null;
    bpmRange: { min: number; max: number };
    hasActiveFilters: boolean;
    toggleGenreFilter: (genreId: string) => void;
    toggleTagFilter: (tagId: string) => void;
    setBpmFilter: (range: [number, number] | null) => void;
    clearFilters: () => void;
    /** While true: render shimmer chips in place of real categories */
    isLoading?: boolean;
}

export const MusicFilterBar: React.FC<MusicFilterBarProps> = ({
    genres,
    tags,
    categoryOrder,
    featuredCategories,
    genreFilters,
    tagFilters,
    bpmFilter,
    bpmRange,
    hasActiveFilters,
    toggleGenreFilter,
    toggleTagFilter,
    setBpmFilter,
    clearFilters,
    isLoading = false,
}) => {
    const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());
    const [filterIconHovered, setFilterIconHovered] = useState(false);
    const [showAll, setShowAll] = useState(false);

    // ── Scroll fade indicators ───────────────────────────────────────────
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showLeftFade, setShowLeftFade] = useState(false);
    const [showRightFade, setShowRightFade] = useState(false);
    const rafRef = useRef<number | null>(null);

    const checkScroll = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            if (scrollRef.current) {
                const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
                setShowLeftFade(scrollLeft > 2);
                setShowRightFade(Math.abs(scrollWidth - clientWidth - scrollLeft) > 2);
            }
            rafRef.current = null;
        });
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener('scroll', checkScroll);
        window.addEventListener('resize', checkScroll);
        checkScroll();
        const t = setTimeout(checkScroll, 100);
        return () => {
            el.removeEventListener('scroll', checkScroll);
            window.removeEventListener('resize', checkScroll);
            clearTimeout(t);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [checkScroll, showAll]);

    // Derive auto-expanded categories from active filters (no setState needed)
    const autoExpanded = useMemo(() => {
        const keys = new Set<string>();
        if (genreFilters.length > 0) keys.add('__genre__');
        if (bpmFilter) keys.add('__bpm__');
        for (const tag of tags) {
            if (tagFilters.includes(tag.id)) {
                keys.add(tag.category || 'Other');
            }
        }
        return keys;
    }, [genreFilters, tagFilters, bpmFilter, tags]);

    // Effective expanded = manual toggles ∪ auto-expanded from active filters
    const expandedCategories = useMemo(() => {
        if (autoExpanded.size === 0) return manualExpanded;
        const merged = new Set(manualExpanded);
        for (const k of autoExpanded) merged.add(k);
        return merged;
    }, [manualExpanded, autoExpanded]);

    if (!isLoading && genres.length === 0 && tags.length === 0) return null;


    const toggleCategory = (cat: string) => {
        setManualExpanded(prev => {
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

    const skeletonWidths = [64, 84, 72, 56];

    return (
        <div className="relative flex flex-col gap-4">
            {/* SKELETON LAYER — crossfade out when loading ends */}
            <div
                className={`transition-opacity duration-300 ${isLoading ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'
                    }`}
                aria-hidden={!isLoading}
            >
                <div className="flex items-center gap-5 overflow-x-hidden">
                    <div className="w-4 h-4 bg-bg-secondary rounded relative overflow-hidden flex-shrink-0">
                        <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                    </div>
                    {skeletonWidths.map((w, i) => (
                        <div key={i} className="h-6 bg-bg-secondary rounded-full flex-shrink-0 relative overflow-hidden" style={{ width: w }}>
                            <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                        </div>
                    ))}
                </div>
            </div>

            {/* CONTENT LAYER — absolute during loading (no layout impact), in flow when visible */}
            <div className={`flex flex-col gap-3 transition-opacity duration-300 ${isLoading ? 'opacity-0 absolute inset-0 pointer-events-none' : 'opacity-100'}`}>
                {/* Row 1: Category labels with scroll fades */}
                <div className="relative">
                    {showLeftFade && (
                        <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-r from-bg-primary to-transparent" />
                    )}
                    {showRightFade && (
                        <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-l from-bg-primary to-transparent" />
                    )}
                    <div ref={scrollRef} className="flex items-center gap-5 overflow-x-auto scrollbar-hide min-w-0">
                        <button
                            onMouseEnter={() => setFilterIconHovered(true)}
                            onMouseLeave={() => setFilterIconHovered(false)}
                            onClick={() => {
                                const targetKeys = (showAll || !hasFeatured) ? allCategories : visibleCategories;
                                const allKeys = targetKeys.map(c => c.key);
                                const allExpanded = allKeys.every(k => expandedCategories.has(k));
                                setManualExpanded(allExpanded ? new Set() : new Set(allKeys));
                            }}
                            className="bg-transparent border-none cursor-pointer p-0 flex-shrink-0 text-text-secondary hover:text-text-primary transition-colors"
                        >
                            <Settings2 size={16} />
                        </button>
                        {visibleCategories.map(({ key, label, type }) => {
                            const isExpanded = expandedCategories.has(key);
                            const isActive = type === 'genre'
                                ? genreFilters.length > 0
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
                </div>

                {/* Chip rows for each expanded category */}
                {allCategories.filter(c => expandedCategories.has(c.key)).map(({ key, type }) => (
                    <div key={key} className="flex flex-wrap gap-1.5 animate-fade-in">
                        {type === 'genre' && genres.map(genre => {
                            const active = genreFilters.includes(genre.id);
                            return (
                                <button
                                    key={genre.id}
                                    onClick={() => toggleGenreFilter(genre.id)}
                                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer border-none font-medium ${active
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
                            );
                        })}
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
        </div>
    );
};
