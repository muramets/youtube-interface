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

export const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { isLoading, updateVideo, removeVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlists } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { savePageState, loadPageState } = useFilterStore();

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
        // - If in any playlist -> Soft delete (hide from home)
        // - If not in any playlist -> Hard delete
        const promises = ids.map(videoId => {
            const isInAnyPlaylist = playlists.some(p => p.videoIds.includes(videoId));

            if (isInAnyPlaylist) {
                // Soft delete: Hide from Home, keep in DB/Playlists
                return updateVideo({
                    videoId,
                    updates: {
                        isPlaylistOnly: true,
                        addedToHomeAt: 0
                    }
                });
            } else {
                // Hard delete
                return removeVideo(videoId);
            }
        });

        await Promise.all(promises);
        clearSelection();
    };

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
                />
            </div>
        </div>
    );
};
