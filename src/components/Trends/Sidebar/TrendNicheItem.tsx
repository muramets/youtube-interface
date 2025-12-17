import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Check } from 'lucide-react';
import type { TrendNiche } from '../../../types/trends';
import { useTrendStore, MANUAL_NICHE_PALETTE } from '../../../stores/trendStore';

interface TrendNicheItemProps {
    niche: TrendNiche;
    isActive: boolean;
    onClick: (id: string) => void;
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
    onClick
}) => {
    const { updateNiche, deleteNiche } = useTrendStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(niche.name);

    const menuRef = useRef<HTMLDivElement>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLSpanElement>(null);
    const lastClickTime = useRef<number>(0);
    const [isNameHovered, setIsNameHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    // Use manually exported palette for user picker
    const PRESET_COLORS = MANUAL_NICHE_PALETTE;

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (isMenuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false);
            }
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

    // Handle double-click to edit
    const handleNameClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const now = Date.now();
        if (now - lastClickTime.current < 300) {
            // Double click detected
            setIsEditing(true);
            setEditName(niche.name);
        }
        lastClickTime.current = now;
    };

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

    return (
        <li className="relative group/niche">
            <div
                onClick={() => !isEditing && onClick(niche.id)}
                className={`
                    flex items-center pl-8 pr-2 py-1.5 cursor-pointer transition-colors rounded-lg mx-1
                    ${isActive ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white hover:bg-white/5'}
                `}
            >
                {/* Color Dot (Clickable) */}
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
                        className="w-2.5 h-2.5 rounded-full mr-3 shrink-0 transition-all hover:scale-125 hover:ring-2 hover:ring-white/20 cursor-pointer"
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

                {/* Name (Editable on double-click) */}
                <div className="flex-1 min-w-0 relative">
                    <span
                        ref={nameRef}
                        className="text-xs truncate block"
                        onClick={handleNameClick}
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
                    {isEditing && (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={handleNameSubmit}
                            onKeyDown={handleKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-0 text-xs bg-transparent border-0 border-b border-white/40 outline-none text-white"
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

                {/* View Count */}
                <span className="text-[10px] text-text-tertiary ml-2">
                    {formatViewCount(niche.viewCount)}
                </span>

                {/* Actions Trigger (Hidden unless hovered/active) */}
                <div ref={menuRef} className="relative">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMenuOpen(!isMenuOpen);
                            setIsColorPickerOpen(false);
                        }}
                        className={`
                            p-0.5 rounded ml-1 opacity-0 group-hover/niche:opacity-100 transition-opacity
                            ${isMenuOpen ? 'opacity-100 bg-white/10' : 'hover:bg-white/10'}
                        `}
                    >
                        <MoreVertical size={12} />
                    </button>

                    {/* Context Menu */}
                    {isMenuOpen && (
                        <div
                            className="absolute right-0 top-6 z-50 bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl animate-fade-in min-w-[100px]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsEditing(true);
                                    setEditName(niche.name);
                                    setIsMenuOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors"
                            >
                                Rename
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`Delete niche "${niche.name}"?`)) {
                                        deleteNiche(niche.id);
                                    }
                                    setIsMenuOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
};
