import React, { useMemo } from 'react';
import { GripVertical, Settings } from 'lucide-react';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CollapsibleSection } from '../../../components/ui/molecules/CollapsibleSection';
import { SortablePlaylistCard } from './PlaylistCard';
import type { Playlist } from '../../../core/services/playlistService';

// Phantom Placeholder for empty groups - invisible but detectable by dnd-kit
// Uses useSortable to register as a valid drop target
const PhantomPlaceholder = ({ id, isDragEnabled }: { id: string; isDragEnabled: boolean }) => {
    const { setNodeRef, isOver } = useSortable({
        id,
        disabled: !isDragEnabled,
    });

    return (
        <div
            ref={setNodeRef}
            className={`min-h-[100px] rounded-lg transition-all duration-150 col-span-full ${isOver
                ? 'border-2 border-dashed border-primary bg-primary/10'
                : 'border-2 border-transparent'
                }`}
        />
    );
};

interface PlaylistGroupProps {
    groupName: string;
    playlists: Playlist[];
    isDragEnabled: boolean;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onGroupEdit: (groupName: string) => void;
    navigate: (path: string) => void;
    handleMenuClick: (e: React.MouseEvent, id: string) => void;
    openMenuId: string | null;
    setOpenMenuId: (id: string | null) => void;
    handleEdit: (e: React.MouseEvent, playlist: Playlist) => void;
    handleDeleteClick: (e: React.MouseEvent, id: string) => void;
    hideHeader?: boolean;
}

// Internal memoized component for the heavy content
const PlaylistGroupContent = React.memo(({
    groupName,
    playlists,
    isDragEnabled,
    isCollapsed,
    onToggleCollapse,
    onGroupEdit,
    navigate,
    handleMenuClick,
    openMenuId,
    setOpenMenuId,
    handleEdit,
    handleDeleteClick,
    hideHeader,
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    style,
    isDragging
}: PlaylistGroupProps & {
    setNodeRef?: (node: HTMLElement | null) => void;
    setActivatorNodeRef?: (node: HTMLElement | null) => void;
    listeners?: ReturnType<typeof useSortable>['listeners'];
    attributes?: ReturnType<typeof useSortable>['attributes'];
    style?: React.CSSProperties;
    isDragging?: boolean;
}) => {
    // Include a phantom placeholder ID for empty groups so dnd-kit can detect collision
    const placeholderId = `placeholder-${groupName}`;
    const itemsIds = useMemo(
        () => playlists.length > 0 ? playlists.map(p => p.id) : [placeholderId],
        [playlists, placeholderId]
    );

    const content = (
        <SortableContext
            items={itemsIds}
            strategy={rectSortingStrategy}
            disabled={!isDragEnabled}
        >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
                {playlists.length === 0 ? (
                    // Phantom placeholder for empty groups - invisible but detectable by dnd-kit
                    <PhantomPlaceholder id={placeholderId} isDragEnabled={isDragEnabled} />
                ) : (
                    playlists.map((playlist) => (
                        <SortablePlaylistCard
                            key={playlist.id}
                            playlist={playlist}
                            navigate={navigate}
                            handleMenuClick={handleMenuClick}
                            openMenuId={openMenuId}
                            setOpenMenuId={setOpenMenuId}
                            handleEdit={handleEdit}
                            handleDeleteClick={handleDeleteClick}
                            isDragEnabled={isDragEnabled}
                        />
                    ))
                )}
            </div>
        </SortableContext>
    );

    if (hideHeader) {
        return <div className="mb-6">{content}</div>;
    }

    return (
        <div
            ref={setNodeRef}
            style={{
                ...style,
                opacity: isDragging ? 0 : 1,
            }}
            className="mb-6"
        >
            <CollapsibleSection
                isOpen={!isCollapsed}
                onToggle={onToggleCollapse}
                dragHandle={
                    isDragEnabled && (
                        <div
                            ref={setActivatorNodeRef}
                            {...listeners}
                            {...attributes}
                            className="cursor-grab active:cursor-grabbing px-1 -ml-2 opacity-0 group-hover:opacity-100 transition-all duration-200 text-text-tertiary group-hover:text-text-primary"
                            title="Drag to reorder group"
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                if (listeners?.onPointerDown) {
                                    (listeners.onPointerDown as (e: React.PointerEvent) => void)(e);
                                }
                            }}
                        >
                            <GripVertical className="w-4 h-4" />
                        </div>
                    )
                }
                title={
                    <div className="flex items-center gap-3">
                        <span className="text-text-tertiary group-hover:text-text-primary transition-colors duration-200">
                            {groupName}
                        </span>
                        <span className="text-xs font-mono font-normal opacity-40 bg-bg-secondary px-2 py-0.5 rounded-full">
                            {playlists.length}
                        </span>
                    </div>
                }
                trailing={
                    groupName !== 'Ungrouped' && (
                        <button
                            className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-2 ml-2 text-text-tertiary group-hover:text-text-primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                onGroupEdit(groupName);
                            }}
                            title="Group Settings"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    )
                }
                className="animate-fade-in"
            >
                {content}
            </CollapsibleSection>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison function for React.memo

    // Check simple props first
    if (
        prevProps.groupName !== nextProps.groupName ||
        prevProps.isDragEnabled !== nextProps.isDragEnabled ||
        prevProps.isCollapsed !== nextProps.isCollapsed ||
        prevProps.hideHeader !== nextProps.hideHeader ||
        prevProps.openMenuId !== nextProps.openMenuId ||
        prevProps.isDragging !== nextProps.isDragging // Important: re-render if dragging state changes
    ) {
        return false;
    }

    // Check if style (transform/transition) has changed - CRITICAL for DnD animations
    const prevStyle = prevProps.style || {};
    const nextStyle = nextProps.style || {};
    if (
        prevStyle.transform !== nextStyle.transform ||
        prevStyle.transition !== nextStyle.transition
    ) {
        return false;
    }

    // Check if playlists array has changed in a meaningful way (length or order/ids)
    if (prevProps.playlists.length !== nextProps.playlists.length) {
        return false;
    }

    // Compare playlist IDs to catch reordering or content changes (that might change ID order)
    for (let i = 0; i < prevProps.playlists.length; i++) {
        if (prevProps.playlists[i].id !== nextProps.playlists[i].id) {
            return false;
        }
        if (prevProps.playlists[i] !== nextProps.playlists[i]) {
            return false;
        }
    }

    return true;
});

// Main component - NOT memoized to ensure DnD works correctly
export const PlaylistGroup = (props: PlaylistGroupProps) => {
    return (
        <SortableGroupItem id={`group-${props.groupName}`} disabled={!props.isDragEnabled}>
            {(sortableProps) => (
                <PlaylistGroupContent
                    {...props}
                    {...sortableProps}
                />
            )}
        </SortableGroupItem>
    );
};

// Helper component for sortable group wrapper
interface SortableGroupItemProps {
    id: string;
    disabled?: boolean;
    children: (props: {
        setNodeRef: (node: HTMLElement | null) => void;
        setActivatorNodeRef: (node: HTMLElement | null) => void;
        listeners: ReturnType<typeof useSortable>['listeners'];
        attributes: ReturnType<typeof useSortable>['attributes'];
        style: React.CSSProperties;
        isDragging: boolean;
    }) => React.ReactNode;
}

function SortableGroupItem({ id, disabled, children }: SortableGroupItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
        isSorting,
    } = useSortable({
        id,
        disabled,
        animateLayoutChanges: ({ isSorting, wasDragging }) => {
            // Disable layout animation when drag ends to prevent "revert" flicker
            // We handle the DOM update synchronously via flushSync in hook
            if (wasDragging) {
                return false;
            }
            return isSorting; // Animate non-dragged items during sorting
        },
        // Custom smooth transition for group sliding
        transition: {
            duration: 250,
            easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        },
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        // Use the library transition for sorting, none for the dragged item itself
        transition: isDragging ? 'none' : transition,
        willChange: isSorting ? 'transform' : undefined,
        // Give the dragged item a slight z-index boost
        zIndex: isDragging ? 10 : undefined,
        position: 'relative' as const,
    };

    return children({
        setNodeRef,
        setActivatorNodeRef,
        listeners,
        attributes,
        style,
        isDragging,
    });
}
