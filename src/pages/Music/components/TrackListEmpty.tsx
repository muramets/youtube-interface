// =============================================================================
// TrackListEmpty — empty state views for the Music library track list.
// Shows "No tracks yet" when library is empty, or "No matches" when filters
// return zero results.
// =============================================================================

import React from 'react';
import { Music, Search, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/atoms';

interface TrackListEmptyProps {
    /** True if there are tracks in the library but the current filters hide them all. */
    hasAnyTracks: boolean;
    onUpload: () => void;
    onClearFilters: () => void;
}

export const TrackListEmpty: React.FC<TrackListEmptyProps> = ({
    hasAnyTracks,
    onUpload,
    onClearFilters,
}) => (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center">
        {!hasAnyTracks ? (
            <>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center mb-4">
                    <Music size={28} className="text-indigo-400" />
                </div>
                <h3 className="text-lg font-medium text-text-primary mb-1">No tracks yet</h3>
                <p className="text-sm text-text-secondary mb-4 max-w-[300px]">
                    Upload your first track to start building your music library
                </p>
                <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus size={16} />}
                    onClick={onUpload}
                >
                    Upload Track
                </Button>
            </>
        ) : (
            <>
                <Search size={24} className="text-text-tertiary mb-3" />
                <h3 className="text-sm text-text-secondary">No tracks match your filters</h3>
                <button
                    onClick={onClearFilters}
                    className="mt-2 text-xs text-[var(--primary-button-bg)] hover:underline"
                >
                    Clear filters
                </button>
            </>
        )}
    </div>
);
