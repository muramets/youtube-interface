// =============================================================================
// TRACK CARD SKELETON — Precise pixel match for TrackCard layout
// Used while tracks are loading (own or shared library subscription).
// Mirrors the exact flex structure of TrackCard to prevent layout shift.
// =============================================================================

import React from 'react';

// ---------------------------------------------------------------------------
// ShimmerBlock — reusable bg-bg-secondary element with the shimmer sweep
// ---------------------------------------------------------------------------
const ShimmerBlock: React.FC<{ className: string; style?: React.CSSProperties }> = ({ className, style }) => (
    <div className={`bg-bg-secondary relative overflow-hidden rounded ${className}`} style={style}>
        <div
            className="shimmer-overlay"
            style={{ backgroundSize: '200% 100%' }}
        />
    </div>
);

// ---------------------------------------------------------------------------
// TrackCardSkeleton
// Mirrors TrackCard: px-4 py-4 flex items-center gap-4
//
// Columns in order (matching TrackCardInner render):
//  1. Cover        — w-14 h-14 rounded-lg flex-shrink-0
//  2. Title+Artist — min-w-0 w-[220px] flex-shrink-0
//  3. Variant slot — w-[58px] flex-shrink-0  (empty — only on hover in real card)
//  4. Waveform     — flex-1 min-w-0 max-w-[280px] h-10
//  5. Duration/BPM — flex-col items-end flex-shrink-0
//  6. Genre        — w-[72px] flex-shrink-0 ml-3
//  7. Tags         — flex-1 min-w-0 max-w-[200px] ml-3
//  8. Actions      — ml-auto flex-shrink-0
// ---------------------------------------------------------------------------
export const TrackCardSkeleton: React.FC<{ index?: number }> = ({ index = 0 }) => (
    <div
        className="flex items-center gap-4 px-4 py-4 rounded-lg animate-fade-in-down"
        style={{ animationDelay: `${index * 45}ms`, animationFillMode: 'both' }}
    >
        {/* 1. Cover */}
        <ShimmerBlock className="w-14 h-14 rounded-lg flex-shrink-0" />

        {/* 2. Title + Artist */}
        <div className="min-w-0 w-[220px] flex-shrink-0 flex flex-col gap-2">
            <ShimmerBlock className="h-3.5" style={{ width: '72%' }} />
            <ShimmerBlock className="h-2.5" style={{ width: '48%' }} />
        </div>

        {/* 3. Variant toggle slot — empty (only visible on hover in real card) */}
        <div className="w-[58px] flex-shrink-0" />

        {/* 4. Waveform — exact h-10 to match WaveformCanvas height={40} */}
        <ShimmerBlock className="flex-1 min-w-0 max-w-[280px] h-10 rounded-md" />

        {/* 5. Duration / BPM */}
        <div className="flex flex-col items-end flex-shrink-0 gap-1.5">
            <ShimmerBlock className="h-2.5 w-9" />
            <ShimmerBlock className="h-2 w-6" />
        </div>

        {/* 6. Genre */}
        <ShimmerBlock className="w-[72px] h-2.5 flex-shrink-0 ml-3" />

        {/* 7. Tags */}
        <ShimmerBlock className="flex-1 min-w-0 max-w-[200px] h-2.5 ml-3" />

        {/* 8. Actions area — single icon placeholder */}
        <div className="flex items-center flex-shrink-0 ml-auto">
            <ShimmerBlock className="w-7 h-7 rounded-lg" />
        </div>
    </div>
);

// ---------------------------------------------------------------------------
// TrackListSkeleton
// Renders `count` staggered TrackCardSkeleton rows.
// Uses animate-fade-in-down (from tailwind.config.js) for a premium entrance.
// ---------------------------------------------------------------------------
export const TrackListSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
    <div>
        {Array.from({ length: count }).map((_, i) => (
            <TrackCardSkeleton key={i} index={i} />
        ))}
    </div>
);
