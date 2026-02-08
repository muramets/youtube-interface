import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { VideoCard } from './VideoCard';
import type { VideoDetails } from '../../core/utils/youtubeApi';
import type { VideoDeltaStats } from '../Playlists/hooks/usePlaylistDeltaStats';
import type { VideoCardAnonymizeData } from './VideoCard';

interface SortableVideoCardProps {
    video: VideoDetails;
    playlistId?: string;
    scale?: number;
    onMenuOpenChange?: (isOpen: boolean) => void;
    onRemove?: (id: string) => void;
    onSetAsCover?: (id: string) => void;
    isSelected?: boolean;
    onToggleSelection?: (id: string) => void;
    isSelectionMode?: boolean;
    deltaStats?: VideoDeltaStats;
    rankingOverlay?: number | null;
    anonymizeData?: VideoCardAnonymizeData;
}

export const SortableVideoCard: React.FC<SortableVideoCardProps> = ({ video, playlistId, scale = 1, onMenuOpenChange, onRemove, onSetAsCover, isSelected, onToggleSelection, isSelectionMode, deltaStats, rankingOverlay, anonymizeData }) => {
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
                isSelected={isSelected}
                onToggleSelection={onToggleSelection}
                isSelectionMode={isSelectionMode}
                deltaStats={deltaStats}
                rankingOverlay={rankingOverlay}
                anonymizeData={anonymizeData}
            />
        </div>
    );
};
