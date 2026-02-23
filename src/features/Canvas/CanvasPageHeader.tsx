// =============================================================================
// CANVAS: CanvasPageHeader — frozen blur header at top of canvas overlay.
// Contains page tabs (segmented control) for switching between canvas pages.
// Styled like TimelineDateHeader: backdrop-blur + translucent bg.
// =============================================================================

import React from 'react';
import { CanvasPageTabs, type CanvasPage } from './CanvasPageTabs';

interface CanvasPageHeaderProps {
    pages: CanvasPage[];
    activePageId: string;
    onSwitch: (pageId: string) => void;
    onAdd: () => void;
    onRename: (pageId: string, title: string) => void;
    onDelete: (pageId: string) => void;
}

export const CanvasPageHeader: React.FC<CanvasPageHeaderProps> = ({
    pages,
    activePageId,
    onSwitch,
    onAdd,
    onRename,
    onDelete,
}) => (
    <div
        className="absolute top-0 left-0 right-0 z-sticky flex items-center px-4 h-11 border-b border-border"
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
    >
        {/* Blur backdrop */}
        <div className="absolute inset-0 backdrop-blur-md bg-bg-primary/70 pointer-events-none" />

        {/* Content */}
        <div className="relative z-10">
            <CanvasPageTabs
                pages={pages}
                activePageId={activePageId}
                onSwitch={onSwitch}
                onAdd={onAdd}
                onRename={onRename}
                onDelete={onDelete}
            />
        </div>
    </div>
);
