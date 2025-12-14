import React from 'react';
import { RotateCcw } from 'lucide-react';

interface ZoomIndicatorProps {
    scale: number;
    onReset: () => void;
}

export const ZoomIndicator: React.FC<ZoomIndicatorProps> = ({ scale, onReset }) => {
    return (
        <div className="absolute bottom-4 right-6 pointer-events-auto z-sticky flex flex-col items-end gap-2 group">
            {/* Keyboard Hint (appears on hover) */}
            <div className="flex items-center gap-2 text-[10px] text-text-tertiary opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out translate-y-2 group-hover:translate-y-0 pointer-events-none">
                <span className="px-1.5 py-0.5 bg-bg-secondary border border-border rounded text-text-secondary font-mono">z</span>
                <span>reset</span>
            </div>

            {/* Zoom Control Pill */}
            <div className="flex items-center bg-bg-secondary/90 backdrop-blur-md border border-border rounded-full px-1.5 py-1">
                <span className="text-xs pl-2 pr-1 text-text-secondary font-mono text-right tabular-nums">
                    {(scale * 100).toFixed(0)}%
                </span>
                <div className="w-[1px] h-3 bg-border mx-1" />
                <button
                    onClick={onReset}
                    className="p-1 hover:bg-hover-bg rounded-full text-text-tertiary hover:text-text-primary transition-colors"
                >
                    <RotateCcw size={12} />
                </button>
            </div>
        </div>
    );
};
