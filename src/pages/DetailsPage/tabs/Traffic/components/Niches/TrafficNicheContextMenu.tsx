import React from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, ThumbsDown, Target } from 'lucide-react';
import type { SuggestedTrafficNiche, TrafficNicheProperty } from '@/core/types/suggestedTrafficNiches';

interface TrafficNicheContextMenuProps {
    niche: SuggestedTrafficNiche;
    isOpen: boolean;
    onClose: () => void;
    position: { x: number; y: number };
    onRename: () => void;
    onDelete: () => void;
    onUpdateProperty: (property: TrafficNicheProperty) => void;
}

export const TrafficNicheContextMenu: React.FC<TrafficNicheContextMenuProps> = ({
    niche,
    isOpen,
    onClose,
    position,
    onRename,
    onDelete,
    onUpdateProperty
}) => {
    if (!isOpen) return null;

    const content = (
        <div
            className="fixed z-[9999] bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl animate-fade-in min-w-[160px]"
            style={{ left: position.x, top: position.y }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Property Selection Section */}
            <div className="px-2 py-1 text-[10px] text-text-tertiary uppercase font-medium tracking-wider">
                Property
            </div>

            <button
                onClick={() => { onUpdateProperty('unrelated'); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2"
            >
                <ThumbsDown size={12} className={niche.property === 'unrelated' ? 'text-amber-700/80' : 'text-text-secondary'} />
                <span className={niche.property === 'unrelated' ? 'text-white font-medium' : ''}>Unrelated</span>
            </button>

            <button
                onClick={() => { onUpdateProperty('targeted'); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2"
            >
                <Target size={12} className={niche.property === 'targeted' ? 'text-yellow-500' : 'text-text-secondary'} />
                <span className={niche.property === 'targeted' ? 'text-white font-medium' : ''}>Targeted</span>
            </button>

            <button
                onClick={() => { onUpdateProperty('desired'); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2"
            >
                <Target size={12} className={niche.property === 'desired' ? 'text-blue-500' : 'text-text-secondary'} />
                <span className={niche.property === 'desired' ? 'text-white font-medium' : ''}>Desired</span>
            </button>

            <div className="h-px bg-white/10 my-1 mx-2" />

            {/* Standard Actions */}
            <button
                onClick={() => { onRename(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2"
            >
                <Pencil size={12} />
                Rename
            </button>

            <button
                onClick={() => { onDelete(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2"
            >
                <Trash2 size={12} />
                Delete
            </button>
        </div>
    );

    return createPortal(
        <>
            <div className="fixed inset-0 z-[9998] cursor-default" onClick={(e) => { e.stopPropagation(); onClose(); }} />
            {content}
        </>,
        document.body
    );
};
