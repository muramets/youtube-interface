
import React from 'react';
import { useDndContext } from '@dnd-kit/core';
import type { GalleryItem } from '../../../../core/types/gallery';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { GalleryCardInner } from './GalleryCard';
import { useGalleryLayout } from './GalleryLayoutContext';

interface GalleryCardGhostProps {
    item: GalleryItem;
}

export const GalleryCardGhost: React.FC<GalleryCardGhostProps> = ({ item }) => {
    const { currentChannel } = useChannelStore();
    const { cardWidth } = useGalleryLayout();
    const { over } = useDndContext();

    // Check if currently over a sidebar source OR the sidebar container itself
    const overId = over?.id?.toString() || '';
    const isOverSidebar = overId.startsWith('gallery-source-') || overId === 'sidebar-gallery-nav';

    // Use calculated width from context - matches grid exactly
    // Apply semi-transparency when over sidebar
    const style: React.CSSProperties = {
        width: cardWidth,
        opacity: isOverSidebar ? 0.2 : 1,
        transition: 'opacity 150ms ease',
        // Height is auto-calculated by content
    };

    // Fallback channel info
    const channelTitle = currentChannel?.name || '';
    const channelAvatar = currentChannel?.avatar || '';

    return (
        <div style={style}>
            <GalleryCardInner
                item={item}
                channelTitle={channelTitle}
                channelAvatar={channelAvatar}
                onDelete={() => { }} // No-op during drag
                onDownload={() => { }} // No-op during drag
                onToggleLike={() => { }} // No-op during drag
                isDragEnabled={false}
                isOverlay={true}
            />
        </div>
    );
};
