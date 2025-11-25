import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { VideoCard } from './VideoCard';
import type { VideoDetails } from '../../utils/youtubeApi';

interface SortableVideoCardProps {
    video: VideoDetails;
    playlistId?: string;
    scale?: number;
    onMenuOpenChange?: (isOpen: boolean) => void;
}

export const SortableVideoCard: React.FC<SortableVideoCardProps> = ({ video, playlistId, scale = 1, onMenuOpenChange }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: video.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
        touchAction: 'none',
        position: 'relative' as const,
        zIndex: isDragging ? 999 : 'auto',
        // Apply scale if provided (for WatchPage sidebar)
        ...(scale !== 1 ? {
            transform: `${CSS.Transform.toString(transform)} scale(${scale})`,
            transformOrigin: 'top left',
            marginBottom: `calc(-${(1 - scale) * 100}% + 12px)`
        } : {})
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <VideoCard video={video} playlistId={playlistId} onMenuOpenChange={onMenuOpenChange} />
        </div>
    );
};
