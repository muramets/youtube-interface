import React from 'react';
import { ListPlus, Edit2, Trash2 } from 'lucide-react';
import { Dropdown } from '../Shared/Dropdown';

interface VideoCardMenuProps {
    isOpen: boolean;
    onClose: () => void;
    anchorEl: HTMLElement | null;
    playlistId?: string;
    isCustom?: boolean;
    onAddToPlaylist: (e: React.MouseEvent) => void;
    onEdit: (e: React.MouseEvent) => void;
    onRemove: (e: React.MouseEvent) => void;
}

export const VideoCardMenu: React.FC<VideoCardMenuProps> = ({
    isOpen,
    onClose,
    anchorEl,
    playlistId,
    isCustom,
    onAddToPlaylist,
    onEdit,
    onRemove,
}) => {
    const showSaveToPlaylist = !playlistId;
    const showEdit = isCustom;
    const showDelete = true; // Always allow deleting/removing

    return (
        <Dropdown
            isOpen={isOpen}
            onClose={onClose}
            anchorEl={anchorEl}
            width={220}
            className="py-2 text-text-primary"
        >
            {showSaveToPlaylist && (
                <div
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                    onClick={onAddToPlaylist}
                >
                    <ListPlus size={20} />
                    <span>Save to playlist</span>
                </div>
            )}

            {showSaveToPlaylist && (showEdit || showDelete) && (
                <div className="h-px bg-border my-2"></div>
            )}

            {showEdit && (
                <div
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                    onClick={onEdit}
                >
                    <Edit2 size={20} />
                    <span>Edit</span>
                </div>
            )}

            {showDelete && (
                <div
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                    onClick={onRemove}
                >
                    <Trash2 size={20} />
                    <span>{playlistId ? 'Remove from playlist' : 'Delete'}</span>
                </div>
            )}
        </Dropdown>
    );
};
