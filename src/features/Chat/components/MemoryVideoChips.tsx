// =============================================================================
// Shared component: video reference chips for L4 memory display.
// Used by MemoryCheckpoint (in chat) and AiAssistantSettings (in settings).
// =============================================================================

import React from 'react';
import type { MemoryVideoRef } from '../../../core/types/chat/chat';

interface MemoryVideoChipsProps {
    videoRefs: MemoryVideoRef[];
}

const OWNERSHIP_BORDER: Record<string, string> = {
    'own-published': 'var(--accent)',
    'own-draft': 'var(--color-warning, #f59e0b)',
    'competitor': 'var(--text-tertiary)',
};

export const MemoryVideoChips: React.FC<MemoryVideoChipsProps> = React.memo(({ videoRefs }) => {
    if (videoRefs.length === 0) return null;

    return (
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-1.5 scrollbar-thin">
            {videoRefs.map(v => (
                <div
                    key={v.videoId}
                    className="flex items-center gap-1.5 shrink-0 rounded-md px-1.5 py-1 bg-surface-secondary hover:bg-bg-secondary transition-colors"
                    title={v.title}
                >
                    {v.thumbnailUrl ? (
                        <img
                            src={v.thumbnailUrl}
                            alt=""
                            className="w-6 h-4 rounded-sm object-cover"
                            style={{ borderLeft: `2px solid ${OWNERSHIP_BORDER[v.ownership] || OWNERSHIP_BORDER.competitor}` }}
                        />
                    ) : (
                        <div
                            className="w-6 h-4 rounded-sm bg-bg-secondary"
                            style={{ borderLeft: `2px solid ${OWNERSHIP_BORDER[v.ownership] || OWNERSHIP_BORDER.competitor}` }}
                        />
                    )}
                    <span className="text-[11px] text-text-secondary truncate max-w-[140px]">
                        {v.title}
                    </span>
                </div>
            ))}
        </div>
    );
});
MemoryVideoChips.displayName = 'MemoryVideoChips';
