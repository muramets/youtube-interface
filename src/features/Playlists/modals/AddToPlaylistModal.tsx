// =============================================================================
// ADD TO PLAYLIST MODAL — Video Playlists
// =============================================================================
// Thin wrapper around AddToCollectionModal for adding videos to playlists.
// Business logic (usePlaylists) stays here; presentation is shared.
// =============================================================================

import React, { useMemo, useState } from 'react';
import { AddToCollectionModal } from '../../../components/ui/molecules/AddToCollectionModal';
import type { CollectionItem } from '../../../components/ui/molecules/AddToCollectionModal';
import { usePlaylists } from '../../../core/hooks/usePlaylists';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';

interface AddToPlaylistModalProps {
    videoIds: string[];
    onClose: () => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({ videoIds, onClose }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, createPlaylist, addVideosToPlaylist, removeVideosFromPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');

    // Stable sort order captured on mount to prevent reordering during toggles
    const [initialSortOrder] = useState(() => {
        return [...playlists].sort((a, b) => {
            const timeA = a.updatedAt || a.createdAt;
            const timeB = b.updatedAt || b.createdAt;
            return timeB - timeA;
        }).map(p => p.id);
    });

    const items: CollectionItem[] = useMemo(() => {
        const currentMap = new Map(playlists.map(p => [p.id, p]));

        // Stable list from initial order
        const stableList = initialSortOrder
            .map(id => currentMap.get(id))
            .filter((p): p is NonNullable<typeof p> => !!p);

        // New playlists created since mount
        const newPlaylists = playlists.filter(p => !initialSortOrder.includes(p.id));

        return [...newPlaylists, ...stableList].map(playlist => ({
            id: playlist.id,
            name: playlist.name,
            isMember: videoIds.every(id => playlist.videoIds.includes(id)),
        }));
    }, [playlists, initialSortOrder, videoIds]);

    const handleToggle = (playlistId: string, currentlyMember: boolean) => {
        if (!user || !currentChannel) return;
        if (currentlyMember) {
            removeVideosFromPlaylist({ playlistId, videoIds });
        } else {
            addVideosToPlaylist({ playlistId, videoIds });
        }
    };

    const handleCreate = (name: string) => {
        if (!user || !currentChannel) return;
        createPlaylist({ name, videoIds });
    };

    return (
        <AddToCollectionModal
            isOpen={true}
            onClose={onClose}
            title="Save to playlist"
            items={items}
            onToggle={handleToggle}
            onCreate={handleCreate}
            createLabel="Create new playlist"
            createPlaceholder="Name"
            emptyText="No playlists yet"
        />
    );
};
