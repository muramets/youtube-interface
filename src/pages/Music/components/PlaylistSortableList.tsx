// =============================================================================
// PLAYLIST SORTABLE LIST
// Switches between virtualizer (normal view) and DnD sortable (playlist reorder).
//
// Extracted from MusicPage.tsx — previously defined at the bottom of that file.
// =============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GripVertical } from 'lucide-react';
import {
    DndContext,
    DragOverlay,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TrackCard } from './track/TrackCard';
import { TrackGroupCard } from './track/TrackGroupCard';
import { TrackCardGhost } from './track/TrackCardGhost';
import type { Track } from '../../../core/types/track';
import type { TrackSource } from '../../../core/types/musicPlaylist';
import type { DisplayItem } from '../hooks/useTrackDisplay';

// -----------------------------------------------------------------------------
// SortablePlaylistTrackItem — drag-handle wrapper for playlist reorder mode
// -----------------------------------------------------------------------------

interface SortablePlaylistTrackItemProps {
    track: Track;
    selectedTrackId: string | null;
    userId: string;
    channelId: string;
    onSelect: (trackId: string | null) => void;
    onDelete?: (trackId: string) => void;
    onEdit?: (track: Track) => void;
    isReadOnly?: boolean;
    trackSource?: TrackSource;
    sourceName?: string;
}

const SortablePlaylistTrackItem: React.FC<SortablePlaylistTrackItemProps> = React.memo(
    ({ track, selectedTrackId, userId, channelId, onSelect, onDelete, onEdit, isReadOnly, trackSource, sourceName }) => {
        const {
            attributes,
            listeners,
            setNodeRef,
            transform,
            transition,
            isDragging,
        } = useSortable({ id: track.id });

        const style: React.CSSProperties = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0 : 1,
            position: 'relative' as const,
            zIndex: isDragging ? 50 : 'auto',
            userSelect: 'none',
        };

        return (
            <div ref={setNodeRef} style={style} className="flex items-center">
                {/* Drag handle — hidden in read-only (shared playlist) */}
                {!isReadOnly && (
                    <div
                        {...attributes}
                        {...listeners}
                        className="flex-shrink-0 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                        <GripVertical size={14} />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <TrackCard
                        track={track}
                        isSelected={selectedTrackId === track.id}
                        userId={userId}
                        channelId={channelId}
                        onSelect={onSelect}
                        onDelete={onDelete}
                        onEdit={onEdit}
                        disableDrag
                        disableDropTarget
                        isReadOnly={isReadOnly}
                        trackSource={trackSource}
                        sourceName={sourceName}
                    />
                </div>
            </div>
        );
    }
);
SortablePlaylistTrackItem.displayName = 'SortablePlaylistTrackItem';

// -----------------------------------------------------------------------------
// PlaylistSortableListProps
// -----------------------------------------------------------------------------

export interface PlaylistSortableListProps {
    isPlaylistDragMode: boolean;
    displayItems: DisplayItem[];
    filteredTracks: Track[];
    virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
    selectedTrackId: string | null;
    userId: string;
    channelId: string;
    isReadOnly: boolean;
    activePlaylistId: string | null;
    setSelectedTrackId: (id: string | null) => void;
    handleDeleteTrack: (id: string) => void;
    handleEditTrack: (track: Track) => void;
    reorderPlaylistTracks: (userId: string, channelId: string, playlistId: string, orderedTrackIds: string[]) => Promise<void>;
    trackSource?: TrackSource;
    /** trackId → channel name, populated in playlist All mode for shared tracks */
    sourceNameMap?: Record<string, string>;
}

// -----------------------------------------------------------------------------
// PlaylistSortableList — switches between virtualizer and DnD sortable modes
// -----------------------------------------------------------------------------

export const PlaylistSortableList: React.FC<PlaylistSortableListProps> = ({
    isPlaylistDragMode,
    displayItems,
    filteredTracks,
    virtualizer,
    selectedTrackId,
    userId,
    channelId,
    isReadOnly,
    activePlaylistId,
    setSelectedTrackId,
    handleDeleteTrack,
    handleEditTrack,
    reorderPlaylistTracks,
    trackSource,
    sourceNameMap,
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
    );

    const sortableIds = useMemo(
        () => filteredTracks.map(t => t.id),
        [filteredTracks],
    );

    const [activeDragTrack, setActiveDragTrack] = useState<Track | null>(null);

    const handleSortStart = useCallback((event: DragStartEvent) => {
        const track = filteredTracks.find(t => t.id === event.active.id);
        setActiveDragTrack(track ?? null);
    }, [filteredTracks]);

    const handleSortEnd = useCallback((event: DragEndEvent) => {
        setActiveDragTrack(null);
        const { active, over } = event;
        if (!over || active.id === over.id || !activePlaylistId) return;

        const oldIdx = filteredTracks.findIndex(t => t.id === active.id);
        const newIdx = filteredTracks.findIndex(t => t.id === over.id);
        if (oldIdx < 0 || newIdx < 0) return;

        const reordered = arrayMove(filteredTracks, oldIdx, newIdx);
        reorderPlaylistTracks(userId, channelId, activePlaylistId, reordered.map(t => t.id));
    }, [filteredTracks, activePlaylistId, userId, channelId, reorderPlaylistTracks]);

    const handleSortCancel = useCallback(() => {
        setActiveDragTrack(null);
    }, []);

    // ---- Playlist drag-reorder mode: flat list with SortableContext, no virtualizer ----
    if (isPlaylistDragMode) {
        return (
            <div className="pt-3">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleSortStart}
                    onDragEnd={handleSortEnd}
                    onDragCancel={handleSortCancel}
                >
                    <SortableContext
                        items={sortableIds}
                        strategy={verticalListSortingStrategy}
                    >
                        {filteredTracks.map(track => (
                            <SortablePlaylistTrackItem
                                key={track.id}
                                track={track}
                                selectedTrackId={selectedTrackId}
                                userId={userId}
                                channelId={channelId}
                                onSelect={setSelectedTrackId}
                                onDelete={handleDeleteTrack}
                                onEdit={handleEditTrack}
                                isReadOnly={isReadOnly}
                                trackSource={trackSource}
                                sourceName={sourceNameMap?.[track.id]}
                            />
                        ))}
                    </SortableContext>
                    <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
                        {activeDragTrack && <TrackCardGhost track={activeDragTrack} />}
                    </DragOverlay>
                </DndContext>
            </div>
        );
    }

    // ---- Normal mode: virtualized list (groups, siblings, singles) ----
    return (
        <div
            className="pt-3 relative w-full"
            style={{ height: virtualizer.getTotalSize() + 12 }}
        >
            {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = displayItems[virtualRow.index];
                return (
                    <div
                        key={item.type === 'group' ? item.groupId : item.track.id}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        className={
                            item.type === 'sibling' && item.siblingPosition !== 'middle'
                                ? 'overflow-hidden rounded-lg'
                                : undefined
                        }
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                        }}
                    >
                        {/* Sibling stripe — rendered at wrapper level for pixel-perfect continuity */}
                        {item.type === 'sibling' && (
                            <div
                                className="absolute left-0 top-0 bottom-0 w-[3px] z-10 pointer-events-none"
                                style={{ backgroundColor: item.siblingColor }}
                            />
                        )}
                        {item.type === 'group' ? (
                            <TrackGroupCard
                                tracks={item.tracks}
                                selectedTrackId={selectedTrackId}
                                userId={userId}
                                channelId={channelId}
                                onSelect={setSelectedTrackId}
                                onDelete={handleDeleteTrack}
                                onEdit={handleEditTrack}
                                isReadOnly={isReadOnly}
                                trackSource={trackSource}
                            />
                        ) : (
                            <TrackCard
                                track={item.track}
                                isSelected={selectedTrackId === item.track.id}
                                userId={userId}
                                channelId={channelId}
                                onSelect={setSelectedTrackId}
                                onDelete={handleDeleteTrack}
                                onEdit={handleEditTrack}
                                disableDrag={isReadOnly}
                                disableDropTarget={!!item.track.groupId}
                                isReadOnly={isReadOnly}
                                trackSource={trackSource}
                                sourceName={sourceNameMap?.[item.track.id]}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};
