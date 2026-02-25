import { useEffect } from 'react';
import { useVideoSelectionStore } from '../../../core/stores/videoSelectionStore';
import { useAppContextStore } from '../../../core/stores/appContextStore';
import { useVideos } from '../../../core/hooks/useVideos';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { videoToCardContext } from '../../../core/utils/videoAdapters';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';

/**
 * Shared bridge: syncs ALL globally-selected videos → appContextStore
 * so the chat assistant always sees the current selection as context.
 *
 * Call this hook from any page that should keep the context bridge alive
 * (PlaylistDetailPage, PlaylistsPage, etc.).
 *
 * Priority: When canvas overlay is open, canvas bridge takes precedence
 * and this bridge yields (clears its items and exits early).
 */
export const useSelectionContextBridge = () => {
    const selections = useVideoSelectionStore(s => s.selections);
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const setContextItems = useAppContextStore(s => s.setItems);
    const clearContextItems = useAppContextStore(s => s.clearItems);
    const canvasIsOpen = useCanvasStore(s => s.isOpen);

    useEffect(() => {
        // Canvas bridge takes priority when canvas is open
        if (canvasIsOpen) {
            // Only remove playlist items (video-card), preserve canvas-selection context
            const currentItems = useAppContextStore.getState().items;
            const nonPlaylistItems = currentItems.filter(c => c.type !== 'video-card');
            setContextItems(nonPlaylistItems);
            return;
        }

        // Collect all selected IDs across every scope
        const allIds = new Set<string>();
        for (const ids of Object.values(selections)) {
            for (const id of ids) allIds.add(id);
        }

        if (allIds.size === 0) {
            clearContextItems();
            return;
        }

        const selectedVideos = videos.filter(v => allIds.has(v.id));
        const contextItems = selectedVideos.map(v =>
            videoToCardContext(v, currentChannel?.name),
        );
        setContextItems(contextItems);
    }, [selections, videos, currentChannel?.name, setContextItems, clearContextItems, canvasIsOpen]);
};
