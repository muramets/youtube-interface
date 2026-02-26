// =============================================================================
// useCanvasContextBridge — Sync canvas selection → appContextStore for AI chat
// =============================================================================
//
// When canvas is open and nodes are selected, this bridge maps selected nodes
// into a grouped CanvasSelectionContext and pushes it to the 'canvas' slot.
// The chat assistant reads this to enrich its prompts.
//
// Each bridge writes to its own slot — no priority coordination needed.
// =============================================================================

import { useEffect, useRef } from 'react';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { useAppContextStore } from '../../../core/stores/appContextStore';
import { useChatStore } from '../../../core/stores/chatStore';
import type { CanvasContextNode, VideoContextNode, TrafficSourceContextNode, StickyNoteContextNode, ImageContextNode } from '../../../core/types/appContext';
import type { CanvasNode } from '../../../core/types/canvas';
import type { VideoCardContext, TrafficSourceCardData } from '../../../core/types/appContext';
import type { StickyNoteData, ImageNodeData } from '../../../core/types/canvas';
import { debug } from '../../../core/utils/debug';

/**
 * Maps a CanvasNode to a CanvasContextNode for AI context.
 * Returns null for unsupported node types (e.g. future types).
 */
function mapNodeToContext(node: CanvasNode): CanvasContextNode | null {
    const { data } = node;

    switch (data.type) {
        case 'video-card': {
            const v = data as VideoCardContext;
            const result: VideoContextNode = {
                nodeType: 'video',
                videoId: v.videoId,
                title: v.title,
                description: v.description || '',
                tags: v.tags || [],
                thumbnailUrl: v.thumbnailUrl || '',
                channelTitle: v.channelTitle,
                viewCount: v.viewCount,
                publishedAt: v.publishedAt,
                duration: v.duration,
                ownership: v.ownership,
            };
            return result;
        }

        case 'traffic-source': {
            const t = data as TrafficSourceCardData;
            const result: TrafficSourceContextNode = {
                nodeType: 'traffic-source',
                videoId: t.videoId,
                title: t.title,
                thumbnailUrl: t.thumbnailUrl,
                channelTitle: t.channelTitle,
                impressions: t.impressions,
                ctr: t.ctr,
                views: t.views,
                avgViewDuration: t.avgViewDuration,
                watchTimeHours: t.watchTimeHours,
                trafficType: t.trafficType,
                viewerType: t.viewerType,
                niche: t.niche,
                sourceVideoTitle: t.sourceVideoTitle,
            };
            return result;
        }

        case 'sticky-note': {
            const s = data as StickyNoteData;
            if (!s.content?.trim()) return null; // Skip empty notes
            const result: StickyNoteContextNode = {
                nodeType: 'sticky-note',
                content: s.content,
                noteColor: s.color || 'yellow',
            };
            return result;
        }

        case 'image': {
            const img = data as ImageNodeData;
            const result: ImageContextNode = {
                nodeType: 'image',
                imageUrl: img.downloadUrl || '',
                alt: img.alt,
            };
            return result;
        }

        default:
            return null;
    }
}

/**
 * Sync selected canvas nodes → appContextStore 'canvas' slot (accumulative).
 *
 * When selection becomes non-empty, a NEW canvas-selection group is appended
 * within the canvas slot. When selection is cleared, context stays —
 * the user removes groups manually via the ✕ button in the chat input.
 *
 * Only active when `isOpen` is true (canvas overlay is visible).
 */
export function useCanvasContextBridge(isOpen: boolean): void {
    const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
    const nodes = useCanvasStore((s) => s.nodes);
    const setSlot = useAppContextStore((s) => s.setSlot);
    const chatIsOpen = useChatStore((s) => s.isOpen);
    const contextBridgePaused = useCanvasStore((s) => s.contextBridgePaused);

    // Track the previous selection to detect meaningful changes (new non-empty selection)
    const prevSelectionRef = useRef<Set<string>>(new Set());
    const prevChatOpenRef = useRef(false);

    useEffect(() => {
        // When chat just opened, reset selection tracking so current selection loads immediately
        if (chatIsOpen && !prevChatOpenRef.current) {
            prevSelectionRef.current = new Set();
        }
        prevChatOpenRef.current = chatIsOpen;

        if (!isOpen || !chatIsOpen || contextBridgePaused) {
            debug.context(`🎨 CanvasBridge: skipped (isOpen=${isOpen}, chatIsOpen=${chatIsOpen}, paused=${contextBridgePaused})`);
            return;
        }

        // Only act on transitions from empty → non-empty or changed non-empty selection
        const prevIds = prevSelectionRef.current;
        const currentIds = selectedNodeIds;
        prevSelectionRef.current = new Set(currentIds);

        // Skip if selection is empty (deselect = no-op, context stays)
        if (currentIds.size === 0) return;

        // Skip if selection hasn't changed (prevents duplicate groups from re-renders)
        if (
            prevIds.size === currentIds.size &&
            [...currentIds].every((id) => prevIds.has(id))
        ) return;

        const selectedNodes = nodes.filter((n) => currentIds.has(n.id));
        const contextNodes = selectedNodes
            .map(mapNodeToContext)
            .filter((n): n is CanvasContextNode => n !== null);

        if (contextNodes.length === 0) return;

        // Imperative read from own slot: avoids deps → no feedback loop
        const currentCanvasItems = useAppContextStore.getState().slots.canvas;
        debug.context(`🎨 CanvasBridge: appending ${contextNodes.length} nodes (${contextNodes.map(n => n.nodeType).join(', ')}), ${currentCanvasItems.length} existing groups`);
        setSlot('canvas', [...currentCanvasItems, { type: 'canvas-selection', nodes: contextNodes }]);
    }, [isOpen, chatIsOpen, contextBridgePaused, selectedNodeIds, nodes, setSlot]);
}
