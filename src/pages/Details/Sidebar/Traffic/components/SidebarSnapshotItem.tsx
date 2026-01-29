import React from 'react';
import { MoreVertical, ChevronRight, ChevronDown } from 'lucide-react';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';
import type { TrafficGroup } from '../../../../../core/types/traffic';
import { TrafficSidebarNicheList } from './TrafficSidebarNicheList';

interface SidebarSnapshotItemProps {
    id: string;
    displayDate: string;
    tooltip: string;
    isSelected: boolean;
    isLatest: boolean;
    canDelete?: boolean;
    onClick: () => void;
    onMenuTrigger?: (e: React.MouseEvent, snapshotId: string) => void;
    menuOpenSnapshotId: string | null;
    // New props for niches
    nicheImpressions?: Record<string, number>;
    metricType?: 'impressions' | 'views'; // Added to support fallback logic label
    groups?: TrafficGroup[];
    onNicheClick?: (nicheId: string) => void;
    activeNicheId?: string | null;
}

export const SidebarSnapshotItem: React.FC<SidebarSnapshotItemProps> = ({
    id,
    displayDate,
    tooltip,
    isSelected,
    isLatest,
    canDelete,
    onClick,
    onMenuTrigger,
    menuOpenSnapshotId,
    nicheImpressions,
    metricType = 'impressions',
    groups,
    onNicheClick,
    activeNicheId
}) => {
    // We treat "Selected" as "Expanded" for the niche list
    const hasNiches = groups && groups.length > 0 && nicheImpressions && Object.keys(nicheImpressions).length > 0;

    // Track if mouse is over the "More" button to prevent tooltip
    const [isButtonHovered, setIsButtonHovered] = React.useState(false);
    const isMenuOpen = menuOpenSnapshotId === id;

    return (
        <React.Fragment>
            <PortalTooltip
                content={tooltip}
                variant="glass"
                side="right"
                align="center"
                triggerClassName="w-full !block group/snapshot"
                disabled={isMenuOpen || isButtonHovered}
            >
                <div
                    onClick={onClick}
                    className={`
                        ml-9 mr-3 pl-3 pr-1.5 py-2 text-xs cursor-pointer
                        transition-colors rounded-lg flex items-center justify-between
                        select-none
                        ${isSelected
                            ? 'text-text-primary font-medium bg-sidebar-active'
                            : 'text-text-tertiary hover:text-text-secondary hover:bg-sidebar-hover font-normal'
                        }
                    `}
                >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                        {displayDate}
                        {isLatest && (
                            <span className="ml-1 font-normal opacity-70">(latest)</span>
                        )}
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                        {/* More Menu - Only for latest snapshot (LIFO policy) */}
                        {isLatest && canDelete && onMenuTrigger && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onMenuTrigger(e, id);
                                }}
                                onMouseEnter={() => setIsButtonHovered(true)}
                                onMouseLeave={() => setIsButtonHovered(false)}
                                className={`
                                    p-0.5 rounded-full transition-all flex-shrink-0
                                    ${menuOpenSnapshotId === id
                                        ? 'opacity-100 bg-white/10'
                                        : 'opacity-0 group-hover/snapshot:opacity-100 hover:bg-white/10 text-text-tertiary hover:text-white'
                                    }
                                `}
                            >
                                <MoreVertical size={12} />
                            </button>
                        )}

                        {/* Expand Chevron (Always visible if selected or on hover, improves affordance) */}
                        <div className={`
                            text-text-tertiary transition-opacity duration-200
                            ${isSelected ? 'opacity-100' : 'opacity-0 group-hover/snapshot:opacity-100'}
                        `}>
                            {isSelected ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </div>
                    </div>
                </div>
            </PortalTooltip>

            {/* Render Niches if this snapshot is selected */}
            {/* Render Niches if this snapshot is selected */}
            {isSelected && hasNiches && nicheImpressions && groups && (
                <div className="ml-8 pr-3 mt-1 mb-1 animate-in slide-in-from-left-2 duration-200">
                    <TrafficSidebarNicheList
                        nicheImpressions={nicheImpressions}
                        groups={groups}
                        onNicheClick={onNicheClick}
                        activeNicheId={activeNicheId}
                        metricType={metricType}
                    />
                </div>
            )}
        </React.Fragment>
    );
};
