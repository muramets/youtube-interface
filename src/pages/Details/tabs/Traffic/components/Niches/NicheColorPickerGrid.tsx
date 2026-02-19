import React from 'react';
import { Check } from 'lucide-react';
import { MANUAL_NICHE_PALETTE } from '@/core/stores/trends/trendStore';

interface NicheColorPickerGridProps {
    selectedColor?: string;
    onSelect: (color: string) => void;
}

export const NicheColorPickerGrid: React.FC<NicheColorPickerGridProps> = ({
    selectedColor,
    onSelect
}) => {
    return (
        <div className="grid grid-cols-8 gap-1.5 p-1">
            {MANUAL_NICHE_PALETTE.map((color) => {
                const isSelected = selectedColor === color;
                return (
                    <button
                        key={color}
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelect(color);
                        }}
                        className={`
                            relative w-5 h-5 rounded-full transition-transform hover:scale-110 focus:outline-none
                            ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1a1a1a]' : 'hover:ring-2 hover:ring-white/20 hover:ring-offset-1 hover:ring-offset-[#1a1a1a]'}
                        `}
                        style={{ backgroundColor: color }}
                        title={color}
                    >
                        {isSelected && (
                            <Check
                                size={12}
                                className="absolute inset-0 m-auto text-white drop-shadow-md"
                                strokeWidth={3}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
};
