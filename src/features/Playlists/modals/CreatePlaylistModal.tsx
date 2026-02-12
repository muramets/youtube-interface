// =============================================================================
// CREATE PLAYLIST MODAL — Playlists Feature
// =============================================================================
// Thin wrapper around CreateNameModal for creating video playlists.
// Business logic (usePlaylists.createPlaylist) is kept here.
// =============================================================================

import React from 'react';
import { CreateNameModal } from '../../../components/ui/molecules/CreateNameModal';
import { usePlaylists } from '../../../core/hooks/usePlaylists';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';

interface CreatePlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { createPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');

    const handleConfirm = (name: string) => {
        if (!user || !currentChannel) return;
        createPlaylist({ name });
    };

    return (
        <CreateNameModal
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={handleConfirm}
            title="Create New Playlist"
            placeholder="My Awesome Playlist"
            nameLabel="Playlist Name"
            confirmLabel="Create"
        />
    );
};
