// =============================================================================
// CREATE MUSIC PLAYLIST MODAL — Thin wrapper around CreateNameModal
// =============================================================================

import React from 'react';
import { CreateNameModal } from '../../../components/ui/molecules/CreateNameModal';

interface CreateMusicPlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string, group?: string) => void;
    existingGroups?: string[];
}

export const CreateMusicPlaylistModal: React.FC<CreateMusicPlaylistModalProps> = (props) => (
    <CreateNameModal
        {...props}
        title="New Playlist"
        placeholder="Enter playlist name..."
        nameLabel="Name"
        groupLabel="Group"
        groupPlaceholder="No group"
        confirmLabel="Create"
    />
);
