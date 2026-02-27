import { useEffect } from 'react';
import { useVideoSelectionStore } from '../../../core/stores/videoSelectionStore';
import { useAppContextStore } from '../../../core/stores/appContextStore';
import { useVideos } from '../../../core/hooks/useVideos';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { videoToCardContext } from '../../../core/utils/videoAdapters';
import { debug } from '../../../core/utils/debug';

/**
 * Shared bridge: syncs ALL globally-selected videos → appContextStore 'playlist' slot
 * so the chat assistant always sees the current selection as context.
 *
 * Sticky behavior: deselecting does NOT remove context. Only explicit removal
 * via the ✕ button in chat input clears items. Respects global `isBridgePaused`.
 *
 * Call this hook from any page that should keep the context bridge alive
 * (PlaylistDetailPage, PlaylistsPage, HomePage, etc.).
 */
export const useSelectionContextBridge = () => {
    const selections = useVideoSelectionStore(s => s.selections);
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const setSlot = useAppContextStore(s => s.setSlot);
    const isBridgePaused = useAppContextStore(s => s.isBridgePaused);

    useEffect(() => {
        if (isBridgePaused) return;

        // Collect all selected IDs across every scope
        const allIds = new Set<string>();
        for (const ids of Object.values(selections)) {
            for (const id of ids) allIds.add(id);
        }

        // Sticky: deselect = no-op, context stays
        if (allIds.size === 0) return;

        const selectedVideos = videos.filter(v => allIds.has(v.id));
        const newItems = selectedVideos.map(v =>
            videoToCardContext(v, currentChannel?.name),
        );

        // Dedup: merge with existing slot items, replace by videoId
        const existing = useAppContextStore.getState().slots.playlist;
        const existingIds = new Set(existing.map(i => i.type === 'video-card' ? i.videoId : ''));
        const toAdd = newItems.filter(i => i.type === 'video-card' && !existingIds.has(i.videoId));

        if (toAdd.length > 0) {
            debug.context(`🔗 SelectionBridge: adding ${toAdd.length} new items (${existing.length} existing)`);
            setSlot('playlist', [...existing, ...toAdd]);
        }
    }, [selections, videos, currentChannel?.name, setSlot, isBridgePaused]);
};
