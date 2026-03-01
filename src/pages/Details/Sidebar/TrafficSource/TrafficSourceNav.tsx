// =============================================================================
// Traffic Source Nav
//
// Sidebar section for Traffic Source snapshots.
// Uses SidebarNavHeader (shared with Suggested Traffic) and styled snapshot
// items with context menu (Rename + Delete). No tooltip on sidebar items.
// =============================================================================

import React, { useCallback, useState, useMemo } from 'react';
import { ChartNoAxesCombined, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { TrafficSourceSnapshot } from '../../../../core/types/trafficSource';
import { SidebarNavHeader } from '../SidebarNavHeader';
import { ConfirmationModal } from '../../../../components/ui/organisms/ConfirmationModal';

interface TrafficSourceNavProps {
    snapshots: TrafficSourceSnapshot[];
    selectedSnapshot: string | null;
    onSnapshotClick: (id: string) => void;
    onDeleteSnapshot?: (id: string) => void;
    onRenameSnapshot?: (id: string, label: string) => void;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    onSelect: () => void;
}

export const TrafficSourceNav = React.memo<TrafficSourceNavProps>(({
    snapshots,
    selectedSnapshot,
    onSnapshotClick,
    onDeleteSnapshot,
    onRenameSnapshot,
    isActive,
    isExpanded,
    onToggle,
    onSelect,
}) => {
    // Rename state
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameText, setRenameText] = useState('');

    // Context menu state
    const [menuState, setMenuState] = useState<{
        snapshotId: string | null;
        position: { x: number; y: number };
    }>({ snapshotId: null, position: { x: 0, y: 0 } });

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const hasContent = snapshots.length > 0;

    // Sort by timestamp ascending (oldest first = timeline order)
    const sorted = useMemo(
        () => [...snapshots].sort((a, b) => a.timestamp - b.timestamp),
        [snapshots]
    );

    // Find globally latest snapshot
    const latestId = useMemo(() => {
        if (snapshots.length === 0) return null;
        return snapshots.reduce((latest, s) => s.timestamp > latest.timestamp ? s : latest, snapshots[0]).id;
    }, [snapshots]);

    // Rename handlers
    const renameInputRef = useCallback((node: HTMLInputElement | null) => {
        if (node && renamingId) {
            node.focus();
            node.select();
        }
    }, [renamingId]);

    const handleRenameSubmit = useCallback(() => {
        if (renamingId && onRenameSnapshot) {
            onRenameSnapshot(renamingId, renameText.trim());
        }
        setRenamingId(null);
    }, [renamingId, renameText, onRenameSnapshot]);

    const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleRenameSubmit();
        if (e.key === 'Escape') setRenamingId(null);
    }, [handleRenameSubmit]);

    // Context menu trigger
    const handleMenuTrigger = useCallback((e: React.MouseEvent, snapshotId: string) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuState({
            snapshotId,
            position: { x: rect.right + 5, y: rect.top },
        });
    }, []);

    const closeMenu = useCallback(() => {
        setMenuState({ snapshotId: null, position: { x: 0, y: 0 } });
    }, []);

    return (
        <div className="flex flex-col">
            {/* Header */}
            <SidebarNavHeader
                icon={<ChartNoAxesCombined size={24} />}
                title="Traffic Sources"
                isActive={isActive}
                isExpanded={isExpanded}
                hasContent={hasContent}
                onClick={() => {
                    onSelect();
                    if (!isExpanded && hasContent) {
                        onToggle();
                    }
                }}
                onToggle={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
            />

            {/* Snapshot list */}
            {isExpanded && hasContent && (
                <div className="flex flex-col gap-1 py-1">
                    {sorted.map(snap => {
                        const isSelected = selectedSnapshot === snap.id;
                        const isLatest = snap.id === latestId;
                        const isMenuOpen = menuState.snapshotId === snap.id;
                        const displayText = snap.label || snap.autoLabel;
                        const isRenaming = renamingId === snap.id;

                        return (
                            <div key={snap.id} className="group/snapshot">
                                <div
                                    onClick={isRenaming ? undefined : () => {
                                        onSelect();
                                        onSnapshotClick(snap.id);
                                    }}
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
                                                ref={renameInputRef}
                                                value={renameText}
                                                onChange={(e) => setRenameText(e.target.value)}
                                                onBlur={handleRenameSubmit}
                                                onKeyDown={handleRenameKeyDown}
                                                onClick={(e) => e.stopPropagation()}
                                                placeholder={snap.autoLabel}
                                                className="w-full bg-transparent border-none outline-none text-xs text-text-primary placeholder:text-white/20 py-0 caret-blue-400"
                                            />
                                        ) : (
                                            <>
                                                <span className="truncate">{displayText}</span>
                                                {isLatest && (
                                                    <span className="ml-1 font-normal opacity-70">(latest)</span>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Menu trigger */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleMenuTrigger(e, snap.id); }}
                                        className={`
                                            p-0.5 rounded-full transition-all flex-shrink-0
                                            ${isMenuOpen
                                                ? 'opacity-100 bg-white/10'
                                                : 'opacity-0 group-hover/snapshot:opacity-100 hover:bg-white/10 text-text-tertiary hover:text-white'
                                            }
                                        `}
                                    >
                                        <MoreVertical size={12} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Context Menu */}
            {menuState.snapshotId !== null && createPortal(
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-[299] cursor-default"
                        onClick={(e) => { e.stopPropagation(); closeMenu(); }}
                    />
                    {/* Menu */}
                    <div
                        className="fixed z-popover bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl animate-fade-in min-w-[140px]"
                        style={{ left: menuState.position.x, top: menuState.position.y }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {onRenameSnapshot && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const snap = snapshots.find(s => s.id === menuState.snapshotId);
                                    if (snap && menuState.snapshotId) {
                                        setRenameText(snap.label || snap.autoLabel);
                                        setRenamingId(menuState.snapshotId);
                                    }
                                    closeMenu();
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                            >
                                <Pencil size={10} />
                                Rename
                            </button>
                        )}
                        {onDeleteSnapshot && menuState.snapshotId === latestId && (
                            <>
                                <div className="border-t border-white/5 my-1" />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteTarget(menuState.snapshotId);
                                        closeMenu();
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
            )}

            {/* Delete Confirmation */}
            <ConfirmationModal
                isOpen={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => {
                    if (deleteTarget && onDeleteSnapshot) {
                        onDeleteSnapshot(deleteTarget);
                    }
                    setDeleteTarget(null);
                }}
                title="Delete Snapshot"
                message="Are you sure you want to delete this snapshot? This action cannot be undone."
                confirmLabel="Delete"
            />
        </div>
    );
});

TrafficSourceNav.displayName = 'TrafficSourceNav';
