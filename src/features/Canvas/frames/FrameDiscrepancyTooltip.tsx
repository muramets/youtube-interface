// =============================================================================
// FrameDiscrepancyTooltip — Long Tail warning badge in snapshot frame title bar.
// Uses the shared PortalTooltip for portal rendering and positioning.
// =============================================================================

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import type { TrafficDiscrepancy } from '../../../core/types/appContext';

interface Props {
    discrepancy: TrafficDiscrepancy;
}

/** Format large numbers compactly: 1200 → "1.2K" */
function compact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

/** Calculate percentage of long tail relative to total */
function pct(longTail: number, total: number): string {
    if (total === 0) return '0%';
    return `${Math.round((longTail / total) * 100)}%`;
}

const DiscrepancyContent: React.FC<{ discrepancy: TrafficDiscrepancy }> = ({ discrepancy }) => {
    const { mode, reportTotal, tableSum, longTail } = discrepancy;
    const isDelta = mode === 'delta';
    return (
        <div className="frame-discrepancy-content">
            <div className="frame-discrepancy-content__title">
                <AlertTriangle size={13} /> {isDelta ? 'Hidden Traffic (vs Previous)' : 'Hidden Traffic'}
            </div>
            <div className="frame-discrepancy-content__row">
                <span className="frame-discrepancy-content__label">{isDelta ? 'Total Change' : 'YouTube Total'}</span>
                <span className="frame-discrepancy-content__value">
                    {compact(reportTotal.impressions)} imp / {compact(reportTotal.views)} views
                </span>
            </div>
            <div className="frame-discrepancy-content__row">
                <span className="frame-discrepancy-content__label">Visible</span>
                <span className="frame-discrepancy-content__value">
                    {compact(tableSum.impressions)} imp / {compact(tableSum.views)} views
                </span>
            </div>
            <div className="frame-discrepancy-content__row frame-discrepancy-content__row--highlight">
                <span className="frame-discrepancy-content__label">Hidden</span>
                <span className="frame-discrepancy-content__value">
                    +{compact(longTail.impressions)} ({pct(longTail.impressions, reportTotal.impressions)})
                    {' / '}
                    +{compact(longTail.views)} ({pct(longTail.views, reportTotal.views)})
                </span>
            </div>
        </div>
    );
};

const FrameDiscrepancyTooltipInner: React.FC<Props> = ({ discrepancy }) => (
    <PortalTooltip
        content={<DiscrepancyContent discrepancy={discrepancy} />}
        align="center"
        side="bottom"
        inline
        triggerClassName="frame-discrepancy-badge"
        maxWidth={300}
    >
        <AlertTriangle size={12} />
    </PortalTooltip>
);

export const FrameDiscrepancyTooltip = React.memo(FrameDiscrepancyTooltipInner);
FrameDiscrepancyTooltip.displayName = 'FrameDiscrepancyTooltip';
