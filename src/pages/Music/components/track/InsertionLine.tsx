import React from 'react';

/**
 * Horizontal insertion line indicator shown during drag-and-drop operations.
 * Used in two contexts:
 *   - TrackGroupCard: between group children during external drop
 *   - BetweenDropZone: between virtualizer rows during group-child-sort drag
 */
export const InsertionLine: React.FC<{ className?: string }> = ({ className }) => (
    <div className={`flex items-center gap-2 px-4 ${className ?? ''}`}>
        <div className="w-2 h-2 rounded-full bg-indigo-400/80 shrink-0" />
        <div className="flex-1 h-[2px] bg-indigo-400/50 rounded-full" />
    </div>
);
