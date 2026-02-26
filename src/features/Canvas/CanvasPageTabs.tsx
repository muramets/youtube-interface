// =============================================================================
// CANVAS: CanvasPageTabs — segmented control for switching canvas pages.
// Styled like SegmentedControl with sliding indicator, plus "+" to add pages,
// double-click to rename, right-click for context menu.
// Pattern: rename uses a regular <input> absolutely overlaid on the tab text
// (same as MusicPlaylistItem) — avoids invalid HTML <input> inside <button>.
// =============================================================================

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { CanvasPageMeta } from '../../core/stores/canvas/types';

/** Minimal page shape for the tabs view (subset of CanvasPageMeta) */
export type CanvasPage = Pick<CanvasPageMeta, 'id' | 'title'>;

interface CanvasPageTabsProps {
    pages: CanvasPage[];
    activePageId: string;
    onSwitch: (pageId: string) => void;
    onAdd: () => void;
    onRename: (pageId: string, title: string) => void;
    onDelete: (pageId: string) => void;
}

const TAB_MAX_WIDTH = 160;

export const CanvasPageTabs: React.FC<CanvasPageTabsProps> = ({
    pages,
    activePageId,
    onSwitch,
    onAdd,
    onRename,
    onDelete,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const inputRef = useRef<HTMLInputElement>(null);

    // --- Inline rename ---
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    // --- Context menu ---
    const [contextMenu, setContextMenu] = useState<{
        pageId: string;
        x: number;
        y: number;
    } | null>(null);

    // --- Sliding indicator: DOM-measured ---
    const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

    const updateIndicator = useCallback(() => {
        const tab = tabRefs.current.get(activePageId);
        const container = containerRef.current;
        if (!tab || !container) return;
        const containerRect = container.getBoundingClientRect();
        const tabRect = tab.getBoundingClientRect();
        setIndicatorStyle({
            width: tabRect.width,
            left: tabRect.left - containerRect.left,
        });
    }, [activePageId]);

    useEffect(() => { updateIndicator(); }, [updateIndicator, pages]);

    useEffect(() => {
        window.addEventListener('resize', updateIndicator);
        return () => window.removeEventListener('resize', updateIndicator);
    }, [updateIndicator]);

    // --- Rename ---
    const startEdit = useCallback((page: CanvasPage) => {
        setEditingId(page.id);
        setEditValue(page.title);
    }, []);

    // Focus input when editing starts
    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingId]);

    const commitRename = useCallback(() => {
        if (editingId) {
            const trimmed = editValue.trim();
            if (trimmed) onRename(editingId, trimmed);
        }
        setEditingId(null);
    }, [editingId, editValue, onRename]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
        if (e.key === 'Escape') setEditingId(null);
    }, [commitRename]);

    // --- Context menu ---
    const handleContextMenu = useCallback((e: React.MouseEvent, pageId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ pageId, x: e.clientX, y: e.clientY });
    }, []);

    useEffect(() => {
        if (!contextMenu) return;
        const close = () => setContextMenu(null);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
        // Delay listener registration to avoid catching the same event that opened the menu
        const timerId = setTimeout(() => {
            window.addEventListener('click', close);
            window.addEventListener('contextmenu', close);
            window.addEventListener('keydown', onKey);
        }, 0);
        return () => {
            clearTimeout(timerId);
            window.removeEventListener('click', close);
            window.removeEventListener('contextmenu', close);
            window.removeEventListener('keydown', onKey);
        };
    }, [contextMenu]);

    const canDelete = pages.length > 1;

    return (
        <>
            <div
                ref={containerRef}
                className="relative flex bg-bg-secondary dark:bg-[#1a1a1a] rounded-lg p-0.5"
            >
                {/* Sliding indicator */}
                <div
                    className="absolute top-0.5 bottom-0.5 bg-text-primary dark:bg-gradient-to-r dark:from-[#2d2d2d] dark:to-[#333333] rounded-md shadow-md dark:shadow-sm transition-all duration-200 ease-out"
                    style={{
                        ...indicatorStyle,
                        opacity: indicatorStyle.width ? 1 : 0,
                    }}
                />

                {/* Tab items */}
                {pages.map((page) => {
                    const isEditing = editingId === page.id;
                    const isActive = page.id === activePageId;

                    return (
                        <div
                            key={page.id}
                            ref={(el) => {
                                if (el) tabRefs.current.set(page.id, el);
                                else tabRefs.current.delete(page.id);
                            }}
                            onClick={() => !isEditing && onSwitch(page.id)}
                            onDoubleClick={() => startEdit(page)}
                            onContextMenu={(e) => handleContextMenu(e, page.id)}
                            style={{ maxWidth: TAB_MAX_WIDTH }}
                            className={`
                                relative z-10 flex items-center justify-center
                                py-1.5 px-3 rounded-md text-xs font-medium
                                transition-colors duration-200 cursor-pointer
                                select-none
                                ${isActive
                                    ? 'text-bg-primary dark:text-text-primary'
                                    : 'text-text-tertiary hover:text-text-secondary'
                                }
                            `}
                        >
                            {/* Text — hidden during edit, anchors the width */}
                            <span
                                className={`
                                    overflow-hidden whitespace-nowrap
                                    ${isEditing ? 'opacity-0 pointer-events-none' : ''}
                                `}
                                style={{ textOverflow: 'ellipsis' }}
                            >
                                {isEditing ? (editValue || '\u00A0') : page.title}
                            </span>

                            {/* Input — absolutely overlaid when editing */}
                            {isEditing && (
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => {
                                        setEditValue(e.target.value);
                                        // Update indicator to match growing tab
                                        requestAnimationFrame(updateIndicator);
                                    }}
                                    onBlur={commitRename}
                                    onKeyDown={handleKeyDown}
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute inset-0 w-full h-full text-xs font-medium text-center bg-transparent border-none outline-none text-text-primary px-3"
                                />
                            )}
                        </div>
                    );
                })}

                {/* Add page button */}
                <button
                    onClick={onAdd}
                    className="relative z-10 flex items-center justify-center w-7 h-7 rounded-md
                        text-text-tertiary hover:text-text-secondary hover:bg-white/5
                        transition-colors duration-150 border-none bg-transparent cursor-pointer"
                    title="New page"
                >
                    <Plus size={14} strokeWidth={2} />
                </button>
            </div>

            {/* Context menu — Portal to escape header stacking context */}
            {contextMenu && createPortal(
                <div
                    className="fixed z-overlay-ui py-1 bg-bg-secondary border border-border rounded-lg shadow-xl min-w-[140px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        onClick={() => {
                            const page = pages.find((p) => p.id === contextMenu.pageId);
                            if (page) startEdit(page);
                            setContextMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-hover-bg border-none bg-transparent cursor-pointer text-left"
                    >
                        <Pencil size={12} /> Rename
                    </button>
                    {canDelete && (
                        <button
                            onClick={() => {
                                onDelete(contextMenu.pageId);
                                setContextMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-hover-bg border-none bg-transparent cursor-pointer text-left"
                        >
                            <Trash2 size={12} /> Delete
                        </button>
                    )}
                </div>,
                document.body
            )}
        </>
    );
};
