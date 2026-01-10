import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Badge } from '../../../../components/ui/atoms/Badge';
import { PortalTooltip } from '../../../../components/Shared/PortalTooltip';

/**
 * BUSINESS LOGIC: Version Item States
 * 
 * - isViewing: This version is currently displayed in the form (user clicked it)
 * - isVideoActive: This version is the "source of truth" for the video
 * 
 * Example: User views v.1 while v.2 is active → isViewing=true for v.1, isVideoActive=true for v.2
 * The "Active" badge shows which version the video is actually using.
 */
interface SidebarVersionItemProps {
    label: string;
    isViewing: boolean;
    isVideoActive: boolean;
    onClick: () => void;
    onDelete?: () => void;
    isParentOfSelected?: boolean;
    isDeleted?: boolean;
    restorationIndex?: number; // If set, displays "Restored {n}" badge
    tooltip?: string | React.ReactNode;
}

export const SidebarVersionItem: React.FC<SidebarVersionItemProps> = ({
    label,
    isViewing,
    isVideoActive,
    onClick,
    onDelete,
    isParentOfSelected = false,
    isDeleted = false,
    restorationIndex,
    tooltip,
}) => {
    // Track if user is hovering over a badge to block nav item tooltip
    const [isBadgeHovered, setIsBadgeHovered] = useState(false);

    const content = (
        <div
            onClick={onClick}
            className={`
                group flex items-center justify-between pl-11 pr-[18px] py-1.5 cursor-pointer
                transition-colors rounded-lg ml-6 mr-3
                ${isViewing
                    ? 'text-text-primary font-medium bg-sidebar-active'
                    : isParentOfSelected
                        ? 'text-text-primary font-normal'
                        : 'text-text-secondary hover:text-text-primary hover:bg-sidebar-hover font-normal'
                }
            `}
            style={isParentOfSelected && !isViewing ? { backgroundColor: 'var(--sidebar-active)' } : {}}
        >
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                {/* Version Label: min-width prevents jitter for v.1-v.9, grows for v.10+ */}
                <div className="flex-shrink-0">
                    <span className="text-sm block">{label}</span>
                </div>

                {/* RESTORED badge */}
                {restorationIndex !== undefined && (
                    <div
                        className="inline-flex items-center flex-shrink min-w-0"
                        onPointerEnter={() => setIsBadgeHovered(true)}
                        onPointerLeave={() => setIsBadgeHovered(false)}
                    >
                        <Badge
                            variant="warning"
                            className="px-1.5"
                            truncate
                            maxWidth="160px"
                        >
                            {restorationIndex === 1 ? 'Restored' : `Restored ${restorationIndex}`}
                        </Badge>
                    </div>
                )}

                {/* DELETED badge */}
                {isDeleted && (
                    <div className="inline-flex items-center flex-shrink-0">
                        <Badge variant="error" className="px-1.5">Deleted</Badge>
                    </div>
                )}

                {/* ACTIVE badge */}
                <div className={`inline-flex items-center transition-opacity duration-200 flex-shrink-0 ${isVideoActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <Badge variant="success" className="px-1.5">Active</Badge>
                </div>
            </div>

            {/* Delete button - always present, show on hover via opacity */}
            {onDelete && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="p-1 text-text-secondary hover:text-red-500 rounded transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                    title="Delete version"
                >
                    <Trash2 size={12} />
                </button>
            )}
        </div>
    );

    // Show nav item tooltip only if there's a tooltip AND user is NOT hovering over a badge
    if (tooltip) {
        return (
            <PortalTooltip
                content={tooltip}
                variant="glass"
                side="top"
                align="center"
                triggerClassName="w-full !block"
                enterDelay={1000}
                forceOpen={isBadgeHovered ? false : undefined}
            >
                {content}
            </PortalTooltip>
        );
    }

    return content;
};
