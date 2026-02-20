// =============================================================================
// PLAYLIST SORTABLE LIST
// Switches between virtualizer (normal view) and DnD sortable (playlist reorder).
//
// Extracted from MusicPage.tsx — previously defined at the bottom of that file.
// =============================================================================

import React, { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GripVertical } from 'lucide-react';
import { useMusicStore } from '../../../core/stores/musicStore';
import {
    useDndMonitor,
    useDndContext,
    useDroppable,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TrackCard } from './track/TrackCard';
import { TrackGroupCard } from './track/TrackGroupCard';
import type { Track, MusicTag } from '../../../core/types/track';
import type { TrackSource } from '../../../core/types/musicPlaylist';
import type { DisplayItem } from '../hooks/useTrackDisplay';
import { useSharedLibrary } from '../contexts/SharedLibraryContext';

// ---------------------------------------------------------------------------
// getDisplayItemKey — stable identity key for a virtualizer row.
// Same value used in React `key`, data-flip-key, and FLIP snapshot map.
// ---------------------------------------------------------------------------
const getDisplayItemKey = (item: DisplayItem): string =>
    item.type === 'group' ? item.groupId : item.track.id;

// ---------------------------------------------------------------------------
// BetweenDropZone — invisible collision buffer between virtualizer rows.
// Active during group-child-sort drags to prevent the child accidentally
// landing on tracks it passes over (which would trigger linkAsVersion).
// The "Release to detach" affordance is shown on the ghost badge in SortableTrackItem.
// ---------------------------------------------------------------------------
const BetweenDropZone: React.FC<{ rowIndex: number; isGroupChildDragging: boolean }> = ({ rowIndex, isGroupChildDragging }) => {
    const { setNodeRef } = useDroppable({
        id: `between-zone-${rowIndex}`,
        data: { type: 'between-sort-zone', beforeRowIndex: rowIndex },
        disabled: !isGroupChildDragging,
    });
    return <div ref={setNodeRef} className="absolute left-0 right-0 z-20" style={{ top: -8, height: 8 }} />;
};
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
    canEdit?: boolean;
    canReorder?: boolean;
    trackSource?: TrackSource;
    sourceName?: string;
    availableTags: MusicTag[];
    featuredCategories: string[];
}

const SortablePlaylistTrackItem: React.FC<SortablePlaylistTrackItemProps> = React.memo(
    ({ track, selectedTrackId, userId, channelId, onSelect, onDelete, onEdit, canEdit, canReorder, trackSource, sourceName, availableTags, featuredCategories }) => {
        const {
            attributes,
            listeners,
            setNodeRef,
            transform,
            transition,
            isDragging,
        } = useSortable({
            id: track.id,
            data: { type: 'playlist-sort', track },
        });

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
                {/* Drag handle — hidden without reorder permission */}
                {canReorder && (
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
                        canEdit={canEdit}
                        canReorder={canReorder}
                        trackSource={trackSource}
                        sourceName={sourceName}
                        availableTags={availableTags}
                        featuredCategories={featuredCategories}
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
    activePlaylistId: string | null;
    setSelectedTrackId: (id: string | null) => void;
    handleDeleteTrack: (id: string) => void;
    handleEditTrack: (track: Track) => void;
    reorderPlaylistTracks: (userId: string, channelId: string, playlistId: string, orderedTrackIds: string[]) => Promise<void>;
    toggleGroup: (groupId: string) => void;
    /** trackId → channel name, populated in playlist All mode for shared tracks */
    sourceNameMap?: Record<string, string>;
    /** Context-aware tag definitions for resolving track.tags ids */
    availableTags: MusicTag[];
    /** Context-aware featured categories for tag filtering */
    featuredCategories: string[];
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
    activePlaylistId,
    setSelectedTrackId,
    handleDeleteTrack,
    handleEditTrack,
    reorderPlaylistTracks,
    toggleGroup,
    sourceNameMap,
    availableTags,
    featuredCategories,
}) => {
    const {
        effectiveUserId: trackOwnerUserId,
        effectiveChannelId: trackOwnerChannelId,
        permissions: granteePermissions,
        trackSource,
    } = useSharedLibrary();
    const sortableIds = useMemo(
        () => filteredTracks.map(t => t.id),
        [filteredTracks],
    );

    // ── Playlist sort monitor ─────────────────────────────────────────────────
    // Listens to the outer DndContext (AppDndProvider) for playlist-sort events.
    // Mirrors the pattern used by TrackGroupCard (useDndMonitor instead of
    // a nested DndContext) so there is always exactly one DndContext in the tree.
    // Track whether a group is currently expanding/collapsing so we can briefly
    // apply 'transition: transform' to virtualizer rows. This makes items below
    // push down/up smoothly in sync with the stagger animation. The transition
    // is cleared after the animation window to avoid lag during normal scrolling.
    const [isGroupAnimating, setIsGroupAnimating] = useState(false);
    const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Two-phase unlink animation: track appears with fade-in AFTER rows have
    // shifted to their new positions. pendingUnlinkTrackId marks the just-detached
    // track so the virtualizer row applies the trackUnlinkAppear CSS animation.
    const [pendingUnlinkTrackId, setPendingUnlinkTrackId] = useState<string | null>(null);

    // ── FLIP snapshot ─────────────────────────────────────────────────────────
    // Captured in onDragEnd BEFORE any state changes so we have the pre-layout
    // positions available in useLayoutEffect after React commits the new layout.
    // Keyed by ITEM IDENTITY (track.id / groupId), not virtualizer index —
    // because unlink inserts a new row and shifts all indices.
    // Map<itemKey (string), virtualRow.start (px)>.
    const flipSnapshotRef = useRef<Map<string, number> | null>(null);

    // Guard: virtualizer.measure() triggers virtualizer's internal setState (onChange),
    // which causes a re-render, which would re-run this effect and call measure() again
    // → infinite loop. We only need ONE measure per pendingUnlinkTrackId.
    const measuredForPendingRef = useRef<string | null>(null);

    // ── Proactive measure + FLIP animation ────────────────────────────────────
    // Fires after EVERY React commit (no dep array) so we catch the earliest
    // commit after pendingUnlinkTrackId is first set.
    useLayoutEffect(() => {
        if (!pendingUnlinkTrackId) {
            measuredForPendingRef.current = null;
            return;
        }
        if (measuredForPendingRef.current === pendingUnlinkTrackId) return;
        measuredForPendingRef.current = pendingUnlinkTrackId;

        // ── Step 1: proactive measure ──────────────────────────────────────
        // Clears stale DOM-height cache; virtualizer adopts estimateSize which
        // already returns the correct group height (tracks.length×88+8).
        virtualizer.measure();

        // ── Step 2: FLIP animation ─────────────────────────────────────────
        // Use the snapshot (captured before dragEnd state changes) to animate
        // rows from their OLD positions to the new CORRECT ones — no flushSync,
        // no registration-order dependency.
        const snapshot = flipSnapshotRef.current;
        flipSnapshotRef.current = null;
        if (!snapshot) return;

        const scrollEl = virtualizer.scrollElement;
        if (!scrollEl) return;

        // Apply inverse transforms so rows visually appear at their old positions.
        let anyFlipped = false;
        virtualizer.getVirtualItems().forEach(vRow => {
            const item = displayItems[vRow.index];
            if (!item) return;
            const itemKey = getDisplayItemKey(item);
            const oldStart = snapshot.get(itemKey);
            if (oldStart === undefined) return;
            const delta = oldStart - vRow.start;
            if (Math.abs(delta) < 0.5) return;
            const el = scrollEl.querySelector<HTMLElement>(`[data-flip-key="${itemKey}"]`);
            if (!el) return;
            el.style.transition = 'none';
            el.style.transform = `translateY(${delta}px)`;
            anyFlipped = true;
        });
        if (!anyFlipped) return;

        // Force reflow to commit the inverted positions before the next paint.
        void scrollEl.getBoundingClientRect();

        // Remove inverse transform — browser CSS transitions animate old→new.
        virtualizer.getVirtualItems().forEach(vRow => {
            const item = displayItems[vRow.index];
            if (!item) return;
            const itemKey = getDisplayItemKey(item);
            const el = scrollEl.querySelector<HTMLElement>(`[data-flip-key="${itemKey}"]`);
            if (!el || !el.style.transform) return;
            el.style.transition = 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.transform = '';
        });

        // Clean up inline transition styles after animation completes.
        setTimeout(() => {
            virtualizer.getVirtualItems().forEach(vRow => {
                const item = displayItems[vRow.index];
                if (!item) return;
                const itemKey = getDisplayItemKey(item);
                const el = scrollEl.querySelector<HTMLElement>(`[data-flip-key="${itemKey}"]`);
                if (el) el.style.transition = '';
            });
        }, 300);
    }); // intentionally no deps


    // ── Playlist sort + group animation monitor ─────────────────────────────────────────
    // Handles three interaction types:
    //   • playlist-sort     → reorder via arrayMove + reorderPlaylistTracks
    //   • group-child-sort  → FLIP animation on unlink (no flushSync needed —
    //                          FLIP captures positions before any state change)
    //   • music-track       → animation on link-as-version (flushSync needed
    //                          because the group grows and the transition must
    //                          be active before the first paint)
    useDndMonitor({
        onDragEnd({ active, over }) {
            // ── Playlist reorder ──────────────────────────────────────────────
            if (isPlaylistDragMode && active.data.current?.type === 'playlist-sort') {
                if (!over || active.id === over.id || !activePlaylistId) return;

                const oldIdx = filteredTracks.findIndex(t => t.id === active.id);
                const newIdx = filteredTracks.findIndex(t => t.id === over.id);
                if (oldIdx < 0 || newIdx < 0) return;

                const reordered = arrayMove(filteredTracks, oldIdx, newIdx);
                reorderPlaylistTracks(trackOwnerUserId, trackOwnerChannelId, activePlaylistId, reordered.map(t => t.id));
            }

            // ── Group-child unlink ────────────────────────────────────────────
            // FLIP animation pattern — no flushSync, no registration-order dependency:
            //   1. Snapshot current row positions (before any React state changes)
            //   2. Set pendingUnlinkTrackId (TrackGroupCard calls unlinkFromGroup separately)
            //   3. React commits new layout synchronously in the same event batch
            //   4. useLayoutEffect runs: proactive measure + FLIP transforms
            //   5. Browser animates rows from old positions to new correct ones
            if (active.data.current?.type === 'group-child-sort') {
                const overType = over?.data.current?.type;
                const isUnlink = overType !== 'group-child-sort';
                if (isUnlink) {
                    // Capture FLIP snapshot BEFORE any state changes so we have
                    // the pre-layout positions in useLayoutEffect.
                    // Keyed by item identity, not index (indices shift on insert).
                    const snapshot = new Map<string, number>();
                    virtualizer.getVirtualItems().forEach(vRow => {
                        const dItem = displayItems[vRow.index];
                        if (dItem) snapshot.set(getDisplayItemKey(dItem), vRow.start);
                    });
                    flipSnapshotRef.current = snapshot;

                    setPendingUnlinkTrackId(String(active.id));
                    setTimeout(() => setPendingUnlinkTrackId(null), 200 + 220 + 50);
                }
            }

            // ── music-track → group/track (linkAsVersion) ────────────────────
            // Group GROWS when a track links into it. Same timing requirement:
            // commit transition style before useMusicDragDrop calls linkAsVersion.
            if (active.data.current?.type === 'music-track') {
                const dropType = over?.data.current?.type;
                if (dropType === 'music-track-target' || dropType === 'music-group-target') {
                    if (animTimerRef.current) clearTimeout(animTimerRef.current);
                    flushSync(() => setIsGroupAnimating(true));
                    // RAF fires after React commits the expanded group DOM —
                    // virtualizer measures the final height so rows below
                    // animate to correct positions as the accordion opens.
                    requestAnimationFrame(() => virtualizer.measure());
                    animTimerRef.current = setTimeout(() => setIsGroupAnimating(false), 350);
                }
            }
        },
    });

    // Subscribe to dragging state for row-level opacity dimming.
    // When any track is dragged, all other rows dim to 0.5.
    const draggingTrackId = useMusicStore((s) => s.draggingTrackId);
    // Read drag type ONCE here so BetweenDropZone instances don't each subscribe.
    const { active: dndActive } = useDndContext();
    const isGroupChildDragging = dndActive?.data.current?.type === 'group-child-sort';

    const handleToggleGroup = useCallback((groupId: string) => {
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        // flushSync commits transition style to DOM synchronously (Flush #1)
        // before the position changes (Flush #2). Without this, React 18 batches
        // both state updates into one paint frame → transition has nothing to animate.
        flushSync(() => setIsGroupAnimating(true));
        toggleGroup(groupId);
        // Force virtualizer to recalculate row heights after the DOM update.
        // ResizeObserver sometimes misses CSS grid 0fr collapse.
        requestAnimationFrame(() => virtualizer.measure());
        animTimerRef.current = setTimeout(() => setIsGroupAnimating(false), 350);
    }, [toggleGroup, virtualizer]);

    // ---- Playlist drag-reorder mode: flat list with SortableContext, no nested DndContext ----
    if (isPlaylistDragMode) {
        return (
            <div className="pt-3">
                <SortableContext
                    items={sortableIds}
                    strategy={verticalListSortingStrategy}
                >
                    {filteredTracks.map(track => (
                        <SortablePlaylistTrackItem
                            key={track.id}
                            track={track}
                            selectedTrackId={selectedTrackId}
                            userId={trackOwnerUserId}
                            channelId={trackOwnerChannelId}
                            onSelect={setSelectedTrackId}
                            onDelete={handleDeleteTrack}
                            onEdit={handleEditTrack}
                            canEdit={granteePermissions.canEdit}
                            canReorder={granteePermissions.canReorder}
                            trackSource={trackSource}
                            sourceName={sourceNameMap?.[track.id]}
                            availableTags={availableTags}
                            featuredCategories={featuredCategories}
                        />
                    ))}
                </SortableContext>
                {/* Ghost is rendered by AppDndProvider's global DragOverlay */}
            </div>
        );
    }

    // ---- Normal mode: virtualized list (groups, siblings, singles) ----
    return (
        <div
            className="pt-3 relative w-full"
            style={{ height: virtualizer.getTotalSize() + 12 /* 12px: bottom sentinel so last row isn't flush against scroll edge */ }}
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
                            transition: isGroupAnimating
                                ? 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms ease'
                                : draggingTrackId ? 'opacity 150ms ease' : undefined,
                            opacity: draggingTrackId
                                ? (item.type === 'group'
                                    ? (item.tracks.some(t => t.id === draggingTrackId) ? 1 : 0.4)
                                    : (item.track.id === draggingTrackId ? 1 : 0.4))
                                : 1,
                        }}
                    >
                        {/* Between-zone: thin droppable gap above this row.
                            Rendered for ALL row types so group-child drags
                            can insert between groups too. closestCenter picks:
                            top zone → insertion line (unlink), center of group card → ring (linkAsVersion). */}
                        <BetweenDropZone rowIndex={virtualRow.index} isGroupChildDragging={isGroupChildDragging} />
                        {/* Two-phase unlink appearance: inner wrapper gets the fade-in animation
                            so it doesn't interfere with the outer div's translateY positioning. */}
                        {/* FLIP wrapper: receives the inverse transform so the outer div's
                            translateY (managed by virtualizer) is never overridden. */}
                        <div data-flip-key={getDisplayItemKey(item)}>
                            <div style={
                                item.type !== 'group' && item.track.id === pendingUnlinkTrackId
                                    ? { animation: 'trackUnlinkAppear 220ms cubic-bezier(0.4, 0, 0.2, 1) 150ms both' }
                                    : undefined
                            }>

                                {item.type === 'sibling' && (
                                    <div
                                        className="absolute left-0 top-0 bottom-0 w-[3px] z-10 pointer-events-none"
                                        style={{ backgroundColor: item.siblingColor }}
                                    />
                                )}
                                {item.type === 'group' ? (
                                    <TrackGroupCard
                                        tracks={item.tracks}
                                        isExpanded={item.isExpanded}
                                        onToggle={() => handleToggleGroup(item.groupId)}
                                        selectedTrackId={selectedTrackId}
                                        userId={trackOwnerUserId}
                                        channelId={trackOwnerChannelId}
                                        onSelect={setSelectedTrackId}
                                        canReorder={granteePermissions.canReorder}
                                        canEdit={granteePermissions.canEdit}
                                        onDelete={granteePermissions.canDelete ? handleDeleteTrack : undefined}
                                        onEdit={granteePermissions.canEdit ? handleEditTrack : undefined}
                                        trackSource={trackSource}
                                        availableTags={availableTags}
                                        featuredCategories={featuredCategories}
                                    />
                                ) : (
                                    <TrackCard
                                        track={item.track}
                                        isSelected={selectedTrackId === item.track.id}
                                        userId={trackOwnerUserId}
                                        channelId={trackOwnerChannelId}
                                        onSelect={setSelectedTrackId}
                                        onDelete={granteePermissions.canDelete ? handleDeleteTrack : undefined}
                                        onEdit={granteePermissions.canEdit ? handleEditTrack : undefined}
                                        disableDrag={false}
                                        disableDropTarget={!!item.track.groupId}
                                        canEdit={granteePermissions.canEdit}
                                        canReorder={granteePermissions.canReorder}
                                        trackSource={trackSource}
                                        sourceName={sourceNameMap?.[item.track.id]}
                                        availableTags={availableTags}
                                        featuredCategories={featuredCategories}
                                    />
                                )}
                            </div>{/* /animation wrapper */}
                        </div>{/* /data-flip-row */}
                    </div>
                );
            })}
        </div>
    );
};
