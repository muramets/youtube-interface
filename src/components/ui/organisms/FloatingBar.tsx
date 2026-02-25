import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSmartPosition } from '@/pages/Trends/Timeline/hooks/useSmartPosition';
import { useMusicStore } from '@/core/stores/musicStore';
import { useUIStore } from '@/core/stores/uiStore';

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
    // Match ZoomControls offset: shift up when audio player is visible
    const hasAudioPlayer = !!useMusicStore((s) => s.playingTrackId);

    // Sidebar-aware centering: offset left edge so bar centers in content area
    const isSidebarExpanded = useUIStore(s => s.isSidebarExpanded);
    const sidebarWidth = useUIStore(s => s.sidebarWidth);
    const sidebarOffset = isSidebarExpanded ? sidebarWidth : 72;

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
            left: sidebarOffset,
            right: 0,
            bottom: hasAudioPlayer ? '88px' : '32px',
            margin: '0 auto',
            width: 'fit-content',
            position: dockingStrategy,
            transition: 'bottom 300ms ease, left 300ms ease',
        }
        : {
            left: coords.x,
            top: coords.y,
            position: 'fixed'
        };

    const content = (
        <div
            ref={barRef}
            className={`flex items-center gap-2 bg-bg-secondary/70 backdrop-blur-xl shadow-lg border border-border rounded-full px-4 py-2 z-sticky ${className}`}
            style={style}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key !== 'Escape') {
                    e.stopPropagation();
                }
            }}
        >
            <div className="flex items-center gap-3 pr-3 border-r border-[var(--floating-bar-border)]">
                <span className="text-sm font-medium text-text-primary whitespace-nowrap max-w-[150px] truncate">
                    {title}
                </span>
                <button
                    onClick={onClose}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="text-text-secondary hover:text-text-primary transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex items-center gap-1 pl-2">
                {children({ openAbove: dropdownsOpenAbove })}
            </div>
        </div>
    );

    // Portal to body when docked+fixed so backdrop-blur escapes scroll container
    if (shouldDock && dockingStrategy === 'fixed') {
        return createPortal(content, document.body);
    }

    return content;
};
