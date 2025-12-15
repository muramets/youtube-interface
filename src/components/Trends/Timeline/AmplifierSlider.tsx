import React from 'react';
import { Zap, RotateCcw } from 'lucide-react';

interface AmplifierSliderProps {
    amplifierLevel: number;
    onChange: (level: number) => void;
}

export const AmplifierSlider: React.FC<AmplifierSliderProps> = ({ amplifierLevel, onChange }) => {
    // Ensure value is valid (fallback to 1.0 if NaN/undefined)
    const safeLevel = isNaN(amplifierLevel) || !amplifierLevel ? 1.0 : amplifierLevel;
    const percentage = Math.round(safeLevel * 100);

    // Stop propagation to prevent canvas from detecting mouse movement
    const stopCanvasInteraction = (e: React.MouseEvent | React.PointerEvent) => {
        e.stopPropagation();
    };

    return (
        <div
            className="absolute bottom-4 right-32 pointer-events-auto z-sticky flex items-center gap-2 group"
            onMouseDown={stopCanvasInteraction}
            onMouseMove={stopCanvasInteraction}
            onPointerDown={stopCanvasInteraction}
            onPointerMove={stopCanvasInteraction}
        >
            {/* Tooltip (appears on hover, positioned above) */}
            <div className="absolute bottom-full right-0 mb-2 text-[10px] text-text-tertiary opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out translate-y-2 group-hover:translate-y-0 pointer-events-none max-w-60 text-right">
                <span>Stretch vertical spread — separates high and low performing videos</span>
            </div>

            {/* Amplifier Control Pill */}
            <div className="flex items-center bg-bg-secondary/90 backdrop-blur-md border border-border rounded-full px-2 py-1.5 gap-2">
                <Zap size={14} className="text-text-tertiary" />
                <input
                    type="range"
                    min="100"
                    max="300"
                    value={percentage}
                    onChange={(e) => {
                        const val = parseInt(e.target.value) / 100;
                        if (!isNaN(val)) onChange(val);
                    }}
                    onMouseDown={stopCanvasInteraction}
                    onMouseMove={stopCanvasInteraction}
                    className="w-16 h-1 appearance-none bg-border rounded-full cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-3
                        [&::-webkit-slider-thumb]:h-3
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-text-secondary
                        [&::-webkit-slider-thumb]:hover:bg-text-primary
                        [&::-webkit-slider-thumb]:transition-colors
                        [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <span className="text-xs text-text-secondary font-mono tabular-nums w-8 text-right">
                    {percentage}%
                </span>

                {/* Reset Button */}
                <div className="w-[1px] h-3 bg-border mx-0.5" />
                <button
                    onClick={() => onChange(1.0)}
                    className="p-0.5 hover:bg-hover-bg rounded-full text-text-tertiary hover:text-text-primary transition-colors"
                    title="Reset to 100%"
                >
                    <RotateCcw size={12} />
                </button>
            </div>
        </div>
    );
};
