import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ListPlus, Edit2, Trash2 } from 'lucide-react';
import './VideoCard.css';

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
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    useEffect(() => {
        if (isOpen && anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            const menuWidth = 200; // Approximate width
            const menuHeight = 150; // Approximate height

            let top = rect.bottom;
            let left = rect.right - menuWidth;

            // Adjust if going off screen
            if (left < 0) left = rect.left;
            if (top + menuHeight > window.innerHeight) top = rect.top - menuHeight;

            setPosition({ top, left });
        }
    }, [isOpen, anchorEl]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node) && anchorEl && !anchorEl.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', onClose, true); // Close on scroll
            window.addEventListener('resize', onClose);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', onClose, true);
            window.removeEventListener('resize', onClose);
        };
    }, [isOpen, onClose, anchorEl]);

    if (!isOpen) return null;

    const showSaveToPlaylist = !playlistId;
    const showEdit = isCustom;
    const showDelete = true; // Always allow deleting/removing

    return createPortal(
        <div
            ref={menuRef}
            className="video-menu-portal"
            style={{
                top: position.top,
                left: position.left,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {showSaveToPlaylist && (
                <div className="menu-item" onClick={onAddToPlaylist}>
                    <ListPlus size={20} />
                    <span>Save to playlist</span>
                </div>
            )}

            {showSaveToPlaylist && (showEdit || showDelete) && (
                <div className="menu-divider"></div>
            )}

            {showEdit && (
                <div className="menu-item" onClick={onEdit}>
                    <Edit2 size={20} />
                    <span>Edit</span>
                </div>
            )}

            {showDelete && (
                <div className="menu-item" onClick={onRemove}>
                    <Trash2 size={20} />
                    <span>{playlistId ? 'Remove from playlist' : 'Delete'}</span>
                </div>
            )}
        </div>,
        document.body
    );
};
