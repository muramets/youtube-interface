// =============================================================================
// Canvas: Viewport Culling — determine which nodes are visible on screen
// =============================================================================

import type { CanvasNode, CanvasViewport } from '../../../core/types/canvas';
import { NODE_WIDTH, NODE_HEIGHT_FALLBACK, TRAFFIC_NODE_WIDTH } from '../../../core/stores/canvas/constants';

/** Baseline margin (screen px) around viewport to prevent pop-in during pan */
const CULL_MARGIN_BASE = 300;
/** Cap so we don't over-render at extreme zoom */
const CULL_MARGIN_MAX = 800;

/** Get default width for a node based on type */
function getNodeWidth(node: CanvasNode): number {
    if (node.size?.w) return node.size.w;
    return node.type === 'traffic-source' ? TRAFFIC_NODE_WIDTH : NODE_WIDTH;
}

/** Get node height — prefer measured size, fall back to constant */
function getNodeHeight(node: CanvasNode, measuredHeight?: number): number {
    if (node.size?.h) return node.size.h;
    return measuredHeight ?? NODE_HEIGHT_FALLBACK;
}

/**
 * Check if a node is within the visible viewport (with zoom-proportional margin).
 *
 * World-to-screen transform:
 *   screenX = worldX * zoom + viewport.x
 *   screenY = worldY * zoom + viewport.y
 *
 * Margin scales with zoom: at zoom=2× → 600px buffer (capped at 800px).
 * This prevents edge pop-in when panning fast at high zoom.
 */
export function isNodeVisible(
    node: CanvasNode,
    viewport: CanvasViewport,
    screenW: number,
    screenH: number,
    measuredHeight?: number,
): boolean {
    if (!node.position) return false;

    const { x: vx, y: vy, zoom } = viewport;
    const w = getNodeWidth(node);
    const h = getNodeHeight(node, measuredHeight);

    // Node bounding box in screen coordinates
    const left = node.position.x * zoom + vx;
    const top = node.position.y * zoom + vy;
    const right = left + w * zoom;
    const bottom = top + h * zoom;

    // Zoom-proportional margin: bigger buffer at higher zoom
    const margin = Math.min(CULL_MARGIN_BASE * Math.max(zoom, 1), CULL_MARGIN_MAX);

    // Screen bounds with margin
    const sLeft = -margin;
    const sTop = -margin;
    const sRight = screenW + margin;
    const sBottom = screenH + margin;

    // AABB overlap check
    return right > sLeft && left < sRight && bottom > sTop && top < sBottom;
}
