import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { VideoCard } from './VideoCard';
import { SortableVideoCard } from './SortableVideoCard';
import type { VideoDetails } from '../../core/utils/youtubeApi';
import { useSettings } from '../../core/hooks/useSettings';
import { GRID_LAYOUT } from './layout';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
} from '@dnd-kit/sortable';

interface VirtualVideoGridProps {
    videos: VideoDetails[];
    playlistId?: string;
    onRemove?: (id: string) => void;
    onVideoMove?: (movedVideoId: string, targetVideoId: string) => void;
}

interface InnerGridProps extends VirtualVideoGridProps {
    containerWidth: number;
    scrollElement: HTMLElement | null;
}

const InnerGrid: React.FC<InnerGridProps> = ({
    videos,
    playlistId,
    onRemove,
    onVideoMove,
    containerWidth,
    scrollElement
}) => {
    const { generalSettings } = useSettings();
    const cardsPerRow = generalSettings.cardsPerRow;

    // Memoize layout calculations
    const { columnCount, safeCardWidth, rowHeight } = React.useMemo(() => {
        const cCount = cardsPerRow;
        const availableWidth = containerWidth - GRID_LAYOUT.PADDING.LEFT - GRID_LAYOUT.PADDING.RIGHT - (GRID_LAYOUT.GAP * (cCount - 1));
        const cWidth = Math.floor(availableWidth / cCount);

        // Safety check
        const safeWidth = Math.max(0, cWidth);
        const thumbnailHeight = safeWidth * (9 / 16);

        // Dynamic content height based on density to handle text wrapping
        const getCardContentHeight = (cols: number) => {
            if (cols >= 6) return 150; // High density: More text wrapping needs more space
            if (cols <= 3) return 96;  // Low density: Less wrapping needs less space
            return 108;                // Medium density: Default
        };

        const contentHeight = getCardContentHeight(cCount);
        const cardHeight = thumbnailHeight + contentHeight;
        const rHeight = cardHeight + GRID_LAYOUT.GAP; // Total vertical space matches grid gap

        return { columnCount: cCount, safeCardWidth: safeWidth, rowHeight: rHeight };
    }, [containerWidth, cardsPerRow]);

    const rowCount = Math.ceil(videos.length / columnCount);

    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollElement,
        estimateSize: () => rowHeight,
        overscan: 5,
    });

    // Recalculate virtualizer measurements when rowHeight changes
    // Removed virtualizer.measure() here as we use a dynamic key on the container 
    // to force a full reset when the layout (columnCount/rowHeight) changes.

    const isDraggable = !!onVideoMove;
    const [activeVideo, setActiveVideo] = React.useState<VideoDetails | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        const video = videos.find(v => v.id === event.active.id);
        setActiveVideo(video || null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        setActiveVideo(null);

        if (over && active.id !== over.id && onVideoMove) {
            onVideoMove(active.id as string, over.id as string);
        }
    };

    const handleDragOver = () => {
        // Intentionally empty: we only handle reordering on drag end for now
        // to avoid expensive re-layouts during drag for this specific grid
    };

    const handleDragCancel = () => {
        setActiveVideo(null);
    };

    const items = virtualizer.getVirtualItems();

    const gridContent = (
        <div
            style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
            }}
        >
            {items.map((virtualRow) => {
                const index = virtualRow.index;
                const rowVideos: VideoDetails[] = [];
                for (let i = 0; i < columnCount; i++) {
                    const videoIndex = index * columnCount + i;
                    if (videoIndex < videos.length) {
                        rowVideos.push(videos[videoIndex]);
                    }
                }

                return (
                    <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                            display: 'flex',
                            gap: GRID_LAYOUT.GAP,
                            paddingLeft: GRID_LAYOUT.PADDING.LEFT,
                            paddingRight: GRID_LAYOUT.PADDING.RIGHT,
                        }}
                    >
                        {rowVideos.map((video) => (
                            <div key={video.id} style={{ width: safeCardWidth, height: virtualRow.size - GRID_LAYOUT.GAP }}>
                                {isDraggable ? (
                                    <SortableVideoCard
                                        video={video}
                                        playlistId={playlistId}
                                        onRemove={onRemove}
                                    />
                                ) : (
                                    <VideoCard
                                        video={video}
                                        playlistId={playlistId}
                                        onRemove={onRemove || (() => { })}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );

    if (isDraggable) {
        return (
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <SortableContext
                    items={videos.map(v => v.id)}
                    strategy={rectSortingStrategy}
                >
                    {gridContent}
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                    {activeVideo ? (
                        <div style={{ width: safeCardWidth, cursor: 'grabbing' }}>
                            <VideoCard
                                video={activeVideo}
                                playlistId={playlistId}
                                onRemove={onRemove || (() => { })}
                                isOverlay
                            />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        );
    }

    return gridContent;
};

export const VirtualVideoGrid: React.FC<VirtualVideoGridProps> = (props) => {
    const { generalSettings } = useSettings();
    const parentRef = useRef<HTMLDivElement>(null);

    // Track container dimensions
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    // Use useLayoutEffect for synchronous initial measurement - runs before browser paint
    // This prevents the "empty frame" where nothing renders while waiting for ResizeObserver
    useLayoutEffect(() => {
        if (parentRef.current) {
            const rect = parentRef.current.getBoundingClientRect();
            setContainerSize({ width: rect.width, height: rect.height });
        }
    }, []);

    // ResizeObserver for subsequent size changes (window resize, etc.)
    useEffect(() => {
        if (!parentRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                const height = entry.contentRect.height;

                setContainerSize(prev => {
                    if (prev.width === width && prev.height === height) {
                        return prev;
                    }
                    return { width, height };
                });
            }
        });

        resizeObserver.observe(parentRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    return (
        <div
            ref={parentRef}
            className="flex-1 w-full h-full overflow-y-auto"
            style={{
                paddingTop: GRID_LAYOUT.PADDING.TOP,
                paddingBottom: GRID_LAYOUT.PADDING.BOTTOM,
                scrollbarGutter: 'stable',
            }}
        >
            {/* 
              Wait for container width to be measured before mounting the grid.
              By conditionally mounting InnerGrid only when width > 0, 
              we ensure useVirtualizer initializes with the correct dimensions immediately,
              preventing the "crooked" layout glitch caused by starting with 0 width.
            */}
            {containerSize.width > 0 && (
                <InnerGrid
                    {...props}
                    key={`grid-${containerSize.width}-${generalSettings.cardsPerRow}`}
                    containerWidth={containerSize.width}
                    scrollElement={parentRef.current}
                />
            )}
        </div>
    );
};
