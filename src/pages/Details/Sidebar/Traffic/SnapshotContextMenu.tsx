import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Pencil, CalendarDays, ArrowRightLeft } from 'lucide-react';

/**
 * Context menu for snapshot items in the sidebar.
 *
 * BUSINESS RULES:
 * - Rename: available on ALL snapshots (user can label any snapshot for readability)
 * - Set active date: available on ALL snapshots (retrospective YT Studio date tagging)
 * - Move to version: available on ALL snapshots (reassign to different packaging version)
 * - Delete: ONLY available for the latest snapshot to prevent breaking the delta chain
 */
interface SnapshotContextMenuProps {
    isOpen: boolean;
    onClose: () => void;
    position: { x: number; y: number };
    onDelete?: () => void;
    onRename: () => void;
    onSetActiveDate: () => void;
    onMoveToVersion?: (version: number) => void;
    /** Only the latest snapshot can be deleted (delta chain integrity) */
    isLatest: boolean;
    canDelete: boolean;
    /** Available packaging versions for reassignment */
    availableVersions: number[];
    /** Current version of the snapshot */
    currentVersion: number;
}

export const SnapshotContextMenu: React.FC<SnapshotContextMenuProps> = ({
    isOpen,
    onClose,
    position,
    onDelete,
    onRename,
    onSetActiveDate,
    onMoveToVersion,
    isLatest,
    canDelete,
    availableVersions,
    currentVersion
}) => {
    const [showVersionSubmenu, setShowVersionSubmenu] = useState(false);
    const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSubmenuTimer = useCallback(() => {
        if (submenuTimerRef.current) {
            clearTimeout(submenuTimerRef.current);
            submenuTimerRef.current = null;
        }
    }, []);

    const startSubmenuCloseTimer = useCallback(() => {
        clearSubmenuTimer();
        submenuTimerRef.current = setTimeout(() => {
            setShowVersionSubmenu(false);
        }, 150);
    }, [clearSubmenuTimer]);

    // Reset submenu state when context menu closes
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!isOpen) {
            setShowVersionSubmenu(false);
        }
    }, [isOpen]);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!isOpen) return null;

    // Sort versions descending for display
    const sortedVersions = [...availableVersions].sort((a, b) => b - a);

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[299] cursor-default"
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
            />

            {/* Menu */}
            <div
                className="fixed z-popover bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl animate-fade-in min-w-[160px]"
                style={{
                    left: position.x,
                    top: position.y
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRename();
                        onClose();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                >
                    <Pencil size={10} />
                    Rename
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onSetActiveDate();
                        onClose();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                >
                    <CalendarDays size={10} />
                    Set active date
                </button>

                {/* Move to Version — hover submenu */}
                {onMoveToVersion && sortedVersions.length > 1 && (
                    <div
                        className="relative"
                        onMouseEnter={() => { clearSubmenuTimer(); setShowVersionSubmenu(true); }}
                        onMouseLeave={startSubmenuCloseTimer}
                    >
                        <button
                            className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                        >
                            <ArrowRightLeft size={10} />
                            <span className="flex-1">Move to version</span>
                            <span className="text-text-tertiary">›</span>
                        </button>

                        {/* Submenu */}
                        {showVersionSubmenu && (
                            <div
                                className="absolute left-full top-0 bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl min-w-[100px] animate-fade-in"
                                onMouseEnter={clearSubmenuTimer}
                                onMouseLeave={startSubmenuCloseTimer}
                            >
                                {sortedVersions.map(v => (
                                    <button
                                        key={v}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (v !== currentVersion) {
                                                onMoveToVersion(v);
                                            }
                                            onClose();
                                        }}
                                        disabled={v === currentVersion}
                                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${v === currentVersion
                                                ? 'text-indigo-400 cursor-default'
                                                : 'text-text-secondary hover:text-white hover:bg-white/5 cursor-pointer'
                                            }`}
                                    >
                                        v.{v}
                                        {v === currentVersion && (
                                            <span className="text-[10px] text-text-tertiary ml-1">current</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {isLatest && canDelete && onDelete && (
                    <>
                        <div className="border-t border-white/5 my-1" />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                                onClose();
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2"
                        >
                            <Trash2 size={10} />
                            Remove
                        </button>
                    </>
                )}
            </div>
        </>,
        document.body
    );
};
