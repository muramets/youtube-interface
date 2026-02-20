// =============================================================================
// TRACK GROUP CARD: Accordion wrapper for version-grouped tracks
// =============================================================================
// Collapsed: single representative track with ×N badge.
// Expanded: all tracks in a single SortableContext — the first becomes the
//           display track, the rest are children in an indigo underlay.
//           Any track can be reordered to any position (including becoming
//           the new display track). External tracks can be dropped onto
//           the group with an insertion indicator.
// =============================================================================

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
    defaultAnimateLayoutChanges,
    type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TrackCard } from './TrackCard';
import type { Track } from '../../../../core/types/track';
import type { TrackSource } from '../../../../core/types/musicPlaylist';
import { useMusicStore } from '../../../../core/stores/musicStore';
import { sortByGroupOrder } from '../../../../core/utils/trackUtils';

// Skip layout animation on drop to prevent flash from dnd-kit flushSync
const skipDropAnimation: AnimateLayoutChanges = (args) => {
    if (args.wasDragging) return false;
    return defaultAnimateLayoutChanges(args);
};

// -----------------------------------------------------------------------------
// Sortable wrapper — used for EVERY track in the group (display + children)
// -----------------------------------------------------------------------------
const SortableTrackItem: React.FC<{
    track: Track;
    selectedTrackId: string | null;
    userId: string;
    channelId: string;
    onSelect: (trackId: string | null) => void;
    onDelete?: (trackId: string) => void;
    onEdit?: (track: Track) => void;
    trailingElement?: React.ReactNode;
    children?: React.ReactNode;
    isReadOnly?: boolean;
    trackSource?: TrackSource;
}> = ({ track, selectedTrackId, userId, channelId, onSelect, onDelete, onEdit, trailingElement, children, isReadOnly, trackSource }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: track.id, animateLayoutChanges: skipDropAnimation });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative' as const,
        zIndex: isDragging ? 50 : 'auto',
        userSelect: 'none',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...(!isReadOnly ? attributes : {})}
            {...(!isReadOnly ? listeners : {})}
            data-group-child
        >
            <TrackCard
                track={track}
                isSelected={selectedTrackId === track.id}
                userId={userId}
                channelId={channelId}
                onSelect={onSelect}
                onDelete={onDelete}
                onEdit={onEdit}
                trailingElement={trailingElement}
                disableDropTarget
                disableDrag
                isReadOnly={isReadOnly}
                trackSource={trackSource}
            />
            {children}
        </div>
    );
};

// -----------------------------------------------------------------------------
// Insertion line indicator shown between children during external drag
// -----------------------------------------------------------------------------
const InsertionLine: React.FC = () => (
    <div className="flex items-center gap-2 px-4 py-1">
        <div className="w-2 h-2 rounded-full bg-indigo-400/80 shrink-0" />
        <div className="flex-1 h-[2px] bg-indigo-400/50 rounded-full" />
    </div>
);

// -----------------------------------------------------------------------------
// Main TrackGroupCard component
// -----------------------------------------------------------------------------
interface TrackGroupCardProps {
    tracks: Track[];
    selectedTrackId: string | null;
    userId: string;
    channelId: string;
    onSelect: (trackId: string | null) => void;
    onDelete?: (trackId: string) => void;
    onEdit?: (track: Track) => void;
    isReadOnly?: boolean;
    trackSource?: TrackSource;
}

export const TrackGroupCard: React.FC<TrackGroupCardProps> = ({
    tracks,
    selectedTrackId,
    userId,
    channelId,
    onSelect,
    onDelete,
    onEdit,
    isReadOnly,
    trackSource,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [insertionIndex, setInsertionIndex] = useState(-1);
    const [isInternalDragging, setIsInternalDragging] = useState(false);
    const childrenContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const reorderGroupTracks = useMusicStore((s) => s.reorderGroupTracks);
    const unlinkFromGroup = useMusicStore((s) => s.unlinkFromGroup);

    // Sync Shield: useRef so flushSync render reads it synchronously
    const localOrderRef = useRef<string[] | null>(null);
    const shieldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup shield timer on unmount
    useEffect(() => {
        return () => {
            if (shieldTimerRef.current) clearTimeout(shieldTimerRef.current);
        };
    }, []);

    // Sort by groupOrder (if set), then by createdAt
    const storeSorted = useMemo(() => [...tracks].sort(sortByGroupOrder), [tracks]);

    // Reactive shield clearing: drop shield when Firestore catches up
    useEffect(() => {
        if (!localOrderRef.current) return;
        const storeIds = storeSorted.map((t) => t.id);
        const shieldIds = localOrderRef.current;
        if (
            storeIds.length === shieldIds.length &&
            storeIds.every((id, i) => id === shieldIds[i])
        ) {
            localOrderRef.current = null;
            if (shieldTimerRef.current) {
                clearTimeout(shieldTimerRef.current);
                shieldTimerRef.current = null;
            }
        }
    }, [storeSorted]);

    // Sync Shield: read ref synchronously during render — intentional.
    // This survives dnd-kit's flushSync intermediate renders that would
    // otherwise flash old DOM order before state updates propagate.
    // eslint-disable-next-line react-hooks/refs
    const sorted = localOrderRef.current
        // eslint-disable-next-line react-hooks/refs
        ? localOrderRef.current
            .map((id) => tracks.find((t) => t.id === id))
            .filter((t): t is Track => t != null)
        : storeSorted;

    const displayTrack = sorted[0];
    const childTracks = useMemo(() => sorted.slice(1), [sorted]);
    const allIds = useMemo(() => sorted.map((t) => t.id), [sorted]);
    const groupId = displayTrack?.groupId;

    // Is a child (non-display) track currently playing?
    const isChildPlaying = !isExpanded && playingTrackId != null
        && playingTrackId !== displayTrack?.id
        && childTracks.some((t) => t.id === playingTrackId);

    // -------------------------------------------------------------------------
    // Group-level droppable (registers with OUTER DndContext)
    // -------------------------------------------------------------------------
    const { setNodeRef: setGroupDropRef, isOver: isGroupOver } = useDroppable({
        id: `group-drop-${groupId}`,
        data: {
            type: 'music-group-target',
            groupId,
            representativeTrackId: displayTrack?.id,
            insertionIndex,
        },
    });

    // Merged ref: group droppable + containerRef for bounds checking
    const mergedGroupRef = useCallback((node: HTMLDivElement | null) => {
        setGroupDropRef(node);
        containerRef.current = node;
    }, [setGroupDropRef]);

    // Auto-expand when an external track is dragged over
    useEffect(() => {
        if (!isGroupOver || isExpanded) return;
        const timer = setTimeout(() => setIsExpanded(true), 350);
        return () => clearTimeout(timer);
    }, [isGroupOver, isExpanded]);

    // Track pointer position for insertion indicator
    useEffect(() => {
        if (!isGroupOver || !isExpanded) {
            setInsertionIndex(-1);
            return;
        }
        const container = childrenContainerRef.current;
        if (!container) return;

        const handler = (e: PointerEvent) => {
            const children = container.querySelectorAll('[data-group-child]');
            let idx = children.length;
            for (let i = 0; i < children.length; i++) {
                const rect = children[i].getBoundingClientRect();
                if (e.clientY < rect.top + rect.height / 2) {
                    idx = i;
                    break;
                }
            }
            setInsertionIndex(idx);
        };

        document.addEventListener('pointermove', handler);
        return () => document.removeEventListener('pointermove', handler);
    }, [isGroupOver, isExpanded]);

    useEffect(() => {
        if (!isGroupOver) setInsertionIndex(-1);
    }, [isGroupOver]);

    const toggleExpand = useCallback(() => {
        setIsExpanded((prev) => !prev);
    }, []);

    // Nested DndContext — handles reordering ALL tracks within the group
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
    );

    // Track last pointer position for scroll-safe bounds check
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

    const handleDragMove = useCallback((event: { activatorEvent: Event; delta: { x: number; y: number } }) => {
        const activator = event.activatorEvent as PointerEvent;
        lastPointerRef.current = {
            x: activator.clientX + event.delta.x,
            y: activator.clientY + event.delta.y,
        };
    }, []);

    const handleSortEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;

        // If dropped outside any sortable target, check if outside the group → unlink
        if (!over) {
            const groupRect = containerRef.current?.getBoundingClientRect();
            const pointer = lastPointerRef.current;
            if (groupRect && pointer) {
                const isOutside =
                    pointer.y < groupRect.top ||
                    pointer.y > groupRect.bottom ||
                    pointer.x < groupRect.left ||
                    pointer.x > groupRect.right;

                if (isOutside && groupId && userId && channelId) {
                    // Only children can be unlinked — display track stays
                    if (active.id !== displayTrack?.id) {
                        unlinkFromGroup(userId, channelId, active.id as string);
                    }
                }
            }
            lastPointerRef.current = null;
            return;
        }

        lastPointerRef.current = null;

        if (active.id === over.id) return;

        const oldIdx = sorted.findIndex((t) => t.id === active.id);
        const newIdx = sorted.findIndex((t) => t.id === over.id);
        if (oldIdx < 0 || newIdx < 0) return;

        const reordered = arrayMove(sorted, oldIdx, newIdx);
        const allOrdered = reordered.map((t) => t.id);

        // Sync Shield: ref update is synchronous — visible in flushSync render
        localOrderRef.current = allOrdered;
        if (shieldTimerRef.current) clearTimeout(shieldTimerRef.current);
        // Fallback: clear shield after 5s in case Firestore batch fails
        shieldTimerRef.current = setTimeout(() => { localOrderRef.current = null; }, 5000);

        if (groupId && userId && channelId) {
            reorderGroupTracks(userId, channelId, groupId, allOrdered);
        }
    }, [sorted, groupId, userId, channelId, reorderGroupTracks, unlinkFromGroup, displayTrack?.id]);

    if (!displayTrack) return null;


    // When read-only (shared playlist), skip DndContext+SortableContext entirely
    // so useSortable has nothing to register with and children can't be reordered.
    const groupContent = (
        <>
            {/* Display track — first in sort order, always visible */}
            <div className="relative">
                <SortableTrackItem
                    track={displayTrack}
                    selectedTrackId={selectedTrackId}
                    userId={userId}
                    channelId={channelId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    isReadOnly={isReadOnly}
                    trackSource={trackSource}
                />

                {/* "N versions" expand bar at the bottom of display track */}
                <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
                    className={`absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1
                        border-none cursor-pointer transition-[border-radius,color] duration-300 ease-out z-10
                        ${isExpanded ? '' : 'rounded-b-lg'}`}
                    style={{
                        height: 16,
                        background: isExpanded ? 'var(--group-accent-bg-strong)' : 'rgba(255,255,255,0.04)',
                    }}
                >
                    <Layers size={8} className={isExpanded ? 'text-indigo-400/80' : 'text-text-tertiary'} />
                    <span className={`text-[8px] font-medium tracking-wider uppercase ${isExpanded ? 'text-indigo-300/80' : 'text-text-tertiary'}`}>
                        {tracks.length} versions
                    </span>
                    {isChildPlaying && (
                        <span className="flex items-end gap-[1.5px] ml-0.5">
                            {[0, 1, 2].map((i) => (
                                <span
                                    key={i}
                                    className="w-[2px] rounded-full"
                                    style={{
                                        backgroundColor: 'var(--group-accent-bar)',
                                        animation: `barBounce 0.6s ease-in-out ${i * 0.15}s infinite`,
                                    }}
                                />
                            ))}
                        </span>
                    )}
                    <ChevronDown
                        size={8}
                        className={`transition-transform duration-300 ease-out ${isExpanded ? 'text-indigo-400/60' : 'text-text-tertiary'}`}
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    />
                </button>
            </div>

            {/* Expandable children.
                Outer grid: NO transition — height changes instantly so react-virtuoso
                repositions items below on the same frame, preventing overlap.
                Visual premium feel comes from inner content fade+slide animation. */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateRows: isExpanded ? '1fr' : '0fr',
                }}
            >
                <div style={{ overflow: isInternalDragging ? 'visible' : 'hidden' }}>
                    {/* Content slides in — opacity + translateY on the content itself,
                        not the container, so layout is unaffected by the animation. */}
                    <div
                        style={{
                            opacity: isExpanded ? 1 : 0,
                            transform: isExpanded ? 'translateY(0)' : 'translateY(-10px)',
                            transition: isExpanded
                                ? 'opacity 260ms ease, transform 280ms cubic-bezier(0.4, 0, 0.2, 1)'
                                : 'opacity 150ms ease, transform 150ms ease',
                        }}
                    >
                        <div
                            ref={childrenContainerRef}
                            className={`relative rounded-b-xl ${isGroupOver ? 'pb-3' : ''}`}
                            style={{ background: 'var(--group-accent-bg)' }}
                        >
                            {childTracks.map((track, i) => (
                                <React.Fragment key={track.id}>
                                    {isGroupOver && insertionIndex === i && <InsertionLine />}
                                    <SortableTrackItem
                                        track={track}
                                        selectedTrackId={selectedTrackId}
                                        userId={userId}
                                        channelId={channelId}
                                        onSelect={onSelect}
                                        onDelete={onDelete}
                                        onEdit={onEdit}
                                        isReadOnly={isReadOnly}
                                        trackSource={trackSource}
                                    />
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            {/* Append-at-end indicator: rendered OUTSIDE contentRef so maxHeight never clips it */}
            {isGroupOver && isExpanded && insertionIndex === childTracks.length && <InsertionLine />}
        </>
    );

    return (
        <div
            ref={mergedGroupRef}
            className={`relative transition-all duration-200 rounded-xl
                ${isGroupOver ? 'ring-2 ring-indigo-400/40 bg-indigo-500/[0.03]' : ''}`}
        >
            {isReadOnly ? groupContent : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={() => setIsInternalDragging(true)}
                    onDragMove={handleDragMove}
                    onDragEnd={(e) => { setIsInternalDragging(false); handleSortEnd(e); }}
                >
                    <SortableContext
                        items={allIds}
                        strategy={verticalListSortingStrategy}
                    >
                        {groupContent}
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
};
