// =============================================================================
// SnapGuides — Renders alignment guide lines during drag operations
// =============================================================================
// Subscribes to guidesRef from useSnapGuides via the subscribe callback.
// Lines are ephemeral: only visible while dragging, cleared on drag end.
// =============================================================================

import React, { useSyncExternalStore } from 'react';
import type { GuideLine, SnapGuideState } from '../utils/snapEngine';

interface SnapGuidesProps {
    guidesRef: React.RefObject<SnapGuideState>;
    subscribe: (listener: () => void) => () => void;
}

const SnapGuidesInner: React.FC<SnapGuidesProps> = ({ guidesRef, subscribe }) => {
    const { guides } = useSyncExternalStore(
        subscribe,
        () => guidesRef.current!,
    );

    if (guides.length === 0) return null;

    return (
        <>
            {guides.map((guide: GuideLine, i: number) => (
                <div
                    key={`${guide.axis}-${i}`}
                    style={{
                        position: 'absolute',
                        ...(guide.axis === 'x'
                            ? {
                                left: guide.value,
                                top: guide.from,
                                width: 0,
                                height: guide.to - guide.from,
                                borderLeft: '1px dashed var(--accent, #6366f1)',
                            }
                            : {
                                left: guide.from,
                                top: guide.value,
                                width: guide.to - guide.from,
                                height: 0,
                                borderTop: '1px dashed var(--accent, #6366f1)',
                            }),
                        pointerEvents: 'none',
                        zIndex: 9999,
                        opacity: 0.7,
                    }}
                />
            ))}
        </>
    );
};

export const SnapGuides = React.memo(SnapGuidesInner);
SnapGuides.displayName = 'SnapGuides';
