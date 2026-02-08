import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Pencil, CalendarDays } from 'lucide-react';

/**
 * Context menu for snapshot items in the sidebar.
 *
 * BUSINESS RULES:
 * - Rename: available on ALL snapshots (user can label any snapshot for readability)
 * - Set active date: available on ALL snapshots (retrospective YT Studio date tagging)
 * - Delete: ONLY available for the latest snapshot to prevent breaking the delta chain
 *   (deleting a middle snapshot would orphan subsequent deltas)
 */
interface SnapshotContextMenuProps {
    isOpen: boolean;
    onClose: () => void;
    position: { x: number; y: number };
    onDelete?: () => void;
    onRename: () => void;
    onSetActiveDate: () => void;
    /** Only the latest snapshot can be deleted (delta chain integrity) */
    isLatest: boolean;
    canDelete: boolean;
}

export const SnapshotContextMenu: React.FC<SnapshotContextMenuProps> = ({
    isOpen,
    onClose,
    position,
    onDelete,
    onRename,
    onSetActiveDate,
    isLatest,
    canDelete
}) => {
    if (!isOpen) return null;

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[9998] cursor-default"
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
            />

            {/* Menu */}
            <div
                className="fixed z-[9999] bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl animate-fade-in min-w-[160px]"
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
