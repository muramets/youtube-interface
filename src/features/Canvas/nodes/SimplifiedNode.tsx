// =============================================================================
// Canvas: SimplifiedNode — lightweight rectangle for LOD at low zoom
// Replaces full card content when zoom < LOD_THRESHOLD to improve perf.
// =============================================================================

import React from 'react';
import type { CanvasNode } from '../../../core/types/canvas';
import {
    NODE_HEIGHT_FALLBACK,
    TRAFFIC_NODE_HEIGHT_ESTIMATE,
    STICKY_NOTE_HEIGHT_ESTIMATE,
} from '../../../core/stores/canvas/constants';

/** Colors per node type — visually distinct but muted */
const TYPE_COLORS: Record<string, string> = {
    'video-card': 'rgba(99, 102, 241, 0.35)',   // indigo
    'traffic-source': 'rgba(34, 197, 94, 0.30)',     // green
    'sticky-note': 'rgba(250, 204, 21, 0.35)',    // yellow
    'suggested-traffic': 'rgba(168, 85, 247, 0.30)',    // purple
    'image': 'rgba(6, 182, 212, 0.30)',              // cyan
};

/** Fallback height when parent doesn't provide one (auto-height nodes) */
const TYPE_HEIGHTS: Record<string, number> = {
    'video-card': NODE_HEIGHT_FALLBACK,
    'traffic-source': TRAFFIC_NODE_HEIGHT_ESTIMATE,
    'sticky-note': STICKY_NOTE_HEIGHT_ESTIMATE,
    'suggested-traffic': TRAFFIC_NODE_HEIGHT_ESTIMATE,
    'image': 200,
};

interface SimplifiedNodeProps {
    node: CanvasNode;
    /** Measured height from store's nodeSizes — use as authoritative height */
    measuredHeight?: number;
}

/** Minimal placeholder — colored rectangle. Uses measured height if available. */
const SimplifiedNode: React.FC<SimplifiedNodeProps> = ({ node, measuredHeight }) => {
    const bg = TYPE_COLORS[node.type] ?? 'rgba(148, 163, 184, 0.25)';
    // Use measured height (from ResizeObserver) → node.size.h → type fallback
    // || (not ??) so that 0 values (auto-height nodes) fall through to the fallback
    const h = measuredHeight || node.size?.h || TYPE_HEIGHTS[node.type] || NODE_HEIGHT_FALLBACK;

    return (
        <div
            style={{
                width: '100%',
                height: h,
                background: bg,
                borderRadius: 8,
                border: '1px solid rgba(148, 163, 184, 0.15)',
            }}
        />
    );
};

export default React.memo(SimplifiedNode);
