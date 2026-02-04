import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { VideoCard } from './VideoCard';
import type { VideoDetails } from '../../core/utils/youtubeApi';

interface SortableVideoCardProps {
    video: VideoDetails;
    playlistId?: string;
    scale?: number;
    onMenuOpenChange?: (isOpen: boolean) => void;
    onRemove?: (id: string) => void;
    onSetAsCover?: (id: string) => void;
}

export const SortableVideoCard: React.FC<SortableVideoCardProps> = ({ video, playlistId, scale = 1, onMenuOpenChange, onRemove, onSetAsCover }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: video.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
        cursor: 'grab',
        touchAction: 'none',
        // Apply scaling if provided (for WatchPage sidebar)
        ...(scale !== 1 ? {
            width: `${scale * 100}%`,
            fontSize: `${scale}rem`,
        } : {}),
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <VideoCard
                video={video}
                playlistId={playlistId}
                onMenuOpenChange={onMenuOpenChange}
                onRemove={onRemove || (() => { })}
                onSetAsCover={onSetAsCover}
            />
        </div>
    );
};
