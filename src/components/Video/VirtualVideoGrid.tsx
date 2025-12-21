import React, { useRef, useState, useEffect } from 'react';
// Trigger Rebuild
import { useVirtualizer } from '@tanstack/react-virtual';
import { VideoCard } from './VideoCard';
import { SortableVideoCard } from './SortableVideoCard';
import type { VideoDetails } from '../../utils/youtubeApi';
import { useSettings } from '../../hooks/useSettings';
import { GRID_LAYOUT } from '../../config/layout';
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

export const VirtualVideoGrid: React.FC<VirtualVideoGridProps> = ({ videos, playlistId, onRemove, onVideoMove }) => {
    const { generalSettings } = useSettings();
    const cardsPerRow = generalSettings.cardsPerRow;
    const parentRef = useRef<HTMLDivElement>(null);

    // Track container dimensions
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!parentRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Wrap in requestAnimationFrame to avoid "ResizeObserver loop limit exceeded" errors
                // and to batch updates slightly
                requestAnimationFrame(() => {
                    if (!parentRef.current) return;
                    setContainerSize({
                        width: entry.contentRect.width,
                        height: entry.contentRect.height
                    });
                });
            }
        });

        resizeObserver.observe(parentRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Memoize layout calculations to avoid recalculating on every render
    const { columnCount, safeCardWidth, rowHeight } = React.useMemo(() => {
        const columnCount = cardsPerRow;
        const availableWidth = containerSize.width - GRID_LAYOUT.PADDING.LEFT - GRID_LAYOUT.PADDING.RIGHT - (GRID_LAYOUT.GAP * (columnCount - 1)) - GRID_LAYOUT.SCROLLBAR_WIDTH;
        const cardWidth = Math.floor(availableWidth / columnCount);

        // Safety check to prevent negative or zero width before layout is ready
        const safeCardWidth = Math.max(0, cardWidth);

        const thumbnailHeight = safeCardWidth * (9 / 16);
        const cardHeight = thumbnailHeight + GRID_LAYOUT.CARD_CONTENT_HEIGHT;
        const rowHeight = cardHeight + GRID_LAYOUT.GAP;

        return { columnCount, safeCardWidth, rowHeight };
    }, [containerSize.width, cardsPerRow]);

    const rowCount = Math.ceil(videos.length / columnCount);

    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => parentRef.current,
        estimateSize: () => rowHeight,
        overscan: 5,
    });

    // Recalculate virtualizer measurements when rowHeight changes (e.g. on resize)
    useEffect(() => {
        virtualizer.measure();
    }, [rowHeight, virtualizer]);

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
        if (over && active.id !== over.id && onVideoMove) {
            onVideoMove(active.id as string, over.id as string);
        }
        setActiveVideo(null);
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
                const rowVideos = [];
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
                        ref={virtualizer.measureElement}
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
                            <div key={video.id} style={{ width: safeCardWidth }}>
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

    return (
        <div
            ref={parentRef}
            className="flex-1 w-full h-full overflow-y-auto contain-strict"
            style={{
                paddingTop: GRID_LAYOUT.PADDING.TOP,
                paddingBottom: GRID_LAYOUT.PADDING.BOTTOM,
            }}
        >
            {/* 
              Wait for container width to be measured before rendering the grid.
              This prevents the "crooked" initial render where width is 0.
            */}
            {containerSize.width === 0 ? null : (
                isDraggable ? (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
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
                ) : (
                    gridContent
                )
            )}
        </div>
    );
};
