import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ThumbsDown, Trophy, Heart, MoreVertical } from 'lucide-react';
import type { SuggestedTrafficNiche, TrafficNicheProperty } from '@/core/types/suggestedTrafficNiches';
import { useTrafficNicheStore } from '@/core/stores/useTrafficNicheStore';
import { useAuth } from '@/core/hooks/useAuth';
import { useChannelStore } from '@/core/stores/channelStore';
import { MANUAL_NICHE_PALETTE } from '@/core/stores/trendStore';
import { TrafficNicheContextMenu } from './TrafficNicheContextMenu';
import { ConfirmationModal } from '@/components/Shared/ConfirmationModal';

interface TrafficNicheItemProps {
    niche: SuggestedTrafficNiche;
    status?: 'all' | 'some' | 'none';
    isActive: boolean; // Controls whether this item's menu is open
    isHighlighted?: boolean;
    onClick: () => void;
    onToggleMenu?: () => void;
    onCloseMenu?: () => void;
    // Optional stats for sidebar display
    impressions?: number;
}

export const TrafficNicheItem: React.FC<TrafficNicheItemProps> = ({
    niche,
    status = 'none',
    isActive,
    isHighlighted,
    onClick,
    onToggleMenu,
    onCloseMenu,
    impressions
}) => {
    // Stores & Hooks
    const { updateTrafficNiche, deleteTrafficNiche } = useTrafficNicheStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    // Local State
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(niche.name);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // --- Actions ---

    const handleUpdate = async (updates: Partial<SuggestedTrafficNiche>) => {
        if (!user || !currentChannel) return;
        await updateTrafficNiche(niche.id, updates, user.uid, currentChannel.id);
    };

    const handleDelete = async () => {
        if (!user || !currentChannel) return;
        await deleteTrafficNiche(niche.id, user.uid, currentChannel.id);
        setDeleteConfirmOpen(false);
    };

    const handleRenameSubmit = () => {
        const trimmed = editName.trim();
        if (trimmed && trimmed !== niche.name) {
            handleUpdate({ name: trimmed });
        }
        setIsEditing(false);
    };

    const handleColorClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsColorPickerOpen(!isColorPickerOpen);
        onCloseMenu?.();
    };

    // --- Property Icon Logic ---
    const getPropertyIcon = (prop?: TrafficNicheProperty) => {
        switch (prop) {
            case 'unrelated':
                return <ThumbsDown size={12} className="text-stone-400 drop-shadow-[0_0_3px_rgba(168,162,158,0.5)]" />;
            case 'targeted':
                return <Trophy size={12} className="text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.5)]" />;
            case 'desired':
                return <Heart size={12} className="text-pink-500" />;
            default:
                return null;
        }
    };

    // Close color picker on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
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
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Utility for formatting numbers
    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US', {
            notation: "compact",
            maximumFractionDigits: 1
        }).format(num);
    };

    const isAssigned = status === 'all';
    const isInteracting = isActive || isColorPickerOpen;

    return (
        <>
            <div
                className={`
                    group relative w-full text-left px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-colors
                    ${isAssigned ? 'text-white' : 'text-text-secondary hover:text-white'}
                    ${isInteracting ? 'bg-white/5 z-20' : isHighlighted ? 'bg-white/10 text-white' : 'hover:bg-white/5'}
                `}
                onClick={() => !isEditing && !isInteracting && onClick()}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Color Dot / Picker Trigger */}
                    <div ref={colorPickerRef} className="relative shrink-0 flex items-center">
                        <div
                            role="button"
                            onClick={handleColorClick}
                            className="w-2 h-2 rounded-full cursor-pointer hover:scale-125 transition-transform hover:ring-2 hover:ring-white/20"
                            style={{ backgroundColor: niche.color }}
                        />
                        {isColorPickerOpen && createPortal(
                            <div
                                className="fixed z-[9999] bg-[#1a1a1a] border border-white/10 rounded-xl p-3 shadow-xl animate-fade-in"
                                style={{
                                    left: colorPickerRef.current?.getBoundingClientRect().left,
                                    top: (colorPickerRef.current?.getBoundingClientRect().bottom || 0) + 8,
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(5, min-content)' }}>
                                    {MANUAL_NICHE_PALETTE.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => {
                                                handleUpdate({ color });
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

                    {/* Property Icon */}
                    <div className="flex-shrink-0">
                        {getPropertyIcon(niche.property)}
                    </div>

                    {/* Name */}
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={handleRenameSubmit}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSubmit();
                                if (e.key === 'Escape') {
                                    setEditName(niche.name);
                                    setIsEditing(false);
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-transparent border-b border-white/40 outline-none text-white w-full"
                        />
                    ) : (
                        <span className="truncate">{niche.name}</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* View Count (Impressions) */}
                    {impressions !== undefined && (
                        <span className="text-[10px] text-text-tertiary leading-none">
                            {formatNumber(impressions)}
                        </span>
                    )}

                    {/* Assigned Check */}
                    {isAssigned && <Check size={12} className="text-green-400 flex-shrink-0" />}

                    {/* More Menu */}
                    {onToggleMenu && (
                        <div className="relative">
                            <button
                                ref={menuButtonRef}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    onToggleMenu?.();

                                    const MENU_WIDTH = 160;
                                    const GAP = 8;
                                    const screenW = window.innerWidth;
                                    let left = rect.right + GAP;
                                    if (left + MENU_WIDTH > screenW - GAP) {
                                        left = rect.left - MENU_WIDTH - GAP;
                                    }
                                    setMenuPosition({ x: left, y: rect.top });
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
                        </div>
                    )}
                </div>
            </div>

            {/* Context Menu */}
            {onCloseMenu && (
                <TrafficNicheContextMenu
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
                        setDeleteConfirmOpen(true);
                        onCloseMenu();
                    }}
                    onUpdateProperty={(prop) => handleUpdate({ property: prop })}
                />
            )}

            {/* Delete Confirmation */}
            <ConfirmationModal
                isOpen={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                onConfirm={handleDelete}
                title="Delete Niche"
                message={`Are you sure you want to delete "${niche.name}"? This will remove it from all suggested traffic videos.`}
                confirmLabel="Delete"
            />
        </>
    );
};
