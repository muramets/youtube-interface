import React from 'react';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { VideoCard } from './VideoCard';
import { SortableVideoCard } from './SortableVideoCard';
import type { VideoDetails } from '../../utils/youtubeApi';
import { useSettings } from '../../context/SettingsContext';
import { GRID_LAYOUT } from '../../config/layout';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
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
    onVideoMove?: (oldIndex: number, newIndex: number) => void;
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

const Row = ({ index, style, data }: { index: number; style: React.CSSProperties; data: RowData }) => {
    const { videos, columnCount, cardWidth, gap, playlistId, onRemove, paddingLeft, paddingRight, isDraggable } = data;

    const rowVideos = [];
    for (let i = 0; i < columnCount; i++) {
        const videoIndex = index * columnCount + i;
        if (videoIndex < videos.length) {
            rowVideos.push(videos[videoIndex]);
        }
    }

    return (
        <div style={{ ...style, display: 'flex', gap, paddingLeft, paddingRight }}>
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

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id && onVideoMove) {
            const oldIndex = videos.findIndex((v) => v.id === active.id);
            const newIndex = videos.findIndex((v) => v.id === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                onVideoMove(oldIndex, newIndex);
            }
        }
    };

    const isDraggable = !!onVideoMove;

    return (
        <div className="flex-1 w-full h-full relative box-border">
            <AutoSizer>
                {({ height, width }) => {
                    if (height === 0 || width === 0) return null;

                    const columnCount = generalSettings.cardsPerRow;
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
                            itemData={{
                                videos,
                                columnCount,
                                cardWidth,
                                gap: GRID_LAYOUT.GAP,
                                playlistId,
                                onRemove,
                                paddingLeft: GRID_LAYOUT.PADDING.LEFT,
                                paddingRight: GRID_LAYOUT.PADDING.RIGHT,
                                isDraggable
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
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={videos.map(v => v.id)}
                                    strategy={rectSortingStrategy}
                                >
                                    {gridContent}
                                </SortableContext>
                            </DndContext>
                        );
                    }

                    return gridContent;
                }}
            </AutoSizer>
        </div>
    );
};
