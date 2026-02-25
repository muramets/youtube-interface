// =============================================================================
// CanvasPageSelector — Dropdown for choosing which canvas page to add to.
// Follows FloatingDropdownPortal + PortalTooltip pattern from TrafficPlaylistSelector.
// Single page → immediate action (no dropdown). 2+ pages → dropdown with page list.
// =============================================================================

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { LayoutGrid, Plus, Check } from 'lucide-react';
import { FloatingDropdownPortal } from '../../../components/ui/atoms/FloatingDropdownPortal';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { useCanvasStore, canvasPageDocPath } from '../../../core/stores/canvas/canvasStore';
import { useShallow } from 'zustand/react/shallow';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { getVideoId } from '../../../core/types/canvas';
import type { CanvasNode } from '../../../core/types/canvas';

interface CanvasPageSelectorProps {
    /** Whether the dropdown is open (controlled by parent floating bar's activeMenu) */
    isOpen: boolean;
    /** Dropdown direction — matches FloatingBar openAbove */
    openAbove: boolean;
    /** Toggle dropdown visibility */
    onToggle: () => void;
    /** Called when user selects a page (or creates one). Parent should add nodes to this pageId. */
    onSelectPage: (pageId: string, pageTitle: string) => void;
    /** Override default icon button class (default: text-text-secondary) */
    buttonClassName?: string;
    /** Video IDs being added — used to show ✓ on pages that already contain them */
    selectedVideoIds?: string[];
}

export const CanvasPageSelector: React.FC<CanvasPageSelectorProps> = ({
    isOpen,
    openAbove,
    onToggle,
    onSelectPage,
    buttonClassName = 'text-text-secondary hover:text-white hover:bg-white/10',
    selectedVideoIds = [],
}) => {
    const { pages, activePageId, addPage, subscribeMeta, nodes, userId, channelId } = useCanvasStore(
        useShallow((s) => ({
            pages: s.pages,
            activePageId: s.activePageId,
            addPage: s.addPage,
            subscribeMeta: s.subscribeMeta,
            nodes: s.nodes,
            userId: s.userId,
            channelId: s.channelId,
        }))
    );

    // Lazy-load canvas meta if pages haven't been fetched yet
    // (subscribeMeta is normally called when canvas panel opens)
    useEffect(() => {
        if (pages.length === 0) {
            const unsub = subscribeMeta();
            return unsub;
        }
    }, [pages.length, subscribeMeta]);

    const [newPageName, setNewPageName] = useState('');
    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

    // Per-page video ID sets for presence check (pageId → Set<videoId>)
    const [pageVideoIds, setPageVideoIds] = useState<Record<string, Set<string>>>({});

    // Build active page video IDs from in-memory nodes
    const activePageVideoIds = useMemo(() => {
        const ids = new Set<string>();
        for (const node of nodes) {
            const vid = getVideoId(node.data);
            if (vid) ids.add(vid);
        }
        return ids;
    }, [nodes]);

    // Fetch non-active page nodes when dropdown opens
    useEffect(() => {
        if (!isOpen || !userId || !channelId || selectedVideoIds.length === 0) return;

        const nonActivePages = pages.filter(p => p.id !== activePageId);
        if (nonActivePages.length === 0) return;

        let cancelled = false;

        const fetchPageNodes = async () => {
            const result: Record<string, Set<string>> = {};

            await Promise.all(nonActivePages.map(async (page) => {
                const ref = doc(db, canvasPageDocPath(userId, channelId, page.id));
                const snap = await getDoc(ref);
                if (snap.exists() && !cancelled) {
                    const pageNodes = (snap.data().nodes ?? []) as CanvasNode[];
                    const ids = new Set<string>();
                    for (const node of pageNodes) {
                        const vid = getVideoId(node.data);
                        if (vid) ids.add(vid);
                    }
                    result[page.id] = ids;
                }
            }));

            if (!cancelled) setPageVideoIds(result);
        };

        fetchPageNodes();
        return () => { cancelled = true; };
    }, [isOpen, pages, activePageId, userId, channelId, selectedVideoIds.length]);

    // Check if any selected video is already on a page
    const isOnPage = useCallback((pageId: string): boolean => {
        if (selectedVideoIds.length === 0) return false;

        const videoIdsOnPage = pageId === activePageId
            ? activePageVideoIds
            : pageVideoIds[pageId];

        if (!videoIdsOnPage) return false;
        return selectedVideoIds.some(id => videoIdsOnPage.has(id));
    }, [selectedVideoIds, activePageId, activePageVideoIds, pageVideoIds]);

    // Auto-focus input when opening
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            setAnchorRect(buttonRef.current.getBoundingClientRect());
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            setAnchorRect(null);
        }
    }, [isOpen]);

    // Sort pages by order
    const sortedPages = useMemo(() =>
        [...pages].sort((a, b) => a.order - b.order),
        [pages]
    );

    const handleSelectPage = (pageId: string, pageTitle: string) => {
        onSelectPage(pageId, pageTitle);
        onToggle();
    };

    const handleCreatePage = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newPageName.trim();
        if (!trimmed) return;

        addPage(trimmed);

        // addPage + switchPage update state synchronously — read new ID immediately
        const newId = useCanvasStore.getState().activePageId;
        if (newId) {
            onSelectPage(newId, trimmed);
        }
        onToggle();
        setNewPageName('');
    };

    // Single-page shortcut: if only 1 page, clicking the button adds directly
    const handleButtonClick = () => {
        if (pages.length <= 1 && activePageId) {
            const page = pages.find(p => p.id === activePageId);
            onSelectPage(activePageId, page?.title || 'Canvas');
            return;
        }
        onToggle();
    };

    return (
        <div className="relative">
            <PortalTooltip
                content={<span className="text-xs">Add to Canvas</span>}
                side="top"
                align="center"
                variant="glass"
                enterDelay={400}
            >
                <button
                    ref={buttonRef}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleButtonClick}
                    className={`p-1.5 rounded-full transition-colors duration-150 ${isOpen ? 'bg-white text-black' : buttonClassName
                        }`}
                >
                    <LayoutGrid size={16} />
                </button>
            </PortalTooltip>

            <FloatingDropdownPortal
                isOpen={isOpen}
                anchorRect={anchorRect}
                openAbove={openAbove}
                width={220}
            >
                <div data-portal-wrapper className="flex flex-col h-full min-h-0">
                    {/* Page List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1 flex flex-col">
                        {sortedPages.map((page) => {
                            const isActive = page.id === activePageId;
                            const hasVideo = isOnPage(page.id);

                            return (
                                <button
                                    key={page.id}
                                    onClick={() => handleSelectPage(page.id, page.title)}
                                    className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors justify-between shrink-0 ${isActive ? 'text-white' : 'text-text-secondary hover:text-white'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <div
                                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-green-400' : 'bg-white/25'
                                                }`}
                                        />
                                        <span className="truncate">{page.title}</span>
                                    </div>
                                    {hasVideo && <Check size={12} className="text-text-tertiary flex-shrink-0" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Create New Page Input */}
                    <div className="p-2 border-t border-white/10 bg-white/5 shrink-0 z-10">
                        <form onSubmit={handleCreatePage} className="relative">
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="New page..."
                                className="w-full bg-bg-primary text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-text-secondary"
                                value={newPageName}
                                onChange={(e) => setNewPageName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        e.preventDefault();
                                        onToggle();
                                    }
                                    e.stopPropagation();
                                }}
                            />
                            <button
                                type="submit"
                                className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 text-text-secondary hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={!newPageName.trim()}
                                title="Create page"
                            >
                                <Plus size={14} />
                            </button>
                        </form>
                    </div>
                </div>
            </FloatingDropdownPortal>
        </div>
    );
};
