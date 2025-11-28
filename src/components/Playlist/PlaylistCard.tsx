import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PlaySquare, MoreVertical } from 'lucide-react';
import type { Playlist } from '../../services/playlistService';
import { PlaylistMenu } from './PlaylistMenu';


interface PlaylistCardProps {
    playlist: Playlist;
    navigate: (path: string) => void;
    handleMenuClick: (e: React.MouseEvent, id: string) => void;
    menuButtonRefs: React.MutableRefObject<{ [key: string]: HTMLButtonElement | null }>;
    openMenuId: string | null;
    setOpenMenuId: (id: string | null) => void;
    handleEdit: (e: React.MouseEvent, playlist: Playlist) => void;
    handleDeleteClick: (e: React.MouseEvent, id: string) => void;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
    playlist,
    navigate,
    handleMenuClick,
    menuButtonRefs,
    openMenuId,
    setOpenMenuId,
    handleEdit,
    handleDeleteClick
}) => {
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
                    {playlist.coverImage ? (
                        <img src={playlist.coverImage} alt={playlist.name} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
                    ) : (
                        <PlaySquare size={48} className="text-text-secondary" />
                    )}
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white px-1 py-0.5 rounded text-xs font-medium">
                        {playlist.videoIds.length} videos
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
                            ref={el => { menuButtonRefs.current[playlist.id] = el; }}
                            onClick={(e) => handleMenuClick(e, playlist.id)}
                            className="bg-transparent border-none p-2 rounded-full cursor-pointer text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all hover:bg-black/20 dark:hover:bg-white/20"
                            onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on menu click
                        >
                            <MoreVertical size={20} />
                        </button>
                        <PlaylistMenu
                            isOpen={openMenuId === playlist.id}
                            onClose={() => setOpenMenuId(null)}
                            anchorEl={menuButtonRefs.current[playlist.id]}
                            onEdit={(e) => handleEdit(e, playlist)}
                            onDelete={(e) => handleDeleteClick(e, playlist.id)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

interface SortablePlaylistCardProps extends PlaylistCardProps {
    // No extra props needed currently
}

export const SortablePlaylistCard: React.FC<SortablePlaylistCardProps> = (props) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: props.playlist.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1000 : 'auto',
        opacity: isDragging ? 0.5 : 1,
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
