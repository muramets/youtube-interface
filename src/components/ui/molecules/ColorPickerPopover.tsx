// =============================================================================
// COLOR PICKER POPOVER: Reusable grid picker with preset colors
// Used by: GenreTab (settings), MusicPlaylistItem (sidebar)
// =============================================================================

import React, { useRef, useEffect } from 'react';
import { Check } from 'lucide-react';

interface ColorPickerPopoverProps {
    /** Currently selected color */
    currentColor: string;
    /** Palette of colors to display */
    colors: string[];
    /** Called with the new color when user picks one */
    onColorChange: (color: string) => void;
    /** Called to close the popover */
    onClose: () => void;
    /** Number of columns in the grid (default: 5) */
    columns?: number;
}

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
    currentColor,
    colors,
    onColorChange,
    onClose,
    columns = 5,
}) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="absolute left-0 top-7 z-50 bg-[#1a1a1a] border border-white/10 rounded-xl p-3 shadow-xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
        >
            <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${columns}, min-content)` }}
            >
                {colors.map(c => (
                    <button
                        key={c}
                        onClick={(e) => {
                            e.stopPropagation();
                            onColorChange(c);
                        }}
                        className="w-6 h-6 rounded-full transition-shadow relative hover:ring-2 hover:ring-white/50 ring-offset-1 ring-offset-[#1a1a1a] border-none cursor-pointer"
                        style={{ backgroundColor: c }}
                    >
                        {currentColor === c && (
                            <Check size={12} className="absolute inset-0 m-auto text-white drop-shadow-sm" strokeWidth={3} />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};
