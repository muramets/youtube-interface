import React from 'react';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { VideoCard } from './VideoCard';
import type { VideoDetails } from '../../utils/youtubeApi';
import { useSettings } from '../../context/SettingsContext';
import { GRID_LAYOUT } from '../../config/layout';

interface VirtualVideoGridProps {
    videos: VideoDetails[];
    playlistId?: string;
    onRemove?: (id: string) => void;
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
}

const Row = ({ index, style, data }: { index: number; style: React.CSSProperties; data: RowData }) => {
    const { videos, columnCount, cardWidth, gap, playlistId, onRemove, paddingLeft, paddingRight } = data;
    // console.log('Row render', index, style);
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
                    <VideoCard
                        video={video}
                        playlistId={playlistId}
                        onRemove={onRemove || (() => { })}
                    />
                </div>
            ))}
        </div>
    );
};

export const VirtualVideoGrid: React.FC<VirtualVideoGridProps> = ({ videos, playlistId, onRemove }) => {
    const { generalSettings } = useSettings();

    return (
        <div
            className="flex-1 w-full h-full relative box-border"
        >
            <AutoSizer>
                {({ height, width }) => {
                    if (height === 0 || width === 0) return null;

                    // Use cardsPerRow from settings
                    const columnCount = generalSettings.cardsPerRow;

                    // Calculate available width for cards
                    // AutoSizer gives full width (wrapper has no horizontal padding)
                    // Subtract Right/Left padding, Gaps, and Scrollbar
                    const availableWidth = width - GRID_LAYOUT.PADDING.LEFT - GRID_LAYOUT.PADDING.RIGHT - (GRID_LAYOUT.GAP * (columnCount - 1)) - GRID_LAYOUT.SCROLLBAR_WIDTH;
                    const cardWidth = Math.floor(availableWidth / columnCount);

                    const thumbnailHeight = cardWidth * (9 / 16);
                    const cardHeight = thumbnailHeight + GRID_LAYOUT.CARD_CONTENT_HEIGHT;
                    const rowHeight = cardHeight + GRID_LAYOUT.GAP;

                    const rowCount = Math.ceil(videos.length / columnCount);

                    return (
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
                                paddingRight: GRID_LAYOUT.PADDING.RIGHT
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
                }}
            </AutoSizer>
        </div>
    );
};
