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
import type { VideoCardContext } from '../../core/types/appContext';

export const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos, isLoading, updateVideo, removeVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlists } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { savePageState, loadPageState } = useFilterStore();
    const addCanvasNode = useCanvasStore((s) => s.addNode);
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

    const handleAddToCanvas = React.useCallback((ids: string[]) => {
        const videosToAdd = videos.filter((v) => ids.includes(v.id))
            .sort((a, b) => {
                const da = a.mergedVideoData?.publishedAt || a.publishedAt || '';
                const db = b.mergedVideoData?.publishedAt || b.publishedAt || '';
                return da < db ? -1 : da > db ? 1 : 0; // oldest first → leftmost on canvas
            });
        videosToAdd.forEach((v) => {
            let ownership: VideoCardContext['ownership'];
            if (v.isCustom && !v.publishedVideoId) ownership = 'own-draft';
            else if (v.isCustom) ownership = 'own-published';
            else if (v.channelTitle === currentChannel?.name) ownership = 'own-published';
            else ownership = 'competitor';

            const publishedAt = v.mergedVideoData?.publishedAt || v.publishedAt || null;
            const viewCount = v.mergedVideoData?.viewCount || v.viewCount || null;
            const duration = v.mergedVideoData?.duration || null;

            const contextItem: VideoCardContext = {
                type: 'video-card',
                ownership,
                videoId: v.id,
                title: v.title,
                description: v.description || '',
                tags: v.tags || [],
                thumbnailUrl: v.customImage || v.thumbnail,
                ...(viewCount && ownership !== 'own-draft' ? { viewCount } : {}),
                ...(publishedAt && ownership !== 'own-draft' ? { publishedAt } : {}),
                ...(duration ? { duration } : {}),
                ...(v.channelTitle ? { channelTitle: v.channelTitle } : {}),
            };
            addCanvasNode(contextItem);
        });
        showToast(
            videosToAdd.length === 1 ? 'Added to Canvas' : `${videosToAdd.length} videos added to Canvas`,
            'success'
        );
        clearSelection();
    }, [videos, currentChannel?.name, addCanvasNode, showToast, clearSelection]);

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
