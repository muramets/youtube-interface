import React from 'react';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
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

interface RowData {
    videos: VideoDetails[];
    columnCount: number;
    cardWidth: number;
    gap: number;
    playlistId?: string;
    onRemove?: (id: string) => void;
    paddingLeft: number;
    paddingRight: number;
    isDraggable: boolean;
}

const InnerGrid = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ style, ...rest }, ref) => (
    <div
        ref={ref}
        style={{
            ...style,
            height: `${parseFloat((style?.height || 0).toString()) + GRID_LAYOUT.PADDING.TOP}px`,
            position: 'relative'
        }}
        {...rest}
    />
));

const Row = ({ index, style, data }: { index: number; style: React.CSSProperties; data: RowData }) => {
    const { videos, columnCount, cardWidth, gap, playlistId, onRemove, paddingLeft, paddingRight, isDraggable } = data;

    // Shift row down by the top padding amount
    const top = parseFloat((style.top || 0).toString()) + GRID_LAYOUT.PADDING.TOP;

    const rowVideos = [];
    for (let i = 0; i < columnCount; i++) {
        const videoIndex = index * columnCount + i;
        if (videoIndex < videos.length) {
            rowVideos.push(videos[videoIndex]);
        }
    }

    return (
        <div style={{ ...style, top, display: 'flex', gap, paddingLeft, paddingRight }}>
            {rowVideos.map((video) => (
                <div key={video.id} style={{ width: cardWidth }}>
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
};

export const VirtualVideoGrid: React.FC<VirtualVideoGridProps> = ({ videos, playlistId, onRemove, onVideoMove }) => {
    const { generalSettings } = useSettings();
    const cardsPerRow = generalSettings.cardsPerRow;

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

    const [activeVideo, setActiveVideo] = React.useState<VideoDetails | null>(null);

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

    const isDraggable = !!onVideoMove;

    return (
        <div className="flex-1 w-full h-full relative box-border">
            <AutoSizer>
                {({ height, width }) => {
                    if (height === 0 || width === 0) return null;

                    const columnCount = cardsPerRow;
                    const availableWidth = width - GRID_LAYOUT.PADDING.LEFT - GRID_LAYOUT.PADDING.RIGHT - (GRID_LAYOUT.GAP * (columnCount - 1)) - GRID_LAYOUT.SCROLLBAR_WIDTH;
                    const cardWidth = Math.floor(availableWidth / columnCount);

                    const thumbnailHeight = cardWidth * (9 / 16);
                    const cardHeight = thumbnailHeight + GRID_LAYOUT.CARD_CONTENT_HEIGHT;
                    const rowHeight = cardHeight + GRID_LAYOUT.GAP;

                    const rowCount = Math.ceil(videos.length / columnCount);

                    const gridContent = (
                        <FixedSizeList
                            height={height}
                            width={width}
                            itemCount={rowCount}
                            itemSize={rowHeight}
                            innerElementType={InnerGrid}
                            itemData={{
                                videos,
                                columnCount,
                                cardWidth,
                                gap: GRID_LAYOUT.GAP,
                                playlistId,
                                onRemove,
                                paddingLeft: GRID_LAYOUT.PADDING.LEFT,
                                paddingRight: GRID_LAYOUT.PADDING.RIGHT,
                                isDraggable,
                            }}
                            style={{
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                paddingRight: GRID_LAYOUT.PADDING.RIGHT,
                                paddingBottom: GRID_LAYOUT.PADDING.BOTTOM,
                                paddingLeft: GRID_LAYOUT.PADDING.LEFT,
                            }}
                        >
                            {Row}
                        </FixedSizeList>
                    );

                    if (isDraggable) {
                        return (
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
                                        <div style={{ width: cardWidth, cursor: 'grabbing' }}>
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
                }}
            </AutoSizer>
        </div>
    );
};
