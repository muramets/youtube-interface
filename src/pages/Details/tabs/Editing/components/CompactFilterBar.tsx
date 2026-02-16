// =============================================================================
// CompactFilterBar: Compact filter UI for the Track Browser panel
// =============================================================================
// Same mechanics as MusicFilterBar (collapsible categories, starred/featured,
// auto-expand on active filter) but with compact sizing for sidebar panels.
// =============================================================================

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Settings2, ChevronRight } from 'lucide-react';
import type { TrackFilterState, TrackFilterActions, TrackFilterMeta } from '../../../../../core/hooks/useTrackFilters';

interface CompactFilterBarProps extends TrackFilterState, TrackFilterActions, TrackFilterMeta { }

export const CompactFilterBar: React.FC<CompactFilterBarProps> = ({
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

    // Derive auto-expanded categories from active filters
    const autoExpanded = useMemo(() => {
        const keys = new Set<string>();
        if (genreFilter) keys.add('__genre__');
        if (bpmFilter) keys.add('__bpm__');
        for (const tag of tags) {
            if (tagFilters.includes(tag.id)) {
                keys.add(tag.category || 'Other');
            }
        }
        return keys;
    }, [genreFilter, tagFilters, bpmFilter, tags]);

    // Effective expanded = manual ∪ auto-expanded
    const expandedCategories = useMemo(() => {
        if (autoExpanded.size === 0) return manualExpanded;
        const merged = new Set(manualExpanded);
        for (const k of autoExpanded) merged.add(k);
        return merged;
    }, [manualExpanded, autoExpanded]);

    if (genres.length === 0 && tags.length === 0) return null;

    const toggleCategory = (cat: string) => {
        setManualExpanded((prev) => {
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

    const sortedTagCategoryKeys = Object.keys(tagsByCategory).sort((a, b) => {
        const idxA = categoryOrder.indexOf(a);
        const idxB = categoryOrder.indexOf(b);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });

    const allCategories: { key: string; label: string; type: 'genre' | 'tag' | 'bpm' }[] = [
        ...(genres.length > 0 ? [{ key: '__genre__', label: 'Genres', type: 'genre' as const }] : []),
        ...sortedTagCategoryKeys.map((cat) => ({ key: cat, label: cat, type: 'tag' as const })),
        { key: '__bpm__', label: 'BPM', type: 'bpm' as const },
    ];

    const hasFeatured = featuredCategories.length > 0;
    const isFeatured = (key: string) => featuredCategories.includes(key);

    const visibleCategories = !hasFeatured || showAll
        ? allCategories
        : allCategories.filter((c) => isFeatured(c.key));

    const hasNonFeatured = hasFeatured && allCategories.some((c) => !isFeatured(c.key));

    return (
        <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-border">
            {/* Category labels row with scroll fades */}
            <div className="relative">
                {showLeftFade && (
                    <div className="absolute left-0 top-0 bottom-0 w-6 z-10 pointer-events-none bg-gradient-to-r from-bg-secondary to-transparent" />
                )}
                {showRightFade && (
                    <div className="absolute right-0 top-0 bottom-0 w-6 z-10 pointer-events-none bg-gradient-to-l from-bg-secondary to-transparent" />
                )}
                <div
                    ref={scrollRef}
                    className="flex items-center gap-3 overflow-x-auto scrollbar-hide"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    <button
                        onMouseEnter={() => setFilterIconHovered(true)}
                        onMouseLeave={() => setFilterIconHovered(false)}
                        onClick={() => {
                            const targetKeys = (showAll || !hasFeatured) ? allCategories : visibleCategories;
                            const allKeys = targetKeys.map((c) => c.key);
                            const allExpanded = allKeys.every((k) => expandedCategories.has(k));
                            setManualExpanded(allExpanded ? new Set() : new Set(allKeys));
                        }}
                        className="bg-transparent border-none cursor-pointer p-0 flex-shrink-0 text-text-secondary hover:text-text-primary transition-colors"
                    >
                        <Settings2 size={14} />
                    </button>

                    {visibleCategories.map(({ key, label, type }) => {
                        const isExpanded = expandedCategories.has(key);
                        const isActive =
                            type === 'genre'
                                ? !!genreFilter
                                : type === 'bpm'
                                    ? !!bpmFilter
                                    : tagsByCategory[key]?.some((t) => tagFilters.includes(t.id));
                        return (
                            <button
                                key={key}
                                onClick={() => toggleCategory(key)}
                                className={`text-[11px] font-medium transition-colors bg-transparent border-none cursor-pointer whitespace-nowrap ${filterIconHovered || isExpanded
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

                    {hasNonFeatured && (
                        <button
                            onClick={() => setShowAll((prev) => !prev)}
                            className="bg-transparent border-none cursor-pointer p-0 flex-shrink-0 text-text-tertiary hover:text-text-primary transition-all"
                        >
                            <ChevronRight
                                size={14}
                                className={`transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
                            />
                        </button>
                    )}

                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors ml-auto"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Chip rows for expanded categories */}
            {allCategories
                .filter((c) => expandedCategories.has(c.key))
                .map(({ key, type }) => (
                    <div key={key} className="flex flex-wrap gap-1 animate-fade-in">
                        {type === 'genre' &&
                            genres.map((genre) => (
                                <button
                                    key={genre.id}
                                    onClick={() => setGenreFilter(genreFilter === genre.id ? null : genre.id)}
                                    className={`text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 transition-all cursor-pointer border-none font-medium ${genreFilter === genre.id
                                        ? 'bg-text-primary text-bg-primary'
                                        : 'bg-white/[0.08] text-text-primary hover:bg-hover-bg'
                                        }`}
                                >
                                    <span
                                        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: genre.color }}
                                    />
                                    {genre.name}
                                </button>
                            ))}

                        {type === 'tag' &&
                            tagsByCategory[key]?.map((tag) => {
                                const active = tagFilters.includes(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        onClick={() => toggleTagFilter(tag.id)}
                                        className={`text-[10px] px-2 py-0.5 rounded-md transition-all cursor-pointer border-none font-medium ${active
                                            ? 'bg-text-primary text-bg-primary'
                                            : 'bg-white/[0.08] text-text-primary hover:bg-hover-bg'
                                            }`}
                                    >
                                        {tag.name}
                                    </button>
                                );
                            })}

                        {type === 'bpm' &&
                            (() => {
                                const min = bpmRange.min;
                                const max = bpmRange.max;
                                const currentMin = bpmFilter?.[0] ?? min;
                                const currentMax = bpmFilter?.[1] ?? max;
                                const range = max - min || 1;
                                const leftPercent = ((currentMin - min) / range) * 100;
                                const rightPercent = ((max - currentMax) / range) * 100;

                                return (
                                    <div className="flex items-center gap-2 w-full max-w-[200px]">
                                        <span className="text-[10px] text-text-secondary font-medium tabular-nums w-6 text-right">
                                            {currentMin}
                                        </span>
                                        <div className="relative flex-1 h-6 flex items-center">
                                            <div className="absolute inset-x-0 h-0.5 bg-bg-secondary rounded-full" />
                                            <div
                                                className="absolute h-0.5 bg-text-primary rounded-full"
                                                style={{ left: `${leftPercent}%`, right: `${rightPercent}%` }}
                                            />
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
                                                className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg-primary"
                                            />
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
                                                className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg-primary"
                                            />
                                        </div>
                                        <span className="text-[10px] text-text-secondary font-medium tabular-nums w-6">
                                            {currentMax}
                                        </span>
                                    </div>
                                );
                            })()}
                    </div>
                ))}
        </div>
    );
};
