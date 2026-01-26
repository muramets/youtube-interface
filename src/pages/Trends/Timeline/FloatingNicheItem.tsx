import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Check, Globe } from 'lucide-react';
import type { TrendNiche } from '../../../core/types/trends';
import { useTrendStore, MANUAL_NICHE_PALETTE } from '../../../core/stores/trendStore';
import { ConfirmationModal } from '../../../components/Shared/ConfirmationModal';
import { NicheContextMenu } from '../../Trends/Shared/NicheContextMenu';

interface FloatingNicheItemProps {
    niche: TrendNiche;
    isAssigned: boolean;
    isActive: boolean; // Controls whether this item's menu is open
    isHighlighted?: boolean; // For keyboard navigation
    onToggle: () => void;
    onToggleMenu: () => void;
    onCloseMenu: () => void;
}

export const FloatingNicheItem: React.FC<FloatingNicheItemProps> = ({
    niche,
    isAssigned,
    isActive,
    isHighlighted = false,
    onToggle,
    onToggleMenu,
    onCloseMenu
}) => {
    const { updateNiche, deleteNiche } = useTrendStore();
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(niche.name);
    const [menuPosition, setMenuPosition] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const PRESET_COLORS = MANUAL_NICHE_PALETTE;

    const handleSaveName = () => {
        const trimmed = editName.trim();
        if (trimmed && trimmed !== niche.name) {
            updateNiche(niche.id, { name: trimmed });
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSaveName();
        if (e.key === 'Escape') {
            setEditName(niche.name);
            setIsEditing(false);
        }
    };

    // Calculate menu position when opening
    useLayoutEffect(() => {
        if (isActive && menuButtonRef.current) {
            const rect = menuButtonRef.current.getBoundingClientRect();
            const MENU_WIDTH = 140; // Approx min-width
            const GAP = 8;
            const screenW = window.innerWidth;

            // Default: position to the right
            let left = rect.right + GAP;

            // If it clips right edge, flip to left
            if (left + MENU_WIDTH > screenW - GAP) {
                left = rect.left - MENU_WIDTH - GAP;
            }

            setMenuPosition({
                x: left,
                y: rect.top
            });
        }
    }, [isActive]);


    // Close on click outside (handled partially by parent check, but good to have fallback)
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // Close color picker
            if (isColorPickerOpen && colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
                setIsColorPickerOpen(false);
            }
        };

        if (isColorPickerOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isColorPickerOpen]);

    // Focus input on edit
    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const isInteracting = isActive || isColorPickerOpen;

    return (
        <div
            className={`
                group relative w-full text-left px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-colors scroll-mt-1
                ${isAssigned ? 'text-white' : 'text-text-secondary hover:text-white'}
                ${isInteracting ? 'bg-white/5 z-20' : isHighlighted ? 'bg-white/10 text-white' : 'hover:bg-white/5'}
            `}
            onClick={() => !isEditing && !isInteracting && onToggle()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (!isEditing && !isInteracting && (e.key === 'Enter' || e.key === ' ')) {
                    onToggle();
                }
            }}
        >
            <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Color Dot / Picker Trigger */}
                <div ref={colorPickerRef} className="relative shrink-0">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isColorPickerOpen && colorPickerRef.current) {
                                const rect = colorPickerRef.current.getBoundingClientRect();
                                setPickerPosition({
                                    left: rect.left,
                                    top: rect.bottom + 8
                                });
                            }
                            setIsColorPickerOpen(!isColorPickerOpen);
                            onCloseMenu();
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                setIsColorPickerOpen(!isColorPickerOpen);
                                onCloseMenu();
                            }
                        }}
                        className="w-2 h-2 rounded-full cursor-pointer hover:scale-125 transition-transform hover:ring-2 hover:ring-white/20"
                        style={{ backgroundColor: niche.color }}
                    />
                    {isColorPickerOpen && pickerPosition && createPortal(
                        <div
                            className="fixed z-[9999] bg-[#1a1a1a] border border-white/10 rounded-xl p-3 shadow-xl animate-fade-in"
                            style={{
                                left: pickerPosition.left,
                                top: pickerPosition.top,
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(5, min-content)' }}>
                                {PRESET_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => {
                                            updateNiche(niche.id, { color });
                                            setIsColorPickerOpen(false);
                                        }}
                                        className="w-6 h-6 rounded-full transition-shadow relative hover:ring-2 hover:ring-white/50 ring-offset-1 ring-offset-[#1a1a1a]"
                                        style={{ backgroundColor: color }}
                                    >
                                        {niche.color === color && (
                                            <Check size={12} className="absolute inset-0 m-auto text-white drop-shadow-sm" strokeWidth={3} />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>,
                        document.body
                    )}
                </div>

                {/* Name */}
                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleSaveName}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent border-b border-white/40 outline-none text-white w-full"
                    />
                ) : (
                    <span className="truncate">{niche.name}</span>
                )}

                {niche.type === 'global' && <Globe size={10} className="text-text-tertiary flex-shrink-0" />}
            </div>

            <div className="flex items-center gap-1">
                {/* Assigned Check */}
                {isAssigned && <Check size={12} className="text-green-400 flex-shrink-0" />}

                {/* More Menu */}
                <div className="relative">
                    <button
                        ref={menuButtonRef}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleMenu();
                            setIsColorPickerOpen(false);
                        }}
                        className={`
                            p-1 rounded ml-1 transition-opacity
                            ${isInteracting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                            ${isActive ? 'bg-white/10' : 'hover:bg-white/10'}
                        `}
                    >
                        <MoreVertical size={12} />
                    </button>

                    <NicheContextMenu
                        niche={niche}
                        isOpen={isActive}
                        onClose={onCloseMenu}
                        position={menuPosition}
                        onRename={() => {
                            setIsEditing(true);
                            setEditName(niche.name);
                            onCloseMenu();
                        }}
                        onDelete={() => {
                            setIsDeleteConfirmOpen(true);
                            onCloseMenu();
                        }}
                    />
                </div>
            </div>

            <ConfirmationModal
                isOpen={isDeleteConfirmOpen}
                onClose={() => setIsDeleteConfirmOpen(false)}
                onConfirm={() => {
                    deleteNiche(niche.id);
                    setIsDeleteConfirmOpen(false);
                }}
                title="Delete Niche"
                message={`Are you sure you want to delete "${niche.name}"? This will remove all video assignments.`}
                confirmLabel="Delete"
            />
        </div >
    );
};

FloatingNicheItem.displayName = 'FloatingNicheItem';
