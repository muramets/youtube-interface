import React, { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PlaySquare, MoreVertical } from 'lucide-react';
import type { Playlist } from '../../core/services/playlistService';
import { PlaylistMenu } from './PlaylistMenu';
import { useVideos } from '../../core/hooks/useVideos';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';


interface PlaylistCardProps {
    playlist: Playlist;
    navigate: (path: string) => void;
    handleMenuClick: (e: React.MouseEvent, id: string) => void;
    openMenuId: string | null;
    setOpenMenuId: (id: string | null) => void;
    handleEdit: (e: React.MouseEvent, playlist: Playlist) => void;
    handleDeleteClick: (e: React.MouseEvent, id: string) => void;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
    playlist,
    navigate,
    handleMenuClick,
    openMenuId,
    setOpenMenuId,
    handleEdit,
    handleDeleteClick
}) => {
    const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');

    // Compute effective cover image:
    // 1. If playlist has a custom coverImage that is NOT a YouTube thumbnail, use it
    // 2. Otherwise, use the thumbnail of the last video in the playlist that still exists
    const effectiveCoverImage = useMemo(() => {
        // If playlist has an explicit cover that isn't a youtube thumbnail, keep it
        if (playlist.coverImage && !playlist.coverImage.includes('ytimg.com')) {
            return playlist.coverImage;
        }

        // Find videos that are still in the playlist
        const validVideos = playlist.videoIds
            .map(vid => videos.find(v => v.id === vid))
            .filter(Boolean);

        if (validVideos.length === 0) return playlist.coverImage || '';

        // If the current cover is from a video no longer in the playlist, update it
        const lastVideo = validVideos[validVideos.length - 1];
        if (lastVideo && playlist.coverImage !== lastVideo.thumbnail && playlist.coverImage !== lastVideo.customImage) {
            // Check if current cover belongs to any video in playlist
            const coverBelongsToPlaylist = validVideos.some(v =>
                v && (v.thumbnail === playlist.coverImage || v.customImage === playlist.coverImage)
            );
            if (!coverBelongsToPlaylist) {
                // Cover is from a removed video, use last video's thumbnail
                return lastVideo.customImage || lastVideo.thumbnail;
            }
        }

        return playlist.coverImage || lastVideo?.customImage || lastVideo?.thumbnail || '';
    }, [playlist.coverImage, playlist.videoIds, videos]);

    // Compute valid video count (only videos that exist in DB)
    const validVideoCount = useMemo(() => {
        return playlist.videoIds.filter(vid => videos.some(v => v.id === vid)).length;
    }, [playlist.videoIds, videos]);

    return (
        <div
            className="group relative p-2 rounded-xl cursor-pointer flex flex-col h-full z-0"
            onClick={() => navigate(`/playlists/${playlist.id}`)}
        >
            {/* Hover Substrate */}
            <div className="absolute inset-0 bg-hover-bg rounded-xl opacity-0 scale-90 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:scale-100 -z-10 pointer-events-none" />

            <div className="flex flex-col relative h-full rounded-xl">
                {/* Cover Image Area */}
                <div className="aspect-video bg-bg-secondary flex items-center justify-center relative rounded-t-xl overflow-hidden">
                    {effectiveCoverImage ? (
                        <img src={effectiveCoverImage} alt={playlist.name} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" draggable={false} />
                    ) : (
                        <PlaySquare size={48} className="text-text-secondary" />
                    )}
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white px-1 py-0.5 rounded text-xs font-medium">
                        {validVideoCount} videos
                    </div>
                </div>

                {/* Info Area */}
                <div className="p-3 relative">
                    <div className="pr-6">
                        <h3 className="m-0 mb-1 text-base text-text-primary font-bold line-clamp-2">{playlist.name}</h3>
                        <p className="m-0 text-xs text-text-secondary">
                            {playlist.updatedAt && playlist.updatedAt > playlist.createdAt
                                ? `Updated ${new Date(playlist.updatedAt).toLocaleDateString()}`
                                : `Created ${new Date(playlist.createdAt).toLocaleDateString()}`
                            }
                        </p>
                    </div>
                    <div className="absolute top-3 right-0">
                        <button
                            onClick={(e) => {
                                setAnchorEl(e.currentTarget);
                                handleMenuClick(e, playlist.id);
                            }}
                            className="border-none p-2 rounded-full cursor-pointer text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all hover:bg-black/20 dark:hover:bg-white/20"
                            onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on menu click
                        >
                            <MoreVertical size={20} />
                        </button>
                        <PlaylistMenu
                            isOpen={openMenuId === playlist.id}
                            onClose={() => {
                                setOpenMenuId(null);
                                setAnchorEl(null);
                            }}
                            anchorEl={anchorEl}
                            onEdit={(e) => handleEdit(e, playlist)}
                            onDelete={(e) => handleDeleteClick(e, playlist.id)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const SortablePlaylistCard: React.FC<PlaylistCardProps & { isDragEnabled?: boolean }> = ({ isDragEnabled = true, ...props }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: props.playlist.id, disabled: !isDragEnabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1000 : 'auto',
        opacity: isDragging ? 0 : 1, // Completely hide when dragging - DragOverlay shows the ghost
        touchAction: 'none',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
        >
            <PlaylistCard {...props} />
        </div>
    );
};
