import React from 'react';

// ---------------------------------------------------------------------------
// Shared shimmer overlay — eliminates repetition across skeleton primitives
// ---------------------------------------------------------------------------
const Shimmer: React.FC = () => (
    <div
        className="shimmer-overlay"
        style={{ backgroundSize: '200% 100%' }}
    />
);

// ---------------------------------------------------------------------------
// GroupRowSkeleton
// Matches the named-group header: w-6 h-6 circle + name bar + count badge.
// Real UI: p-2 rounded-lg, circle mr-3, text-sm name, w-4 count
// ---------------------------------------------------------------------------
const GroupRowSkeleton: React.FC<{ idx: number }> = ({ idx }) => (
    <li className="flex items-center p-2 rounded-lg">
        {/* Circle icon (chevron in real group header) */}
        <div className="w-6 h-6 rounded-full bg-bg-secondary mr-3 shrink-0 relative overflow-hidden">
            <Shimmer />
        </div>
        {/* Group name — variable width for organic look */}
        <div
            className="h-3 bg-bg-secondary rounded relative overflow-hidden flex-1"
            style={{ maxWidth: `${50 + (idx % 3) * 15}%` }}
        >
            <Shimmer />
        </div>
        {/* Count badge — matches real w-4 shrink-0 box */}
        <div className="ml-2 w-4 h-2.5 bg-bg-secondary rounded relative overflow-hidden shrink-0">
            <Shimmer />
        </div>
    </li>
);

// ---------------------------------------------------------------------------
// PlaylistRowSkeleton
// Matches MusicPlaylistItem: color dot (w-2 h-2) + name bar.
// indent=true → pl-8 matching the real MusicPlaylistItem indent prop.
// ---------------------------------------------------------------------------
const PlaylistRowSkeleton: React.FC<{ idx: number; indent?: boolean }> = ({ idx, indent = false }) => (
    <li className={`flex items-center ${indent ? 'pl-8 pr-3' : 'px-2'} py-[7px] rounded-lg`}>
        {/* Color dot */}
        <div className="w-2 h-2 rounded-full bg-bg-secondary mr-3 shrink-0 relative overflow-hidden">
            <Shimmer />
        </div>
        {/* Name — variable width for organic look */}
        <div
            className="h-3 bg-bg-secondary rounded relative overflow-hidden"
            style={{ width: `${48 + (idx % 4) * 13}%` }}
        >
            <Shimmer />
        </div>
    </li>
);

// ---------------------------------------------------------------------------
// MusicPlaylistSkeleton (public API)
//
// variant="playlists" (default)
//   Flat list of indented playlist rows.
//   Used for the Shared With Me section (channel header renders separately).
//
// variant="grouped"
//   One group header row followed by indented playlist rows.
//   Used for own-playlists section — mimics real group + children layout.
// ---------------------------------------------------------------------------
export const MusicPlaylistSkeleton: React.FC<{
    count?: number;
    variant?: 'playlists' | 'grouped';
}> = ({ count = 3, variant = 'playlists' }) => {
    if (variant === 'grouped') {
        const childCount = Math.max(count - 1, 1);
        return (
            <ul className="space-y-0.5">
                <GroupRowSkeleton idx={0} />
                {[...Array(childCount)].map((_, idx) => (
                    <PlaylistRowSkeleton key={idx} idx={idx} indent />
                ))}
            </ul>
        );
    }

    return (
        <ul className="space-y-0.5">
            {[...Array(count)].map((_, idx) => (
                <PlaylistRowSkeleton key={idx} idx={idx} indent />
            ))}
        </ul>
    );
};
