import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Check, Trash2, Target, Globe } from 'lucide-react';
import { ConfirmationModal } from '@/components/Shared/ConfirmationModal';

export interface NicheItemBaseProps {
    id: string;
    name: string;
    color: string;
    viewCount?: number;

    // Status flags
    isActive: boolean;        // Is menu open / interacting
    isAssigned?: boolean;     // Visual checkmark
    isTrash?: boolean;
    isTargeted?: boolean;     // Emerald target icon (Trends specific mainly)
    isGlobal?: boolean;       // Globe icon

    // Property Icons (Traffic specific)
    startIcon?: React.ReactNode;

    // Interactions
    onClick?: () => void;
    onToggleMenu?: (e: React.MouseEvent, position: { x: number, y: number }) => void;

    // DnD
    setNodeRef?: (node: HTMLElement | null) => void;
    isDragTarget?: boolean;

    // Color Picker
    isColorPickerOpen?: boolean;
    onColorClick?: (e: React.MouseEvent) => void;
    renderColorPicker?: () => React.ReactNode;
    colorPickerRef?: React.RefObject<HTMLDivElement>;

    // Editing
    isEditing?: boolean;
    editName?: string;
    onEditNameChange?: (val: string) => void;
    onEditNameSubmit?: () => void;
    onEditKeyDown?: (e: React.KeyboardEvent) => void;
    inputRef?: React.RefObject<HTMLInputElement>;
}

const formatViewCount = (num?: number) => {
    if (!num) return '0';
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(num);
};

export const NicheItemBase: React.FC<NicheItemBaseProps> = ({
    name,
    color,
    viewCount,
    isActive,
    isAssigned,
    isTrash,
    isTargeted,
    isGlobal,
    startIcon,
    onClick,
    onToggleMenu,
    setNodeRef,
    isDragTarget,
    isColorPickerOpen,
    onColorClick,
    renderColorPicker,
    colorPickerRef,
    isEditing,
    editName,
    onEditNameChange,
    onEditNameSubmit,
    onEditKeyDown,
    inputRef
}) => {
    const nameRef = useRef<HTMLSpanElement>(null);
    const [isNameHovered, setIsNameHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [isTruncated, setIsTruncated] = useState(false);

    // Detect text truncation
    useEffect(() => {
        const el = nameRef.current;
        if (!el) return;
        const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [name]);

    return (
        <div
            ref={setNodeRef}
            className={`relative group/niche ml-8 ${isDragTarget ? 'z-[10001]' : (isActive || isColorPickerOpen) ? 'z-20' : ''}`}
        >
            <div
                onClick={() => !isEditing && onClick?.()}
                className={`
                    flex items-center pl-2 pr-2 py-1.5 cursor-pointer transition-all rounded-lg
                    ${isDragTarget
                        ? 'bg-white/20 text-white'
                        : isActive
                            ? 'bg-white/10 text-white'
                            : (isActive || isColorPickerOpen)
                                ? 'bg-white/5 text-white'
                                : 'text-text-secondary hover:text-white hover:bg-white/5'
                    }
                `}
            >
                {/* Icon Wrapper */}
                <div className="mr-1 shrink-0 flex items-center justify-center w-4">
                    {/* Custom Start Icon overrides everything if present */}
                    {startIcon ? (
                        startIcon
                    ) : isTrash ? (
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
                                    onColorClick?.(e);
                                }}
                                className={`w-2.5 h-2.5 rounded-full transition-all hover:scale-125 hover:ring-2 hover:ring-white/20 cursor-pointer`}
                                style={{ backgroundColor: color }}
                            />
                            {isColorPickerOpen && renderColorPicker?.()}
                        </div>
                    )}
                </div>

                {/* Target Icon (Trends specific) */}
                {isTargeted && (
                    <Target size={11} className="text-emerald-400 mr-1 shrink-0" />
                )}

                {/* Name (Editable) */}
                <div className="flex-1 min-w-0 relative flex items-center">
                    <span
                        ref={nameRef}
                        className={`text-xs overflow-hidden whitespace-nowrap transition-colors leading-none translate-y-[-1px] ${isEditing ? 'opacity-0' : ''} ${isTargeted ? 'text-emerald-400' : ''}`}
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
                        {name}
                    </span>
                    {isEditing && !isTrash && (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editName}
                            onChange={(e) => onEditNameChange?.(e.target.value)}
                            onBlur={onEditNameSubmit}
                            onKeyDown={onEditKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-y-0 left-0 right-0 text-xs bg-[#1a1a1a] border-0 border-b border-white/40 outline-none text-white z-10"
                            autoFocus
                        />
                    )}
                </div>

                {/* Portal Tooltip */}
                {((isNameHovered && !isEditing) || isDragTarget) && createPortal(
                    <div
                        className="fixed z-[9999] px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl text-xs text-white whitespace-nowrap pointer-events-none animate-fade-in"
                        style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-100%)' }}
                    >
                        {name}
                    </div>,
                    document.body
                )}

                {isGlobal && <Globe size={10} className="text-text-tertiary flex-shrink-0 ml-1" />}

                {/* View Count & Actions block */}
                <div className="ml-2 flex items-center gap-0.5 shrink-0">
                    {/* View Count */}
                    {viewCount !== undefined && (
                        <span className="text-[10px] text-text-tertiary leading-none">
                            {formatViewCount(viewCount)}
                        </span>
                    )}

                    {/* Assigned Check */}
                    {isAssigned && <Check size={12} className="text-green-400 flex-shrink-0 ml-1" />}

                    {/* Actions Trigger */}
                    {!isTrash && onToggleMenu && (
                        <div className="relative ml-0.5">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    onToggleMenu(e, {
                                        x: rect.right + 5,
                                        y: rect.top
                                    });
                                }}
                                className={`
                                    p-0.5 rounded-full transition-opacity
                                    ${(isActive || isColorPickerOpen) ? 'opacity-100' : 'opacity-0 group-hover/niche:opacity-100'}
                                    ${isActive ? 'opacity-100 bg-white/10' : 'hover:bg-white/10'}
                                `}
                            >
                                <MoreVertical size={12} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
