import React, { useState, useRef, useEffect, forwardRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Zap } from 'lucide-react';

interface ZoomIndicatorProps {
    scale: number;
    minScale: number;
    onReset: () => void;
    amplifierLevel: number;
    onAmplifierChange: (level: number) => void;
    onZoomChange: (scale: number) => void;
    isLoading?: boolean;
}

// Slider Popover component rendered via portal for proper backdrop-blur
const SliderPopover = forwardRef<HTMLDivElement, {
    isOpen: boolean;
    anchorRef: React.RefObject<HTMLButtonElement | null>;
    value: number;
    label: string;
    onChange: (value: number) => void;
}>(({ isOpen, anchorRef, value, label, onChange }, ref) => {
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

export const ZoomIndicator: React.FC<ZoomIndicatorProps> = ({
    scale,
    minScale,
    onReset,
    amplifierLevel,
    onAmplifierChange,
    onZoomChange,
    isLoading = false
}) => {
    const [isAmplifierOpen, setIsAmplifierOpen] = useState(false);
    const [isDraggingZoom, setIsDraggingZoom] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const amplifierButtonRef = useRef<HTMLButtonElement>(null);
    const amplifierSliderRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ x: number; y: number; scale: number } | null>(null);

    // Close amplifier slider when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const isInsideContainer = containerRef.current?.contains(target);
            const isInsideAmplifierSlider = amplifierSliderRef.current?.contains(target);

            if (!isInsideContainer && !isInsideAmplifierSlider) {
                setIsAmplifierOpen(false);
            }
        };

        if (isAmplifierOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isAmplifierOpen]);

    // -- Drag handling for Scale indicator with smoothing --
    const targetScaleRef = useRef(scale);
    const rafRef = useRef<number | null>(null);

    const handleZoomDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDraggingZoom(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY, scale };
        targetScaleRef.current = scale;
    }, [scale]);

    useEffect(() => {
        if (!isDraggingZoom) return;

        // Smooth animation loop
        const animate = () => {
            const currentScale = targetScaleRef.current;
            // Only call onZoomChange if there's meaningful change
            onZoomChange(currentScale);
            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);

        const handleMouseMove = (e: MouseEvent) => {
            if (!dragStartRef.current) return;

            const deltaX = e.clientX - dragStartRef.current.x;
            const deltaY = -(e.clientY - dragStartRef.current.y); // Negative because up = increase

            // Use combined delta (horizontal has more weight for natural feel)
            const combinedDelta = deltaX + deltaY * 0.5;

            // Sensitivity: 200px drag = range from minScale to 1.0 (0-100%)
            // Beyond 100%, same sensitivity continues naturally
            const baseSensitivity = (1.0 - minScale) / 200;
            const newScale = Math.max(minScale, Math.min(10.0, dragStartRef.current.scale + combinedDelta * baseSensitivity));

            // Update target (will be picked up by animation loop)
            targetScaleRef.current = newScale;
        };

        const handleMouseUp = () => {
            setIsDraggingZoom(false);
            dragStartRef.current = null;
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [isDraggingZoom, minScale, onZoomChange]);

    // -- LOGIC --
    const ampPercentage = Math.round((amplifierLevel ?? 1.0) * 100);

    // Normalized zoom percentage: minScale = 0%, 1.0 = 100%, higher = higher %
    const zoomRange = 1.0 - minScale;
    const normalizedZoomPercent = (isLoading || zoomRange <= 0)
        ? 0
        : Math.round(((scale - minScale) / zoomRange) * 100);

    return (
        <div
            ref={containerRef}
            className={`absolute bottom-4 right-6 pointer-events-auto z-sticky group select-none ${isLoading ? 'opacity-50 pointer-events-none grayscale' : ''}`}
            onDragStart={(e) => e.preventDefault()} // Fix: Prevent "ghost" icon dragging
        >
            {/* Unified Control Pill */}
            <div className="flex items-center bg-bg-secondary/90 backdrop-blur-md border border-border rounded-full px-1.5 py-1 shadow-lg relative">

                {/* --- 1. Amplifier Toggle (Left) --- */}
                <div className="relative flex justify-center group/amp">
                    <button
                        ref={amplifierButtonRef}
                        onClick={() => {
                            if (!isLoading) setIsAmplifierOpen(!isAmplifierOpen);
                        }}
                        className={`p-1.5 rounded-full transition-colors ${isAmplifierOpen ? 'bg-text-secondary text-bg-primary' : 'text-text-tertiary hover:bg-hover-bg hover:text-text-primary'}`}
                        disabled={isLoading}
                    >
                        <Zap size={14} className={isAmplifierOpen ? "fill-current" : ""} />
                    </button>
                    {/* Rich Tooltip for Amplifier - Aligned to Left of Pill (avoiding right clip) */}
                    {!isAmplifierOpen && !isLoading && (
                        <div className="absolute bottom-full right-0 mb-3 opacity-0 group-hover/amp:opacity-100 transition-opacity duration-200 pointer-events-none w-48 z-50">
                            <div className="bg-black/90 backdrop-blur text-white text-[10px] p-2 rounded-lg shadow-xl border border-white/10 leading-relaxed text-left">
                                vertical spread: separates high and low performing videos
                            </div>
                        </div>
                    )}
                </div>

                {/* Amplifier Slider Popover - via Portal */}
                <SliderPopover
                    ref={amplifierSliderRef}
                    isOpen={isAmplifierOpen}
                    anchorRef={amplifierButtonRef}
                    value={ampPercentage}
                    label={`${ampPercentage}%`}
                    onChange={(val) => {
                        const level = val / 100;
                        if (!isNaN(level)) onAmplifierChange(level);
                    }}
                />

                {/* Divider */}
                <div className="w-[1px] h-3 bg-border mx-1" />

                {/* --- 2. Scale Display (Center) - Drag to change --- */}
                <div className="relative flex justify-center group/zoom">
                    <div
                        onMouseDown={!isLoading ? handleZoomDragStart : undefined}
                        className={`text-xs px-2 font-mono tabular-nums min-w-[3.5rem] text-center transition-colors select-none ${isDraggingZoom
                            ? 'text-text-primary cursor-ew-resize'
                            : isLoading
                                ? 'text-text-tertiary cursor-default'
                                : 'text-text-secondary hover:text-text-primary cursor-ew-resize'
                            }`}
                    >
                        {normalizedZoomPercent}%
                    </div>

                    {/* Tooltip for Zoom - shows on hover when not dragging */}
                    {!isDraggingZoom && !isLoading && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover/zoom:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                            <div className="bg-black/90 backdrop-blur text-white text-[10px] px-2 py-1 rounded shadow-xl border border-white/10">
                                drag to zoom
                            </div>
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div className="w-[1px] h-3 bg-border mx-1" />

                {/* --- 3. Reset Button (Right) --- */}
                <div className="relative flex justify-center group/reset">
                    <button
                        onClick={onReset}
                        className="p-1.5 hover:bg-hover-bg rounded-full text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-50"
                        disabled={isLoading}
                    >
                        <RotateCcw size={14} />
                    </button>
                    {/* Tooltip for Reset - Aligned Right */}
                    {!isLoading && (
                        <div className="absolute bottom-full right-0 mb-3 opacity-0 group-hover/reset:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                            <div className="bg-black/90 backdrop-blur text-white text-[10px] px-2 py-1 rounded shadow-xl border border-white/10">
                                reset scale
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
