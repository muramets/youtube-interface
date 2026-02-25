import React from 'react';
import { useVideoSelectionStore } from '../../../core/stores/videoSelectionStore';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { useUIStore } from '../../../core/stores/uiStore';
import { useVideos } from '../../../core/hooks/useVideos';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { videoToCardContext } from '../../../core/utils/videoAdapters';

/**
 * Shared "Add to Canvas" action for video selections.
 * Resolves video IDs → video objects, adds to the target canvas page,
 * shows a toast, and clears all selections.
 */
export const useAddToCanvas = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const addNodeToPage = useCanvasStore(s => s.addNodeToPage);
    const { showToast } = useUIStore();
    const clearAll = useVideoSelectionStore(s => s.clearAll);

    return React.useCallback((ids: string[], pageId: string, pageTitle: string) => {
        const videosToAdd = videos.filter(v => ids.includes(v.id))
            .sort((a, b) => {
                const da = a.mergedVideoData?.publishedAt || a.publishedAt || '';
                const db = b.mergedVideoData?.publishedAt || b.publishedAt || '';
                return da < db ? -1 : da > db ? 1 : 0;
            });
        const dataArr = videosToAdd.map(v => videoToCardContext(v, currentChannel?.name));
        addNodeToPage(dataArr, pageId);
        showToast(
            videosToAdd.length === 1
                ? `Added to ${pageTitle} — click to open`
                : `${videosToAdd.length} videos added to ${pageTitle} — click to open`,
            'success',
            'Open',
            () => {
                const store = useCanvasStore.getState();
                if (store.activePageId !== pageId) store.switchPage(pageId);
                store.setOpen(true);
            },
        );
        clearAll();
    }, [videos, currentChannel?.name, addNodeToPage, showToast, clearAll]);
};
