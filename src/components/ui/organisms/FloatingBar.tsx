import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useSmartPosition } from '@/pages/Trends/Timeline/hooks/useSmartPosition';

interface FloatingBarProps {
    title: string;
    position: { x: number; y: number };
    onClose: () => void;
    isDocked?: boolean;
    dockingStrategy?: 'absolute' | 'fixed' | 'sticky';
    children: (props: { openAbove: boolean }) => React.ReactNode;
    className?: string;
}

export const FloatingBar: React.FC<FloatingBarProps> = ({
    title,
    position,
    onClose,
    isDocked = false,
    dockingStrategy = 'absolute',
    children,
    className = ''
}) => {
    const barRef = useRef<HTMLDivElement>(null);

    // Smart Positioning
    const { coords } = useSmartPosition({
        targetPos: position,
        elementRef: barRef,
        width: 300,
        offsetY: 60
    });

    const shouldDock = isDocked;
    const dropdownsOpenAbove = shouldDock ? true : coords.y > window.innerHeight / 2;

    const style: React.CSSProperties = shouldDock
        ? {
            left: 0,
            right: 0,
            bottom: '24px',
            margin: '0 auto',
            width: 'fit-content',
            position: dockingStrategy
        }
        : {
            left: coords.x,
            top: coords.y,
            position: 'fixed'
        };

    return (
        <div
            ref={barRef}
            className={`flex items-center gap-2 bg-bg-secondary/90 backdrop-blur-md border border-border shadow-lg rounded-full px-4 py-2 z-[1000] ${className}`}
            style={style}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-3 pr-3 border-r border-white/10">
                <span className="text-sm font-medium text-white whitespace-nowrap max-w-[150px] truncate">
                    {title}
                </span>
                <button
                    onClick={onClose}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="text-text-secondary hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex items-center gap-1 pl-2">
                {children({ openAbove: dropdownsOpenAbove })}
            </div>
        </div>
    );
};
