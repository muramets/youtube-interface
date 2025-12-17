import React from 'react';
import { createPortal } from 'react-dom';
import { Home, Globe, Pencil, Trash2 } from 'lucide-react';
import type { TrendNiche } from '../../../types/trends';
import { useTrendStore } from '../../../stores/trendStore';

interface NicheContextMenuProps {
    niche: TrendNiche;
    isOpen: boolean;
    onClose: () => void;
    position?: { x: number; y: number }; // If not provided, assumed relative parent logic
    anchorRef?: React.RefObject<HTMLElement>; // For simple dropdowns
    onRename: () => void;
    onDelete: () => void;
}

export const NicheContextMenu: React.FC<NicheContextMenuProps> = ({
    niche,
    isOpen,
    onClose,
    position,
    onRename,
    onDelete
}) => {
    const { updateNiche } = useTrendStore();

    if (!isOpen) return null;

    const handleToggleType = () => {
        const newType = niche.type === 'global' ? 'local' : 'global';
        if (newType === 'local' && !niche.channelId) {
            alert("Cannot convert to local: Origin channel unknown.");
            return;
        }
        updateNiche(niche.id, { type: newType });
        onClose();
    };

    const content = (
        <div
            className="fixed z-[9999] bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl animate-fade-in min-w-[140px]"
            style={position ? { left: position.x, top: position.y } : undefined}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Toggle Global/Local */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    handleToggleType();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
                {niche.type === 'global' ? <Home size={10} /> : <Globe size={10} />}
                {niche.type === 'global' ? 'Make local' : 'Make global'}
            </button>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRename();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2"
            >
                <Pencil size={10} />
                Rename
            </button>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2"
            >
                <Trash2 size={10} />
                Delete
            </button>
        </div>
    );

    // If position is provided, portal it. Otherwise render inline (requires parent relative)
    if (position) {
        return createPortal(
            <>
                <div className="fixed inset-0 z-[9998] cursor-default" onClick={(e) => { e.stopPropagation(); onClose(); }} />
                {content}
            </>,
            document.body
        );
    }

    return content;
};
