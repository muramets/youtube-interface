import React, { useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, ThumbsDown, Trophy, Heart, Tag, ChevronLeft, GitBranch } from 'lucide-react';
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
    const [view, setView] = useState<'main' | 'properties'>('main');
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjustedStyle, setAdjustedStyle] = useState<React.CSSProperties>({
        opacity: 0,
        left: position.x,
        top: position.y
    });

    // Reset view on open/close
    React.useEffect(() => {
        if (!isOpen) {
            setView('main');
        }
    }, [isOpen]);

    // Calculate position to prevent clipping
    useLayoutEffect(() => {
        if (isOpen && menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - position.y;

            // If space below is less than menu height (approx 150px safety), flip up
            // Or measure actual height: rect.height
            const needsFlip = spaceBelow < rect.height + 10;

            setAdjustedStyle({
                opacity: 1,
                left: position.x,
                top: needsFlip ? position.y - rect.height : position.y,
            });
        }
    }, [isOpen, position, view]); // Re-calculate when view changes (height changes)

    if (!isOpen) return null;

    const renderMainView = () => (
        <>
            <button
                key="rename"
                onClick={() => onRename()}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 rounded-md"
            >
                <Pencil size={12} className="text-text-secondary" />
                Rename
            </button>

            <button
                key="set-type"
                onClick={() => setView('properties')}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 rounded-md"
            >
                <Tag size={12} className="text-text-secondary" />
                Set Type
            </button>

            <div className="h-px bg-white/10 my-1 mx-2" />

            <button
                key="delete"
                onClick={onDelete}
                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2 rounded-md"
            >
                <Trash2 size={12} />
                Delete
            </button>
        </>
    );

    const renderPropertiesView = () => (
        <>
            <div className="flex items-center gap-1 px-2 py-1 mb-1 border-b border-white/5">
                <button
                    onClick={() => setView('main')}
                    className="p-1 -ml-1 hover:bg-white/10 rounded-md text-text-secondary hover:text-white transition-colors"
                >
                    <ChevronLeft size={12} />
                </button>
                <span className="text-[10px] text-text-tertiary uppercase font-medium tracking-wider">
                    Select Type
                </span>
            </div>

            <button
                key="unrelated"
                onClick={() => { onUpdateProperty('unrelated'); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 rounded-md group"
            >
                <ThumbsDown size={12} className={`transition-colors ${niche.property === 'unrelated' ? 'text-stone-400' : 'text-text-secondary group-hover:text-stone-400'}`} />
                <span className={niche.property === 'unrelated' ? 'text-white font-medium' : ''}>Unrelated</span>
            </button>

            <button
                key="adjacent"
                onClick={() => { onUpdateProperty('adjacent'); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 rounded-md group"
            >
                <GitBranch size={12} className={`transition-colors ${niche.property === 'adjacent' ? 'text-purple-400' : 'text-text-secondary group-hover:text-purple-400'}`} />
                <span className={niche.property === 'adjacent' ? 'text-white font-medium' : ''}>Adjacent</span>
            </button>

            <button
                key="targeted"
                onClick={() => { onUpdateProperty('targeted'); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 rounded-md group"
            >
                <Trophy size={12} className={`transition-all ${niche.property === 'targeted' ? 'text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.5)]' : 'text-text-secondary group-hover:text-yellow-400 group-hover:drop-shadow-[0_0_3px_rgba(250,204,21,0.5)]'}`} />
                <span className={niche.property === 'targeted' ? 'text-white font-medium' : ''}>Targeted</span>
            </button>

            <button
                key="desired"
                onClick={() => { onUpdateProperty('desired'); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 rounded-md group"
            >
                <Heart size={12} className={`transition-colors ${niche.property === 'desired' ? 'text-pink-500' : 'text-text-secondary group-hover:text-pink-500'}`} />
                <span className={niche.property === 'desired' ? 'text-white font-medium' : ''}>Desired</span>
            </button>

            <div className="h-px bg-white/10 my-1 mx-2" />

            <button
                key="no-type"
                onClick={() => { onUpdateProperty(undefined as any); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 rounded-md"
            >
                <span className="w-3 h-3 block" />
                <span className={!niche.property ? 'text-white font-medium' : 'text-text-secondary'}>No Type</span>
            </button>
        </>
    );

    const content = (
        <div
            ref={menuRef}
            className="fixed z-[9999] bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg p-1 shadow-xl animate-fade-in min-w-[160px]"
            style={adjustedStyle}
            onClick={(e) => e.stopPropagation()}
        >
            {view === 'main' ? renderMainView() : renderPropertiesView()}
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
