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
 * Call this hook from any page that should keep the context bridge alive
 * (PlaylistDetailPage, PlaylistsPage, HomePage, etc.).
 *
 * Each bridge writes to its own slot — no priority coordination needed.
 */
export const useSelectionContextBridge = () => {
    const selections = useVideoSelectionStore(s => s.selections);
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const setSlot = useAppContextStore(s => s.setSlot);
    const clearSlot = useAppContextStore(s => s.clearSlot);

    useEffect(() => {
        // Collect all selected IDs across every scope
        const allIds = new Set<string>();
        for (const ids of Object.values(selections)) {
            for (const id of ids) allIds.add(id);
        }

        if (allIds.size === 0) {
            clearSlot('playlist');
            return;
        }

        const selectedVideos = videos.filter(v => allIds.has(v.id));
        debug.context(`🔗 SelectionBridge: ${allIds.size} selected IDs, ${selectedVideos.length} matched in videos[] (${videos.length} total)`);
        const contextItems = selectedVideos.map(v =>
            videoToCardContext(v, currentChannel?.name),
        );
        setSlot('playlist', contextItems);
    }, [selections, videos, currentChannel?.name, setSlot, clearSlot]);
};
