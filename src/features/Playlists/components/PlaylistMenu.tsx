import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { Dropdown } from '../../../components/ui/molecules/Dropdown';

interface PlaylistMenuProps {
    isOpen: boolean;
    onClose: () => void;
    anchorEl: HTMLElement | null;
    onEdit: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
}

export const PlaylistMenu: React.FC<PlaylistMenuProps> = ({
    isOpen,
    onClose,
    anchorEl,
    onEdit,
    onDelete,
}) => {
    return (
        <Dropdown
            isOpen={isOpen}
            onClose={onClose}
            anchorEl={anchorEl}
            width={160}
            className="text-text-primary"
            align="left"
        >
            <div
                className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                onClick={onEdit}
            >
                <Edit2 size={16} />
                <span>Edit</span>
            </div>
            <div
                className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm text-red-500 hover:text-red-600"
                onClick={onDelete}
            >
                <Trash2 size={16} />
                <span>Delete</span>
            </div>
        </Dropdown>
    );
};
