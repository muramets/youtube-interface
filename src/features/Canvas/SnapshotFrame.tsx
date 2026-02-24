// =============================================================================
// CANVAS: SnapshotFrame — visual frame rectangle around grouped traffic nodes
// Purely decorative — not selectable, not draggable.
// Bounds are computed reactively from child node positions.
// =============================================================================

import React from 'react';

interface SnapshotFrameProps {
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Renders a labeled frame rectangle on the canvas.
 * Positioned absolutely within the canvas transform layer.
 */
export const SnapshotFrame: React.FC<SnapshotFrameProps> = React.memo(({ label, x, y, w, h }) => (
    <div
        className="snapshot-frame"
        style={{
            position: 'absolute',
            left: x,
            top: y,
            width: w,
            height: h,
            pointerEvents: 'none',
        }}
    >
        <div className="snapshot-frame__title">{label}</div>
    </div>
));

SnapshotFrame.displayName = 'SnapshotFrame';
