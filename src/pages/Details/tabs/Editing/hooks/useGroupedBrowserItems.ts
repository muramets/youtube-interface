// =============================================================================
// useGroupedBrowserItems: Groups filtered tracks by groupId for accordion display
// =============================================================================

import { useMemo } from 'react';
import type { Track } from '../../../../../core/types/track';

export type BrowserDisplayItem =
    | { type: 'single'; track: Track }
    | { type: 'group'; groupId: string; tracks: Track[] };

/**
 * Transforms a flat track array into display items with group awareness.
 * Tracks sharing a groupId (2+) become a single 'group' item;
 * standalone tracks become 'single' items.
 */
export function useGroupedBrowserItems(filteredTracks: Track[]): BrowserDisplayItem[] {
    return useMemo(() => {
        const items: BrowserDisplayItem[] = [];
        const seenGroupIds = new Set<string>();

        for (const track of filteredTracks) {
            if (track.groupId) {
                if (seenGroupIds.has(track.groupId)) continue;
                seenGroupIds.add(track.groupId);

                const groupTracks = filteredTracks
                    .filter((t) => t.groupId === track.groupId)
                    .sort((a, b) => {
                        if (a.groupOrder !== undefined && b.groupOrder !== undefined) {
                            return a.groupOrder - b.groupOrder;
                        }
                        return b.createdAt - a.createdAt;
                    });

                if (groupTracks.length >= 2) {
                    items.push({ type: 'group', groupId: track.groupId, tracks: groupTracks });
                } else {
                    items.push({ type: 'single', track: groupTracks[0] });
                }
            } else {
                items.push({ type: 'single', track });
            }
        }

        return items;
    }, [filteredTracks]);
}
