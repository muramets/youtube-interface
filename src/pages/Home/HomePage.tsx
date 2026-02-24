import React from 'react';
import { VideoGrid } from '../../features/Video/VideoGrid';
import { CategoryBar } from './components/CategoryBar';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideos } from '../../core/hooks/useVideos';
import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useVideoSelection } from '../../features/Video/hooks/useVideoSelection';
import { VideoSelectionFloatingBar } from '../../features/Video/components/VideoSelectionFloatingBar';
import { useFilterStore } from '../../core/stores/filterStore';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import { useUIStore } from '../../core/stores/uiStore';
import { videoToCardContext } from '../../core/utils/videoAdapters';

export const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos, isLoading, updateVideo, removeVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlists } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { savePageState, loadPageState } = useFilterStore();
    const addNodeToPage = useCanvasStore((s) => s.addNodeToPage);
    const { showToast } = useUIStore();

    // Per-page state persistence: load on enter, save on leave
    React.useEffect(() => {
        loadPageState('home');
        return () => savePageState('home');
    }, [loadPageState, savePageState]);

    const {
        selectedIds,
        toggleSelection,
        clearSelection,
        isSelectionMode
    } = useVideoSelection();

    const handleBulkDelete = async (ids: string[]) => {
        if (!user || !currentChannel) return;

        // Smart delete logic:
        // - If in any playlist → Soft delete (hide from Home, keep in DB/Playlists)
        // - If not in any playlist → Hard delete (no references exist, safe to remove)
        const promises = ids.map(videoId => {
            const isInAnyPlaylist = playlists.some(p => p.videoIds.includes(videoId));
            if (isInAnyPlaylist) {
                return updateVideo({ videoId, updates: { isPlaylistOnly: true, addedToHomeAt: 0 } });
            } else {
                return removeVideo(videoId);
            }
        });

        await Promise.all(promises);
        clearSelection();
    };

    const handleAddToCanvas = React.useCallback((ids: string[], pageId: string, pageTitle: string) => {
        const videosToAdd = videos.filter((v) => ids.includes(v.id))
            .sort((a, b) => {
                const da = a.mergedVideoData?.publishedAt || a.publishedAt || '';
                const db = b.mergedVideoData?.publishedAt || b.publishedAt || '';
                return da < db ? -1 : da > db ? 1 : 0; // oldest first → leftmost on canvas
            });
        const dataArr = videosToAdd.map((v) => videoToCardContext(v, currentChannel?.name));
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
        clearSelection();
    }, [videos, currentChannel?.name, addNodeToPage, showToast, clearSelection]);

    return (
        <div className="h-full flex flex-col">
            <CategoryBar />
            <div className="flex-1 min-h-0 relative">
                <VideoGrid
                    isLoading={isLoading}
                    selectedIds={selectedIds}
                    onToggleSelection={toggleSelection}
                    isSelectionMode={isSelectionMode}
                />

                <VideoSelectionFloatingBar
                    selectedIds={selectedIds}
                    onClearSelection={clearSelection}
                    onDelete={handleBulkDelete}
                    onAddToCanvas={handleAddToCanvas}
                />
            </div>
        </div>
    );
};
