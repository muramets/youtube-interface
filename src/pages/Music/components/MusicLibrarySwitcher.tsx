// =============================================================================
// MusicLibrarySwitcher — animated tab row for switching between own / shared
// libraries. Collapsed when no shared libraries are present.
// =============================================================================

import React from 'react';
import { Share2 } from 'lucide-react';
import type { SharedLibraryEntry } from '../../../core/types/musicSharing';

interface MusicLibrarySwitcherProps {
    sharedLibraries: SharedLibraryEntry[];
    activePlaylistId: string | null;
    sharedPlaylistIds: Set<string>;
    playlistAllSources: boolean;
    activeLibrarySource: SharedLibraryEntry | null;
    setPlaylistAllSources: (value: boolean) => void;
    setActiveLibrarySource: (lib: SharedLibraryEntry | null) => void;
}

export const MusicLibrarySwitcher: React.FC<MusicLibrarySwitcherProps> = ({
    sharedLibraries,
    activePlaylistId,
    sharedPlaylistIds,
    playlistAllSources,
    activeLibrarySource,
    setPlaylistAllSources,
    setActiveLibrarySource,
}) => {
    // Collapse when no shared libraries exist, or when inside a shared playlist.
    const isVisible = sharedLibraries.length > 0 && !sharedPlaylistIds.has(activePlaylistId ?? '');

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateRows: isVisible ? '1fr' : '0fr',
                transition: 'grid-template-rows 0.25s ease-out',
            }}
        >
            <div style={{ overflow: 'hidden' }}>
                <div className="flex items-center gap-1.5 mb-4 p-1 bg-black/5 dark:bg-white/[0.04] rounded-xl w-fit">
                    {/* "All" button — in all subviews (playlists + liked) */}
                    {activePlaylistId && (
                        <button
                            onClick={() => setPlaylistAllSources(true)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${playlistAllSources
                                ? 'bg-black/10 dark:bg-white/[0.1] text-text-primary shadow-sm'
                                : 'text-text-secondary hover:text-text-primary'
                                }`}
                        >
                            All
                        </button>
                    )}
                    <button
                        onClick={() => { setPlaylistAllSources(false); setActiveLibrarySource(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!playlistAllSources && !activeLibrarySource
                            ? 'bg-black/10 dark:bg-white/[0.1] text-text-primary shadow-sm'
                            : 'text-text-secondary hover:text-text-primary'
                            }`}
                    >
                        My Library
                    </button>
                    {sharedLibraries.map(lib => (
                        <button
                            key={lib.ownerChannelId}
                            onClick={() => { setPlaylistAllSources(false); setActiveLibrarySource(lib); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${!playlistAllSources && activeLibrarySource?.ownerChannelId === lib.ownerChannelId
                                ? 'bg-black/10 dark:bg-white/[0.1] text-text-primary shadow-sm'
                                : 'text-text-secondary hover:text-text-primary'
                                }`}
                        >
                            <Share2 size={11} />
                            {lib.ownerChannelName}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
