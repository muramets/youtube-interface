// =============================================================================
// ADD TO MUSIC PLAYLIST MODAL — Thin wrapper
// =============================================================================
// Wraps AddToCollectionModal for adding tracks to music playlists.
// Business logic (useMusicStore) stays here; presentation is shared.
// =============================================================================

import React, { useMemo } from 'react';
import { ListMusic } from 'lucide-react';
import { AddToCollectionModal } from '../../../components/ui/molecules/AddToCollectionModal';
import type { CollectionItem } from '../../../components/ui/molecules/AddToCollectionModal';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';

interface AddToMusicPlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    trackId: string;
}

export const AddToMusicPlaylistModal: React.FC<AddToMusicPlaylistModalProps> = ({
    isOpen,
    onClose,
    trackId,
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { musicPlaylists, addTracksToPlaylist, removeTracksFromPlaylist, createPlaylist } = useMusicStore();

    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    const items: CollectionItem[] = useMemo(() => {
        return musicPlaylists.map(p => ({
            id: p.id,
            name: p.name,
            isMember: p.trackIds.includes(trackId),
            color: p.color,
            icon: <ListMusic size={14} className="text-text-tertiary" style={p.color ? { color: p.color } : undefined} />,
        }));
    }, [musicPlaylists, trackId]);

    const handleToggle = async (playlistId: string, currentlyMember: boolean) => {
        if (!userId || !channelId) return;
        if (currentlyMember) {
            await removeTracksFromPlaylist(userId, channelId, playlistId, [trackId]);
        } else {
            await addTracksToPlaylist(userId, channelId, playlistId, [trackId]);
        }
    };

    const handleCreate = async (name: string) => {
        if (!userId || !channelId) return;
        await createPlaylist(userId, channelId, name, undefined, [trackId]);
    };

    return (
        <AddToCollectionModal
            isOpen={isOpen}
            onClose={onClose}
            title="Add to Playlist"
            items={items}
            onToggle={handleToggle}
            onCreate={handleCreate}
            createLabel="Create new playlist"
            createPlaceholder="Playlist name..."
            emptyText="No playlists yet"
        />
    );
};
