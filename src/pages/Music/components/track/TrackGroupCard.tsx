// =============================================================================
// TRACK GROUP CARD: Accordion wrapper for version-grouped tracks
// =============================================================================
// Collapsed: single representative track with ×N badge.
// Expanded: all tracks in a SortableContext — the first becomes the display
//           track, the rest are children in an indigo underlay.
//
// DnD Architecture:
//   • ONE outer DndContext (AppDndProvider) — this component never adds another.
//   • SortableContext wraps all tracks (display + children) for premium drag
//     preview and smooth settle animations via useSortable.
//   • useDndMonitor subscribes to the outer DndContext for drag-end events:
//       - over in group  → reorderGroupTracks (+ Sync Shield)
//       - over === null + child → unlinkFromGroup
//   • useDroppable registers a zone for external track drops onto the group.
// =============================================================================

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import {
    useDroppable,
    useDndMonitor,
    useDndContext,
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
import { InsertionLine } from './InsertionLine';
import type { Track } from '../../../../core/types/track';
import type { TrackSource } from '../../../../core/types/musicPlaylist';
import { useMusicStore } from '../../../../core/stores/musicStore';
import { sortByGroupOrder } from '../../../../core/utils/trackUtils';

// Max time to keep the optimistic sort order while waiting for Firestore to confirm.
// Covers typical roundtrip latency (~1-2s) with a generous buffer.
const SYNC_SHIELD_TTL_MS = 5_000;

// Skip layout animation on drop to prevent flash from dnd-kit flushSync
const skipDropAnimation: AnimateLayoutChanges = (args) => {
    if (args.wasDragging) return false;
    return defaultAnimateLayoutChanges(args);
};

// -----------------------------------------------------------------------------
// SortableTrackItem — useSortable wrapper for every track inside the group
// -----------------------------------------------------------------------------
interface SortableTrackItemProps {
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
}

const SortableTrackItem: React.FC<SortableTrackItemProps> = ({ track, selectedTrackId, userId, channelId, onSelect, onDelete, onEdit, trailingElement, children, isReadOnly, trackSource }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: track.id,
        animateLayoutChanges: skipDropAnimation,
        data: { type: 'group-child-sort', track },
    });

    // When another group child is being dragged, dim non-active children.
    const { active: dndActive } = useDndContext();
    const isGroupChildDragging = dndActive?.data.current?.type === 'group-child-sort';

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 1 : (isGroupChildDragging ? 0.4 : 1),
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
interface TrackGroupCardProps {
    tracks: Track[];
    isExpanded: boolean;
    onToggle: () => void;
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
    isExpanded,
    onToggle,
    selectedTrackId,
    userId,
    channelId,
    onSelect,
    onDelete,
    onEdit,
    isReadOnly,
    trackSource,
}) => {
    const [insertionIndex, setInsertionIndex] = React.useState(-1);
    const childrenContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const reorderGroupTracks = useMusicStore((s) => s.reorderGroupTracks);
    const unlinkFromGroup = useMusicStore((s) => s.unlinkFromGroup);
    const linkAsVersion = useMusicStore((s) => s.linkAsVersion);
    const moveTrackToGroup = useMusicStore((s) => s.moveTrackToGroup);
    const relinkGroupMember = useMusicStore((s) => s.relinkGroupMember);


    // ── Sync Shield ───────────────────────────────────────────────────────────
    // Keeps the optimistic order visible during dnd-kit's internal flushSync
    // renders, preventing a 1-frame flash back to the old Firestore order.
    const localOrderRef = useRef<string[] | null>(null);
    const shieldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => { if (shieldTimerRef.current) clearTimeout(shieldTimerRef.current); };
    }, []);

    const storeSorted = useMemo(() => [...tracks].sort(sortByGroupOrder), [tracks]);

    // Clear shield once Firestore catches up
    useEffect(() => {
        if (!localOrderRef.current) return;
        const storeIds = storeSorted.map((t) => t.id);
        const shieldIds = localOrderRef.current;
        if (storeIds.length === shieldIds.length && storeIds.every((id, i) => id === shieldIds[i])) {
            localOrderRef.current = null;
            if (shieldTimerRef.current) { clearTimeout(shieldTimerRef.current); shieldTimerRef.current = null; }
        }
    }, [storeSorted]);

    // Sync Shield pattern: reading localOrderRef.current during render is intentional —
    // it holds the optimistic track order until Firestore confirms, bypassing the full
    // state cycle on purpose. The lint rule disallows ref reads in render, but this is
    // a documented React escape hatch (see: https://react.dev/reference/react/useRef).
    /* eslint-disable react-hooks/refs */
    const localOrder = localOrderRef.current;
    const sorted = localOrder
        ? localOrder.map((id) => tracks.find((t) => t.id === id)).filter((t): t is Track => t != null)
        : storeSorted;
    /* eslint-enable react-hooks/refs */

    const displayTrack = sorted[0];
    const childTracks = useMemo(() => sorted.slice(1), [sorted]);
    const allIds = useMemo(() => sorted.map((t) => t.id), [sorted]);
    const groupId = displayTrack?.groupId;


    const isChildPlaying = !isExpanded
        && playingTrackId != null
        && playingTrackId !== displayTrack?.id
        && childTracks.some((t) => t.id === playingTrackId);

    // ── External drop target (outer DndContext) ───────────────────────────────
    // Disable when a child of THIS group is being sorted — prevents the ring
    // and internal insertion-line from showing during same-group reorder.
    const { active: dndActive } = useDndContext();
    const isDraggingOwnChild = dndActive?.data.current?.type === 'group-child-sort'
        && sorted.some((t) => t.id === dndActive.id);

    const { setNodeRef: setGroupDropRef, isOver: isGroupOver } = useDroppable({
        id: `group-drop-${groupId}`,
        data: { type: 'music-group-target', groupId, representativeTrackId: displayTrack?.id, insertionIndex },
        disabled: isReadOnly || isDraggingOwnChild,
    });

    const mergedGroupRef = useCallback((node: HTMLDivElement | null) => {
        setGroupDropRef(node);
        containerRef.current = node;
    }, [setGroupDropRef]);

    // Auto-expand when external track is dragged over
    useEffect(() => {
        if (!isGroupOver || isExpanded) return;
        const timer = setTimeout(onToggle, 350);
        return () => clearTimeout(timer);
    }, [isGroupOver, isExpanded, onToggle]);

    // Track pointer position for insertion indicator (external drag only)
    useEffect(() => {
        if (!isGroupOver || !isExpanded) { setInsertionIndex(-1); return; }
        const container = childrenContainerRef.current;
        if (!container) return;
        const handler = (e: PointerEvent) => {
            const children = container.querySelectorAll('[data-group-child]');
            let idx = children.length;
            for (let i = 0; i < children.length; i++) {
                const rect = children[i].getBoundingClientRect();
                if (e.clientY < rect.top + rect.height / 2) { idx = i; break; }
            }
            setInsertionIndex(idx);
        };
        document.addEventListener('pointermove', handler);
        return () => document.removeEventListener('pointermove', handler);
    }, [isGroupOver, isExpanded]);

    useEffect(() => { if (!isGroupOver) setInsertionIndex(-1); }, [isGroupOver]);

    // ── useDndMonitor: handle group-child reorder + unlink ────────────────────
    // Listens to the outer DndContext without creating a nested one.
    useDndMonitor({
        onDragEnd({ active, over }) {
            const activeInGroup = sorted.some((t) => t.id === active.id);
            if (!activeInGroup) return;

            // Dropped outside any target → unlink child (display track stays)
            if (!over) {
                if (active.id !== displayTrack?.id && groupId && userId && channelId) {
                    unlinkFromGroup(userId, channelId, active.id as string);
                }
                return;
            }

            // Dropped within same group → reorder
            const overInGroup = sorted.some((t) => t.id === over.id);

            if (overInGroup && active.id !== over.id) {
                const oldIdx = sorted.findIndex((t) => t.id === active.id);
                const newIdx = sorted.findIndex((t) => t.id === over.id);
                if (oldIdx < 0 || newIdx < 0) return;

                const reordered = arrayMove(sorted, oldIdx, newIdx);
                const orderedIds = reordered.map((t) => t.id);
                localOrderRef.current = orderedIds;
                if (shieldTimerRef.current) clearTimeout(shieldTimerRef.current);
                shieldTimerRef.current = setTimeout(() => { localOrderRef.current = null; }, SYNC_SHIELD_TTL_MS);

                if (groupId && userId && channelId) {
                    reorderGroupTracks(userId, channelId, groupId, orderedIds);
                }
            } else if (!overInGroup && userId && channelId) {
                const dropType = over.data.current?.type as string | undefined;

                if (dropType === 'between-sort-zone') {
                    // Same intent as over=null (unlink), but BetweenDropZone intercepts
                    // the drop before it can become null — so we handle it separately.
                    // Track returns to its natural sort position in the library.
                    if (active.id !== displayTrack?.id && groupId) {
                        unlinkFromGroup(userId, channelId, active.id as string);
                    }
                } else if (dropType === 'music-group-target') {
                    // Move (not merge): remove track from source group and insert
                    // into target group at the pointer position.
                    const targetRepId = over.data.current?.representativeTrackId as string | undefined;
                    const insertIdx = (over.data.current?.insertionIndex as number) ?? -1;
                    if (targetRepId && targetRepId !== (active.id as string)) {
                        moveTrackToGroup(userId, channelId, active.id as string, targetRepId, insertIdx);
                    }
                } else if (dropType === 'music-track-target') {
                    // over.id is the droppable's registered ID ('track-drop-{uuid}');
                    // the actual track ID lives in over.data.current.trackId.
                    const targetId = over.data.current?.trackId as string | undefined;
                    const targetGroupId = over.data.current?.groupId as string | null | undefined;
                    if (targetId && targetId !== (active.id as string)) {
                        if (targetGroupId) {
                            // Target is inside another group (unusual — normally disableDropTarget prevents this)
                            linkAsVersion(userId, channelId, active.id as string, targetId);
                        } else {
                            // Target is standalone: dissolve source group if needed + create new group
                            relinkGroupMember(userId, channelId, active.id as string, targetId);
                        }
                    }
                }
                // Unknown drop type (e.g. between-sort-zone from sibling context) — no action.
            }
        },
    });

    if (!displayTrack) return null;

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

                {/* "N versions" expand bar */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
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
                                <span key={i} className="w-[2px] rounded-full" style={{ backgroundColor: 'var(--group-accent-bar)', animation: `barBounce 0.6s ease-in-out ${i * 0.15}s infinite` }} />
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
                Container: instant height via CSS grid (NO transition) so the virtualizer
                measures the new height in one ResizeObserver tick — no jitter.
                overflow=visible when expanded so useSortable transforms aren't clipped.
                Children mount/unmount on toggle so entry animation re-plays each time. */}
            <div style={{ display: 'grid', gridTemplateRows: isExpanded ? '1fr' : '0fr' }}>
                <div style={{ overflow: isExpanded ? 'visible' : 'hidden' }}>
                    {isExpanded && (
                        <div
                            ref={childrenContainerRef}
                            className="relative rounded-b-xl"
                            style={{
                                background: 'var(--group-accent-bg)',
                                paddingBottom: 8,
                                animation: 'groupChildrenReveal 220ms cubic-bezier(0.4, 0, 0.2, 1) both',
                            }}
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
                            {/* Append-at-end indicator */}
                            {isGroupOver && insertionIndex === childTracks.length && <InsertionLine />}
                        </div>
                    )}
                </div>
            </div>
        </>
    );

    return (
        <div
            ref={mergedGroupRef}
            className={`relative transition-all duration-200 rounded-xl
                ${isGroupOver ? 'ring-2 ring-indigo-400/40 bg-indigo-500/[0.03]' : ''}`}
        >
            {/* Read-only: skip SortableContext so useSortable has nothing to register */}
            {isReadOnly ? groupContent : (
                <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
                    {groupContent}
                </SortableContext>
            )}
        </div>
    );
};
