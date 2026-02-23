// =============================================================================
// useCanvasNicheSync — Auto-sync niche name & color from TrafficNicheStore
// into traffic-source canvas nodes whenever assignments or niches change.
// =============================================================================

import { useEffect } from 'react';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { useTrafficNicheStore } from '../../../core/stores/trends/useTrafficNicheStore';
import type { TrafficSourceCardData } from '../../../core/types/appContext';

/**
 * Watches niche assignments and niche definitions from TrafficNicheStore.
 * When a niche assignment changes (or the niche itself is renamed/recolored),
 * updates matching traffic-source nodes on the canvas in-place.
 *
 * Only runs when the canvas is open.
 */
export function useCanvasNicheSync(isOpen: boolean): void {
    const niches = useTrafficNicheStore((s) => s.niches);
    const assignments = useTrafficNicheStore((s) => s.assignments);

    useEffect(() => {
        if (!isOpen) return;

        const { nodes, updateNodeData } = useCanvasStore.getState();
        const trafficNodes = nodes.filter((n) => n.type === 'traffic-source' && n.position);
        if (trafficNodes.length === 0) return;

        // Build videoId → niche lookup
        const videoNicheMap = new Map<string, { name: string; color: string }>();
        for (const assignment of assignments) {
            const niche = niches.find((n) => n.id === assignment.nicheId);
            if (niche) {
                videoNicheMap.set(assignment.videoId, { name: niche.name, color: niche.color });
            }
        }

        for (const node of trafficNodes) {
            const data = node.data as TrafficSourceCardData;
            const nicheInfo = videoNicheMap.get(data.videoId);
            const newNiche = nicheInfo?.name ?? undefined;
            const newColor = nicheInfo?.color ?? undefined;

            // Only update if something actually changed
            if (data.niche !== newNiche || data.nicheColor !== newColor) {
                updateNodeData(node.id, {
                    niche: newNiche,
                    nicheColor: newColor,
                } as Partial<TrafficSourceCardData>);
            }
        }
    }, [isOpen, niches, assignments]);
}
