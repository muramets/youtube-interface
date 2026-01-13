import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ThumbsDown, Trophy, Heart, MoreVertical, GitBranch, Trash2 } from 'lucide-react';
import type { SuggestedTrafficNiche, TrafficNicheProperty } from '@/core/types/suggestedTrafficNiches';
import { useTrafficNicheStore } from '@/core/stores/useTrafficNicheStore';
import { useAuth } from '@/core/hooks/useAuth';
import { useChannelStore } from '@/core/stores/channelStore';
import { TrafficNicheContextMenu } from './TrafficNicheContextMenu';
import { ConfirmationModal } from '@/components/Shared/ConfirmationModal';
import { NicheColorPickerGrid } from './NicheColorPickerGrid';

interface TrafficNicheItemProps {
    niche: SuggestedTrafficNiche;
    status?: 'all' | 'some' | 'none';
    isActive: boolean; // Controls whether this item's menu is open
    isSelected?: boolean; // Controls visual selection state (filter active)
    isHighlighted?: boolean; // Controls keyboard navigation highlight
    onClick: () => void;
    onToggleMenu?: () => void;
    onCloseMenu?: () => void;
    // Optional stats for sidebar display
    impressions?: number;
    metricType?: 'impressions' | 'views';
    isTrash?: boolean;
}

export const TrafficNicheItem: React.FC<TrafficNicheItemProps> = ({
    niche,
    status = 'none',
    isActive,
    isSelected,
    isHighlighted,
    onClick,
    onToggleMenu,
    onCloseMenu,
    impressions,
    metricType = 'impressions',
    isTrash = false
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
            case 'adjacent':
                return <GitBranch size={12} className="text-purple-400" />;
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
    // Menu open or color picker open
    const isInteracting = isActive || isColorPickerOpen;

    // --- Truncation Logic ---
    const nameRef = useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);
    const [isNameHovered, setIsNameHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const el = nameRef.current;
        if (!el) return;
        const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [niche.name]);

    return (
        <>
            <div
                className={`
                    group relative w-full text-left px-3 py-1.5 text-xs rounded-lg flex items-center justify-between transition-colors gap-3 select-none
                    ${isAssigned ? 'text-white' : ''}
                    ${isInteracting
                        ? 'bg-white/5 z-20 text-text-primary'
                        : isSelected
                            ? 'bg-sidebar-active text-text-primary font-medium'
                            : isHighlighted
                                ? 'bg-white/10 text-white' // Highlight style
                                : 'text-text-tertiary hover:text-text-secondary hover:bg-sidebar-hover'
                    }
                `}
                onClick={() => !isEditing && !isInteracting && onClick()}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Color Dot / Picker Trigger */}
                    <div ref={colorPickerRef} className="relative shrink-0 flex items-center w-4 justify-center">
                        {isTrash ? (
                            <Trash2 size={12} className={`${isSelected ? 'text-white' : 'text-text-secondary group-hover:text-white'}`} />
                        ) : (
                            <>
                                <div
                                    role="button"
                                    onClick={handleColorClick}
                                    className="w-2 h-2 rounded-full cursor-pointer hover:scale-125 transition-transform hover:ring-2 hover:ring-white/20"
                                    style={{ backgroundColor: niche.color }}
                                />
                                {isColorPickerOpen && createPortal(
                                    <div
                                        className="fixed z-[9999] bg-[#1a1a1a] border border-white/10 rounded-xl p-3 shadow-xl animate-fade-in w-[240px]"
                                        style={{
                                            left: colorPickerRef.current?.getBoundingClientRect().left,
                                            top: (colorPickerRef.current?.getBoundingClientRect().bottom || 0) + 8,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <NicheColorPickerGrid
                                            selectedColor={niche.color}
                                            onSelect={(color) => {
                                                handleUpdate({ color });
                                                setIsColorPickerOpen(false);
                                            }}
                                        />
                                    </div>,
                                    document.body
                                )}
                            </>
                        )}
                    </div>

                    {/* Property Icon */}
                    <div className="flex-shrink-0">
                        {!isTrash && getPropertyIcon(niche.property)}
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
                        <span
                            ref={nameRef}
                            className="truncate cursor-default"
                            onMouseEnter={() => {
                                if (nameRef.current) {
                                    const rect = nameRef.current.getBoundingClientRect();
                                    setTooltipPos({ x: rect.left, y: rect.top - 4 });
                                }
                                setIsNameHovered(true);
                            }}
                            onMouseLeave={() => setIsNameHovered(false)}
                        >
                            {isTrash ? 'Trash' : niche.name}
                        </span>
                    )}
                </div>

                {/* Name Tooltip (Only if truncated) */}
                {isNameHovered && isTruncated && !isEditing && createPortal(
                    <div
                        className="fixed z-[9999] px-2 py-1 bg-[#1a1a1a] rounded-md shadow-xl text-xs text-white whitespace-nowrap pointer-events-none animate-fade-in"
                        style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-100%)' }}
                    >
                        {niche.name}
                    </div>,
                    document.body
                )}

                <div className="flex items-center gap-2">
                    {/* View Count (Impressions) */}
                    {impressions !== undefined && (
                        <div className="relative group/impressions">
                            <span className="text-[10px] text-text-tertiary leading-none cursor-help">
                                {formatNumber(impressions)}
                            </span>
                            {/* Simple tooltip for stats */}
                            <div className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-[#1a1a1a] rounded text-[10px] text-white opacity-0 group-hover/impressions:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                {metricType.charAt(0).toUpperCase() + metricType.slice(1)}
                            </div>
                        </div>
                    )}

                    {/* Assigned Check */}
                    {isAssigned && <Check size={12} className="text-green-400 flex-shrink-0" />}

                    {/* More Menu (Hide for Trash) */}
                    {onToggleMenu && !isTrash && (
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
