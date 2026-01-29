import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';

interface SnapshotContextMenuProps {
    isOpen: boolean;
    onClose: () => void;
    position: { x: number; y: number };
    onDelete: () => void;
}

export const SnapshotContextMenu: React.FC<SnapshotContextMenuProps> = ({
    isOpen,
    onClose,
    position,
    onDelete
}) => {
    if (!isOpen) return null;

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[9998] cursor-default"
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
            />

            {/* Menu */}
            <div
                className="fixed z-[9999] bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl animate-fade-in min-w-[140px]"
                style={{
                    left: position.x,
                    top: position.y
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                        onClose();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2"
                >
                    <Trash2 size={10} />
                    Remove
                </button>
            </div>
        </>,
        document.body
    );
};
