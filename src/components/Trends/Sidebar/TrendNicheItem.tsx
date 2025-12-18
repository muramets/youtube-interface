import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Check, Trash2 } from 'lucide-react';
import type { TrendNiche } from '../../../types/trends';
import { useTrendStore, MANUAL_NICHE_PALETTE } from '../../../stores/trendStore';
import { ConfirmationModal } from '../../Shared/ConfirmationModal';
import { NicheContextMenu } from '../Shared/NicheContextMenu';

interface TrendNicheItemProps {
    niche: TrendNiche;
    isActive: boolean;
    onClick: (id: string) => void;
    isTrash?: boolean;
}

const formatViewCount = (num?: number) => {
    if (!num) return '0';
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(num);
};

export const TrendNicheItem: React.FC<TrendNicheItemProps> = ({
    niche,
    isActive,
    onClick,
    isTrash = false
}) => {
    const { updateNiche, deleteNiche } = useTrendStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(niche.name);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLSpanElement>(null);
    const [isNameHovered, setIsNameHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [isTruncated, setIsTruncated] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

    // Use manually exported palette for user picker
    const PRESET_COLORS = MANUAL_NICHE_PALETTE;

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // NOTE: isMenuOpen check removed here because NicheContextMenu uses a portal with a backdrop
            // which handles closing on click outside. The old check on 'mousedown' was causing the menu
            // to close before the click event could propagate to the portal buttons.

            if (isColorPickerOpen && colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
                setIsColorPickerOpen(false);
            }
        };

        if (isMenuOpen || isColorPickerOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isMenuOpen, isColorPickerOpen]);

    // Focus input when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Detect text truncation for fade effect
    useEffect(() => {
        const el = nameRef.current;
        if (!el) return;
        const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [niche.name]);

    const handleNameSubmit = () => {
        const trimmedName = editName.trim();
        if (trimmedName && trimmedName !== niche.name) {
            updateNiche(niche.id, { name: trimmedName });
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleNameSubmit();
        } else if (e.key === 'Escape') {
            setEditName(niche.name);
            setIsEditing(false);
        }
    };

    const isInteracting = isMenuOpen || isColorPickerOpen;

    return (
        <div className={`relative group/niche ml-8 ${isInteracting ? 'z-20' : ''}`}>
            <div
                onClick={() => !isEditing && onClick(niche.id)}
                className={`
                    flex items-center pl-2 pr-2 py-1.5 cursor-pointer transition-colors rounded-lg
                    ${isActive
                        ? 'bg-white/10 text-white'
                        : isInteracting
                            ? 'bg-white/5 text-white'
                            : 'text-text-secondary hover:text-white hover:bg-white/5'
                    }
                `}
            >
                {/* Icon Wrapper */}
                <div className="mr-1 shrink-0 flex items-center justify-center w-4">
                    {isTrash ? (
                        <Trash2 size={14} className={`${isActive ? 'text-white' : 'text-gray-400'} translate-y-[-2px]`} />
                    ) : (
                        <div
                            ref={colorPickerRef}
                            className="relative"
                        >
                            <div
                                role="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsColorPickerOpen(!isColorPickerOpen);
                                    setIsMenuOpen(false);
                                }}
                                className="w-2.5 h-2.5 rounded-full transition-all hover:scale-125 hover:ring-2 hover:ring-white/20 cursor-pointer"
                                style={{ backgroundColor: niche.color }}
                            />

                            {/* Color Picker */}
                            {isColorPickerOpen && (
                                <div
                                    className="absolute left-0 top-6 z-50 bg-[#1a1a1a] border border-white/10 rounded-xl p-3 shadow-xl animate-fade-in"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div
                                        className="grid gap-2"
                                        style={{ gridTemplateColumns: 'repeat(5, min-content)' }}
                                    >
                                        {PRESET_COLORS.map(color => (
                                            <button
                                                key={color}
                                                onClick={(e) => {
                                                    e.stopPropagation();
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
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Name (Editable on double-click) */}
                <div className="flex-1 min-w-0 relative flex items-center">
                    <span
                        ref={nameRef}
                        className={`text-xs overflow-hidden whitespace-nowrap transition-colors leading-none translate-y-[-1px] ${isEditing ? 'opacity-0' : ''}`}
                        style={isTruncated ? {
                            maskImage: 'linear-gradient(to right, black 50%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to right, black 50%, transparent 100%)'
                        } : undefined}
                        onMouseEnter={() => {
                            if (nameRef.current) {
                                const rect = nameRef.current.getBoundingClientRect();
                                setTooltipPos({ x: rect.left, y: rect.top - 4 });
                            }
                            setIsNameHovered(true);
                        }}
                        onMouseLeave={() => setIsNameHovered(false)}
                    >
                        {niche.name}
                    </span>
                    {isEditing && !isTrash && (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={handleNameSubmit}
                            onKeyDown={handleKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-y-0 left-0 right-0 text-xs bg-[#1a1a1a] border-0 border-b border-white/40 outline-none text-white z-10"
                        />
                    )}
                </div>

                {/* Portal Tooltip */}
                {isNameHovered && !isEditing && createPortal(
                    <div
                        className="fixed z-[9999] px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl text-xs text-white whitespace-nowrap pointer-events-none animate-fade-in"
                        style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-100%)' }}
                    >
                        {niche.name}
                    </div>,
                    document.body
                )}

                {/* View Count & Actions block */}
                <div className="ml-2 flex items-center gap-0.5 shrink-0">
                    {/* View Count */}
                    <span className="text-[10px] text-text-tertiary leading-none">
                        {formatViewCount(niche.viewCount)}
                    </span>

                    {/* Actions Trigger (Hidden unless hovered/active) */}
                    {!isTrash && (
                        <div ref={menuRef} className="relative">
                            <button
                                ref={menuButtonRef}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isMenuOpen) {
                                        // Calculate position for portal
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setMenuPosition({
                                            x: rect.right + 5, // Open to the right slightly
                                            y: rect.top
                                        });
                                    }
                                    setIsMenuOpen(!isMenuOpen);
                                    setIsColorPickerOpen(false);
                                }}
                                className={`
                                    p-0.5 rounded-full transition-opacity
                                    ${isInteracting ? 'opacity-100' : 'opacity-0 group-hover/niche:opacity-100'}
                                    ${isMenuOpen ? 'opacity-100 bg-white/10' : 'hover:bg-white/10'}
                                `}
                            >
                                <MoreVertical size={12} />
                            </button>

                            {/* Shared Context Menu */}
                            <NicheContextMenu
                                niche={niche}
                                isOpen={isMenuOpen}
                                onClose={() => setIsMenuOpen(false)}
                                position={menuPosition}
                                onRename={() => {
                                    setIsEditing(true);
                                    setEditName(niche.name);
                                    setIsMenuOpen(false);
                                }}
                                onDelete={() => {
                                    setIsDeleteConfirmOpen(true);
                                    setIsMenuOpen(false);
                                }}
                            />
                        </div>
                    )}
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
