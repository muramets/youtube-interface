import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MoreVertical, ChevronRight, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';
import { DateRangePicker } from '../../../../../components/ui/molecules/DateRangePicker';
import type { TrafficGroup } from '../../../../../core/types/traffic';
import { TrafficSidebarNicheList } from './TrafficSidebarNicheList';

/**
 * A single snapshot row in the sidebar navigation.
 *
 * DISPLAY PRIORITY (computed by parent via formatSnapshotDate):
 *   1. Custom label (e.g. "Before title change")
 *   2. Active date range (e.g. "Jan 5 – 12")
 *   3. Upload timestamp fallback (e.g. "Feb 8")
 *
 * INLINE RENAME FLOW:
 *   Context menu → "Rename" → input replaces display text → Enter/Blur saves → Esc cancels
 *   Uses callback ref pattern to focus+select on mount (React Compiler compatible)
 *
 * ACTIVE DATE POPOVER:
 *   Context menu → "Set active date" → DateRangePicker portal positioned next to item
 */
interface SidebarSnapshotItemProps {
    id: string;
    /** Pre-formatted display text (label > activeDate > timestamp) */
    displayDate: string;
    /** Full metadata tooltip (shows all available info combined with • separator) */
    tooltip: string;
    isSelected: boolean;
    isLatest: boolean;
    canDelete?: boolean;
    onClick: () => void;
    onMenuTrigger?: (e: React.MouseEvent, snapshotId: string) => void;
    menuOpenSnapshotId: string | null;
    nicheImpressions?: Record<string, number>;
    metricType?: 'impressions' | 'views';
    groups?: TrafficGroup[];
    onNicheClick?: (nicheId: string) => void;
    activeNicheId?: string | null;
    // Snapshot metadata (for inline editing)
    label?: string;
    activeDate?: { start: number; end: number };
    onRename?: (snapshotId: string, label: string) => void;
    onSetActiveDate?: (snapshotId: string, activeDate: { start: number; end: number } | null) => void;
    // Editing modes (controlled by TrafficNav parent)
    isRenaming?: boolean;
    isSettingActiveDate?: boolean;
    onStartRename?: () => void;
    onStopRename?: () => void;
    onStopSettingActiveDate?: () => void;
}

export const SidebarSnapshotItem: React.FC<SidebarSnapshotItemProps> = ({
    id,
    displayDate,
    tooltip,
    isSelected,
    isLatest,
    onClick,
    onMenuTrigger,
    menuOpenSnapshotId,
    nicheImpressions,
    metricType = 'impressions',
    groups,
    onNicheClick,
    activeNicheId,
    label,
    activeDate,
    onRename,
    onSetActiveDate,
    isRenaming,
    isSettingActiveDate,
    onStopRename,
    onStopSettingActiveDate
}) => {
    const hasNiches = groups && groups.length > 0 && nicheImpressions && Object.keys(nicheImpressions).length > 0;
    const [isButtonHovered, setIsButtonHovered] = useState(false);
    const isMenuOpen = menuOpenSnapshotId === id;

    // Inline rename state
    const [renameText, setRenameText] = useState(label || '');
    const renameInputRef = useRef<HTMLInputElement>(null);

    // Active date popover anchor
    const activeDateAnchorRef = useRef<HTMLDivElement>(null);
    const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);

    // Focus rename input when entering rename mode
    // Use ref callback pattern to init + focus when input mounts
    const renameInputCallbackRef = useCallback((node: HTMLInputElement | null) => {
        if (node && isRenaming) {
            // Assign to ref for later use
            (renameInputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
            // Reset text to current label when input mounts
            setRenameText(label || '');
            node.focus();
            node.select();
        }
    }, [isRenaming, label]);

    // Calculate popover position when entering active date mode
    useEffect(() => {
        if (isSettingActiveDate && activeDateAnchorRef.current) {
            const rect = activeDateAnchorRef.current.getBoundingClientRect();
            setPopoverPosition({
                x: rect.right + 8,
                y: Math.max(8, rect.top - 100) // Offset to center roughly
            });
        } else {
            setPopoverPosition(null);
        }
    }, [isSettingActiveDate]);

    const handleRenameSubmit = () => {
        const trimmed = renameText.trim();
        if (onRename) {
            onRename(id, trimmed); // Empty string = remove label
        }
        onStopRename?.();
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRenameSubmit();
        } else if (e.key === 'Escape') {
            onStopRename?.();
        }
    };

    const handleActiveDateApply = (start: number, end: number) => {
        if (onSetActiveDate) {
            onSetActiveDate(id, { start, end });
        }
        onStopSettingActiveDate?.();
    };

    const handleActiveDateRemove = () => {
        if (onSetActiveDate) {
            onSetActiveDate(id, null);
        }
        onStopSettingActiveDate?.();
    };

    return (
        <React.Fragment>
            <div ref={activeDateAnchorRef}>
                <PortalTooltip
                    content={tooltip}
                    variant="glass"
                    side="right"
                    align="center"
                    triggerClassName="w-full !block group/snapshot"
                    disabled={isMenuOpen || isButtonHovered || !!isRenaming || !!isSettingActiveDate}
                >
                    <div
                        onClick={isRenaming ? undefined : onClick}
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
                            {isRenaming ? (
                                <input
                                    ref={renameInputCallbackRef}
                                    value={renameText}
                                    onChange={(e) => setRenameText(e.target.value)}
                                    onBlur={handleRenameSubmit}
                                    onKeyDown={handleRenameKeyDown}
                                    onClick={(e) => e.stopPropagation()}
                                    placeholder={displayDate}
                                    className="w-full bg-transparent border-none outline-none text-xs text-text-primary placeholder:text-white/20 py-0 caret-blue-400"
                                />
                            ) : (
                                <>
                                    {displayDate}
                                    {isLatest && (
                                        <span className="ml-1 font-normal opacity-70">(latest)</span>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                            {/* More Menu - Available on ALL snapshots */}
                            {onMenuTrigger && (
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

                            {/* Expand Chevron */}
                            <div className={`
                                text-text-tertiary transition-opacity duration-200
                                ${isSelected ? 'opacity-100' : 'opacity-0 group-hover/snapshot:opacity-100'}
                            `}>
                                {isSelected ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </div>
                        </div>
                    </div>
                </PortalTooltip>
            </div>

            {/* Active Date Picker Popover */}
            {isSettingActiveDate && popoverPosition && createPortal(
                <>
                    <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => onStopSettingActiveDate?.()}
                    />
                    <div
                        className="fixed z-[9999] rounded-xl overflow-hidden shadow-2xl border border-white/10"
                        style={{ left: popoverPosition.x, top: popoverPosition.y }}
                    >
                        <DateRangePicker
                            initialStartDate={activeDate?.start}
                            initialEndDate={activeDate?.end}
                            onApply={handleActiveDateApply}
                            onClose={() => onStopSettingActiveDate?.()}
                            onRemove={activeDate ? handleActiveDateRemove : undefined}
                        />
                    </div>
                </>,
                document.body
            )}

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
