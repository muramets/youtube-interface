import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RecommendationCard } from './RecommendationCard';
import type { VideoDetails } from '../../core/utils/youtubeApi';

interface SortableRecommendationCardProps {
    video: VideoDetails;
    playlistId?: string;
    onMenuOpenChange?: (isOpen: boolean) => void;
}

export const SortableRecommendationCard: React.FC<SortableRecommendationCardProps> = ({ video, playlistId, onMenuOpenChange }) => {
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
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <RecommendationCard video={video} playlistId={playlistId} onMenuOpenChange={onMenuOpenChange} />
        </div>
    );
};
