import React from 'react';

export interface SelectionRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface TimelineSelectionOverlayProps {
    selectionRect: SelectionRect | null;
}

export const TimelineSelectionOverlay: React.FC<TimelineSelectionOverlayProps> = ({ selectionRect }) => {
    if (!selectionRect) return null;

    return (
        <div
            className="absolute z-50 pointer-events-none bg-blue-500/20 border border-blue-500 rounded-sm"
            style={{
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.width,
                height: selectionRect.height
            }}
        />
    );
};
