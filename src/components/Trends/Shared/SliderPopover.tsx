import React, { useState, useEffect, forwardRef } from 'react';
import { createPortal } from 'react-dom';

interface SliderPopoverProps {
    isOpen: boolean;
    anchorRef: React.RefObject<HTMLButtonElement | null>;
    value: number;
    label: string;
    onChange: (value: number) => void;
}

// Slider Popover component rendered via portal for proper backdrop-blur
export const SliderPopover = forwardRef<HTMLDivElement, SliderPopoverProps>(({ isOpen, anchorRef, value, label, onChange }, ref) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (isOpen && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPosition({
                x: rect.left + rect.width / 2,
                y: rect.top - 12 // 12px gap above the button
            });
        }
    }, [isOpen, anchorRef]);

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[1000] pointer-events-auto"
            style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%)'
            }}
        >
            <div className="bg-bg-secondary/90 backdrop-blur-md border border-border rounded-full p-2 flex flex-col items-center gap-2 shadow-xl animate-fade-in-up">
                <span className="text-[10px] font-mono text-text-secondary w-8 text-center">{label}</span>
                <div className="h-32 w-6 flex items-center justify-center relative">
                    <div className="absolute w-1 h-full bg-border rounded-full pointer-events-none" />
                    <div
                        className="absolute w-1 bg-text-secondary rounded-full bottom-0 pointer-events-none transition-all duration-75"
                        style={{ height: `${value}%` }}
                    />
                    <input
                        type="range"
                        min="0"
                        max="100"
                        // @ts-ignore
                        orient="vertical"
                        value={value}
                        onChange={(e) => onChange(parseInt(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none z-10"
                        style={{ WebkitAppearance: 'slider-vertical' } as any}
                    />
                    <div
                        className="absolute w-3 h-3 bg-white rounded-full shadow-md pointer-events-none transition-all duration-75"
                        style={{ bottom: `calc(${value}% - 6px)` }}
                    />
                </div>
            </div>
        </div>,
        document.body
    );
});
