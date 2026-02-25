// =============================================================================
// CHAT: SelectionToolbar — floating "📌 Save" pill on text selection.
// Appears when user selects text inside a model-role chat bubble.
// Cmd+select accumulates multiple selections with persistent visual highlights
// via the CSS Highlight API (non-destructive, no DOM mutations).
// Opens SaveTargetPopover to choose destination (video note or canvas sticky).
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Pin } from 'lucide-react';
import TurndownService from 'turndown';
import { SaveTargetPopover } from './SaveTargetPopover';
import type { SaveTarget } from './SaveTargetPopover';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { computeNextNotePosition } from '../../Canvas/utils/notePlacement';
import { useVideos } from '../../../core/hooks/useVideos';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { Toast } from '../../../components/ui/molecules/Toast';
import type { ChatMessage } from '../../../core/types/chat';
import type { SuggestedTrafficContext } from '../../../core/types/appContext';
import type { VideoNote } from '../../../core/utils/youtubeApi';

interface SelectionToolbarProps {
    messages: ChatMessage[];
    /** Ref to the scrollable chat container (for scroll-hide behavior) */
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

function isInsideModelBubble(node: Node): boolean {
    let el: Element | null = node instanceof Element ? node : node.parentElement;
    while (el) {
        if (el.hasAttribute('data-message-role') && el.getAttribute('data-message-role') === 'model') {
            return true;
        }
        el = el.parentElement;
    }
    return false;
}

function getMessageId(node: Node): string | null {
    let el: Element | null = node instanceof Element ? node : node.parentElement;
    while (el) {
        if (el.hasAttribute('data-message-id')) {
            return el.getAttribute('data-message-id');
        }
        el = el.parentElement;
    }
    return null;
}

interface Snippet {
    text: string;
    messageId: string;
    range: Range; // Cloned live range for CSS Highlight API
}

interface PillPosition {
    top: number;
    bottom: number;
    left: number;
}

/** Pill height estimate (py-1.5*2 + text + icon ≈ 28px) + gap */
const PILL_HEIGHT = 28;
const PILL_GAP = 8;

/** Computed pill position — used for both pill button and popover anchor */
interface PillAnchor {
    top: number;
    left: number;
    transform: string;
}

// --- CSS Highlight API helpers ---
const HIGHLIGHT_NAME = 'chat-save-selection';

/** Whether the browser supports the CSS Highlight API */
const supportsHighlightAPI = typeof globalThis !== 'undefined' && 'Highlight' in globalThis && CSS?.highlights != null;

/** Sync the CSS Highlight registry with our stored ranges */
function syncHighlights(ranges: Range[]) {
    if (!supportsHighlightAPI) return;
    if (ranges.length === 0) {
        CSS.highlights!.delete(HIGHLIGHT_NAME);
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const HighlightCtor = (globalThis as any).Highlight;
    CSS.highlights!.set(HIGHLIGHT_NAME, new HighlightCtor(...ranges));
}

/** Turndown instance for converting selected HTML → markdown */
const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
});

/** Extract markdown from a Selection range (preserves formatting) */
function selectionToMarkdown(range: Range): string {
    const fragment = range.cloneContents();
    const div = document.createElement('div');
    div.appendChild(fragment);
    return turndown.turndown(div.innerHTML).trim();
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({ messages, scrollContainerRef }) => {
    const { user } = useAuth();
    const currentChannel = useChannelStore((s) => s.currentChannel);
    const { updateVideo, videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const navigate = useNavigate();

    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [pillPos, setPillPos] = useState<PillPosition | null>(null);
    const [showPopover, setShowPopover] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; videoId?: string } | null>(null);
    const suppressNextMouseUp = useRef(false);
    const lastMetaKeyRef = useRef(false);

    const canvasPages = useCanvasStore((s) => s.pages);
    const addNodeAt = useCanvasStore((s) => s.addNodeAt);
    const canvasNodes = useCanvasStore((s) => s.nodes);
    const canvasNodeSizes = useCanvasStore((s) => s.nodeSizes);
    const canvasSwitchPage = useCanvasStore((s) => s.switchPage);
    const subscribeMeta = useCanvasStore((s) => s.subscribeMeta);

    // Lazy-load canvas meta if pages haven't been fetched yet
    // (same pattern as CanvasPageSelector)
    useEffect(() => {
        if (canvasPages.length === 0) {
            const unsub = subscribeMeta();
            return unsub;
        }
    }, [canvasPages.length, subscribeMeta]);

    // Cleanup highlights on unmount
    useEffect(() => {
        return () => syncHighlights([]);
    }, []);

    // Track Cmd/Meta key on mousedown
    useEffect(() => {
        const handler = (e: MouseEvent) => { lastMetaKeyRef.current = e.metaKey || e.ctrlKey; };
        document.addEventListener('mousedown', handler, true);
        return () => document.removeEventListener('mousedown', handler, true);
    }, []);
    // --- State reset helper (declared before useEffects that reference it) ---
    const clearState = useCallback(() => {
        setSnippets([]);
        setPillPos(null);
        setShowPopover(false);
        syncHighlights([]);
    }, []);

    // Listen for text selection
    useEffect(() => {
        const handleMouseUp = () => {
            if (suppressNextMouseUp.current) {
                suppressNextMouseUp.current = false;
                return;
            }

            const isAppend = lastMetaKeyRef.current;

            requestAnimationFrame(() => {
                const selection = window.getSelection();
                if (!selection || selection.isCollapsed || !selection.rangeCount) {
                    if (!isAppend && !showPopover) clearState();
                    return;
                }

                // Quick empty check (actual markdown extraction happens after range)
                if (!selection.toString().trim()) {
                    if (!isAppend && !showPopover) clearState();
                    return;
                }

                const anchorNode = selection.anchorNode;
                if (!anchorNode || !isInsideModelBubble(anchorNode)) {
                    if (!isAppend && !showPopover) clearState();
                    return;
                }

                const messageId = getMessageId(anchorNode);
                if (!messageId) {
                    if (!isAppend && !showPopover) clearState();
                    return;
                }

                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const clonedRange = range.cloneRange();

                // Convert selected HTML → markdown (preserves bold, lists, etc.)
                const text = selectionToMarkdown(range);
                if (!text) {
                    if (!isAppend && !showPopover) clearState();
                    return;
                }

                setPillPos({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 });

                if (isAppend) {
                    setSnippets((prev) => {
                        const isDuplicate = prev.some((s) => s.text === text && s.messageId === messageId);
                        if (isDuplicate) return prev;
                        const next = [...prev, { text, messageId, range: clonedRange }];
                        syncHighlights(next.map((s) => s.range));
                        return next;
                    });
                } else {
                    const next = [{ text, messageId, range: clonedRange }];
                    setSnippets(next);
                    syncHighlights(next.map((s) => s.range));
                }
                setShowPopover(false);
            });
        };

        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, [showPopover, clearState]);

    // --- Scroll: hide pill, reposition after scroll ends ---
    const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [hiddenDuringScroll, setHiddenDuringScroll] = useState(false);

    useEffect(() => {
        if (snippets.length === 0) return;
        const chatContainer = scrollContainerRef.current;
        if (!chatContainer) return;

        const handleScroll = () => {
            if (showPopover) {
                setSnippets([]);
                setPillPos(null);
                setShowPopover(false);
                syncHighlights([]);
                return;
            }

            setHiddenDuringScroll(true);

            if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
            scrollTimerRef.current = setTimeout(() => {
                // Reposition pill to the last snippet's range (which may have moved)
                const lastSnippet = snippets[snippets.length - 1];
                if (lastSnippet) {
                    try {
                        const rect = lastSnippet.range.getBoundingClientRect();
                        if (rect.width > 0 || rect.height > 0) {
                            setPillPos({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 });
                        }
                    } catch {
                        // Range may have been invalidated
                    }
                }
                setHiddenDuringScroll(false);
            }, 150);
        };

        chatContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            chatContainer.removeEventListener('scroll', handleScroll);
            if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        };
    }, [snippets, showPopover, scrollContainerRef]);

    // Set suppress on mousedown — BEFORE the document mouseup listener fires
    const handlePillMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        suppressNextMouseUp.current = true;
    }, []);

    const handlePillClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setShowPopover(true);
    }, []);

    // --- Derived data ---
    const isActive = snippets.length > 0 && pillPos !== null;
    const combinedText = snippets.map((s) => s.text).join('\n\n---\n\n');

    // Stable mapping for popover (avoids re-creating array on every render)
    const canvasPageTargets = React.useMemo(
        () => canvasPages.map((p) => ({ id: p.id, title: p.title })),
        [canvasPages]
    );

    // Collect unique videos from ALL messages in the conversation
    // Handles both video-card and suggested-traffic context types
    const contextVideos: SaveTarget[] = React.useMemo(() => {
        const allVideos: SaveTarget[] = [];
        const seenIds = new Set<string>();
        for (const msg of messages) {
            if (!msg.appContext) continue;
            for (const ctx of msg.appContext) {
                if (ctx.type === 'video-card' && !seenIds.has(ctx.videoId)) {
                    seenIds.add(ctx.videoId);
                    allVideos.push({ videoId: ctx.videoId, title: ctx.title, thumbnailUrl: ctx.thumbnailUrl });
                } else if (ctx.type === 'suggested-traffic') {
                    const st = ctx as SuggestedTrafficContext;
                    // Extract source video (user's own video)
                    if (st.sourceVideo && !seenIds.has(st.sourceVideo.videoId)) {
                        seenIds.add(st.sourceVideo.videoId);
                        allVideos.push({
                            videoId: st.sourceVideo.videoId,
                            title: st.sourceVideo.title,
                            thumbnailUrl: st.sourceVideo.thumbnailUrl,
                        });
                    }
                    // Also extract suggested (competitor) videos
                    for (const sv of st.suggestedVideos || []) {
                        if (!seenIds.has(sv.videoId)) {
                            seenIds.add(sv.videoId);
                            allVideos.push({
                                videoId: sv.videoId,
                                title: sv.title,
                                thumbnailUrl: sv.thumbnailUrl || '',
                            });
                        }
                    }
                }
            }
        }
        // Filter to only videos that exist in user's Firestore collection
        const videoIdSet = new Set(videos.map((v) => v.id));
        return allVideos.filter((v) => videoIdSet.has(v.videoId));
    }, [messages, videos]);


    const handleSaveToVideo = useCallback(async (video: SaveTarget) => {
        if (!combinedText || !user || !currentChannel) return;

        const targetVideo = videos.find((v) => v.id === video.videoId);
        if (!targetVideo) {
            setToast({ message: 'Video not found', type: 'error' });
            return;
        }

        try {
            const newNote: VideoNote = {
                id: Date.now().toString(),
                text: combinedText,
                timestamp: Date.now(),
                userId: currentChannel.id,
                source: 'ai-chat',
            };

            const updatedNotes = [...(targetVideo.notes || []), newNote];
            await updateVideo({ videoId: video.videoId, updates: { notes: updatedNotes } });
            setToast({ message: `Saved to "${video.title}" \u2014 click to open`, type: 'success', videoId: video.videoId });
        } catch {
            setToast({ message: 'Failed to save note', type: 'error' });
        }
        clearState();
    }, [combinedText, user, currentChannel, videos, updateVideo, clearState]);

    const handleSaveToCanvas = useCallback((pageId: string) => {
        if (!combinedText) return;

        try {
            canvasSwitchPage(pageId);
            const position = computeNextNotePosition(canvasNodes, canvasNodeSizes);
            addNodeAt(
                { type: 'sticky-note', content: combinedText, color: 'blue' },
                position,
            );

            const page = canvasPages.find((p) => p.id === pageId);
            setToast({ message: `Saved to canvas "${page?.title || 'Page'}"`, type: 'success' });
        } catch {
            setToast({ message: 'Failed to save to canvas', type: 'error' });
        }
        clearState();
    }, [combinedText, canvasSwitchPage, canvasNodes, canvasNodeSizes, addNodeAt, canvasPages, clearState]);

    // --- Smart pill positioning ---
    // Pill appears above selection by default.
    // If selection top is above visible chat area → pill appears below selection.
    // Always clamped within chat panel bounds.
    const computePillAnchor = useCallback((): PillAnchor | null => {
        if (!pillPos) return null;
        const container = scrollContainerRef.current;
        const containerRect = container?.getBoundingClientRect();

        // Default: above selection
        let top = pillPos.top - PILL_HEIGHT - PILL_GAP;
        const left = pillPos.left;

        if (containerRect) {
            const visibleTop = containerRect.top;
            const visibleBottom = containerRect.bottom;

            // If selection top is above visible area → place below selection
            if (pillPos.top < visibleTop) {
                top = pillPos.bottom + PILL_GAP;
            }

            // Clamp vertically within chat panel
            top = Math.max(visibleTop + PILL_GAP, Math.min(top, visibleBottom - PILL_HEIGHT - PILL_GAP));
        }

        return { top, left, transform: 'translateX(-50%)' };
    }, [pillPos, scrollContainerRef]);

    // Compute once per render, reuse for pill and popover
    const pillAnchor = computePillAnchor();

    return (
        <>
            {/* Floating pill */}
            {isActive && !showPopover && !hiddenDuringScroll && createPortal(
                <button
                    className="animate-fade-in fixed flex items-center gap-1.5 px-3 py-1.5 bg-card-bg border border-border rounded-full text-text-primary text-xs font-semibold cursor-pointer shadow-xl z-toast whitespace-nowrap transition-colors hover:brightness-125"
                    onMouseDown={handlePillMouseDown}
                    onClick={handlePillClick}
                    style={pillAnchor ?? undefined}
                >
                    <Pin size={13} />
                    Save
                </button>,
                document.body
            )}

            {/* Save target popover */}
            {isActive && showPopover && (
                <SaveTargetPopover
                    anchorRect={pillAnchor!}
                    contextVideos={contextVideos}
                    canvasPages={canvasPageTargets}
                    onSaveToVideo={handleSaveToVideo}
                    onSaveToCanvas={handleSaveToCanvas}
                    onClose={clearState}
                />
            )}

            {/* Toast notification */}
            {toast && (
                <Toast
                    message={toast.message}
                    isVisible={!!toast}
                    type={toast.type}
                    onClose={() => setToast(null)}
                    duration={5000}
                    actionLabel={toast.videoId ? 'Open' : undefined}
                    onAction={toast.videoId ? () => navigate(`/watch/${toast.videoId}`) : undefined}
                />
            )}
        </>
    );
};
