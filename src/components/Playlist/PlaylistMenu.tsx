import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, Trash2 } from 'lucide-react';

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
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    useEffect(() => {
        if (isOpen && anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            const menuWidth = 150;
            const menuHeight = 100;

            let top = rect.bottom;
            let left = rect.right - menuWidth;

            if (left < 16) left = 16;
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
            window.addEventListener('scroll', onClose, true);
            window.addEventListener('resize', onClose);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', onClose, true);
            window.removeEventListener('resize', onClose);
        };
    }, [isOpen, onClose, anchorEl]);

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={menuRef}
            className="animate-scale-in"
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                padding: '8px 0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                zIndex: 9999,
                width: '150px',
                display: 'flex',
                flexDirection: 'column',
                color: 'var(--text-primary)'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div
                className="hover-bg"
                onClick={onEdit}
                style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    margin: '0 8px'
                }}
            >
                <Edit2 size={16} />
                <span>Edit</span>
            </div>
            <div
                className="hover-bg"
                onClick={onDelete}
                style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    color: '#ff4d4d',
                    borderRadius: '8px',
                    margin: '0 8px'
                }}
            >
                <Trash2 size={16} />
                <span>Delete</span>
            </div>
        </div>,
        document.body
    );
};
