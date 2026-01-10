import React from 'react';
import { MoreVertical } from 'lucide-react';
import { PortalTooltip } from '../../../../../components/Shared/PortalTooltip';

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
    menuOpenSnapshotId
}) => {
    return (
        <PortalTooltip
            content={tooltip}
            variant="glass"
            side="right"
            align="center"
            triggerClassName="w-full !block group/snapshot"
        >
            <div
                onClick={onClick}
                className={`
                    ml-9 mr-3 pl-8 pr-1.5 py-2 text-xs cursor-pointer
                    transition-colors rounded-lg flex items-center justify-between
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

                {/* MoreVertical Icon - Only for latest snapshot (LIFO policy) */}
                {isLatest && canDelete && onMenuTrigger && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onMenuTrigger(e, id);
                        }}
                        className={`
                            p-0.5 rounded-full transition-all flex-shrink-0
                            ${menuOpenSnapshotId === id
                                ? 'opacity-100 bg-white/10'
                                : 'opacity-0 group-hover/snapshot:opacity-100 hover:bg-white/10'
                            }
                        `}
                    >
                        <MoreVertical size={12} />
                    </button>
                )}
            </div>
        </PortalTooltip>
    );
};
