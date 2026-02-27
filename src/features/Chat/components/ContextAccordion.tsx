// =============================================================================
// Context Accordion — Shared component for displaying attached context items.
// Used in ChatInput (pre-send, expanded by default) and PersistedContextBar
// (conversation memory, collapsed by default).
// =============================================================================

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Paperclip, X, ChevronUp } from 'lucide-react';
import type { AppContextItem, VideoCardContext, SuggestedTrafficContext, CanvasSelectionContext } from '../../../core/types/appContext';
import { getVideoCards, getTrafficContexts, getCanvasContexts } from '../../../core/types/appContext';
import { buildVideoBadgeMap } from '../../../core/utils/buildReferenceMap';
import { VideoCardChip } from '../VideoCardChip';
import { SuggestedTrafficChip } from '../SuggestedTrafficChip';
import { CanvasSelectionChip } from '../CanvasSelectionChip';

interface ContextAccordionProps {
    /** All context items to display */
    items: AppContextItem[];
    /** Called when a single item is removed */
    onRemoveItem: (item: AppContextItem) => void;
    /** Called when all items are cleared */
    onClearAll: () => void;
    /** Whether the accordion starts expanded (default: true for pre-send) */
    defaultExpanded?: boolean;
    /** Optional label prefix (e.g. "Memory" for persisted context) */
    label?: string;
    /** Invert chevron direction (true for top-positioned bars that expand downward) */
    invertChevron?: boolean;
}

export const ContextAccordion: React.FC<ContextAccordionProps> = ({
    items,
    onRemoveItem,
    onClearAll,
    defaultExpanded = true,
    label,
    invertChevron = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const scrollRef = useRef<HTMLDivElement>(null);
    const prevCountRef = useRef(items.length);

    // Auto-scroll to bottom when new items are added (not on remove)
    useEffect(() => {
        if (items.length > prevCountRef.current && scrollRef.current) {
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            });
        }
        prevCountRef.current = items.length;
    }, [items.length]);

    const videoItems = useMemo(() => getVideoCards(items), [items]);
    const trafficItems = useMemo(() => getTrafficContexts(items), [items]);
    const canvasItems = useMemo(() => getCanvasContexts(items), [items]);

    const summary = useMemo(() => {
        const canvasNodeCount = canvasItems.reduce((sum, cc) => sum + cc.nodes.length, 0);
        const totalItems = videoItems.length + trafficItems.length + canvasNodeCount;
        const parts: string[] = [];
        if (videoItems.length > 0) parts.push(`${videoItems.length} video${videoItems.length > 1 ? 's' : ''}`);
        if (trafficItems.length > 0) parts.push(`${trafficItems.length} traffic`);
        if (canvasNodeCount > 0) parts.push(`${canvasNodeCount} canvas`);
        return `${totalItems} item${totalItems > 1 ? 's' : ''} · ${parts.join(', ')}`;
    }, [videoItems, trafficItems, canvasItems]);

    const handleRemoveVideo = useCallback((videoId: string) => {
        const item = items.find(c => c.type === 'video-card' && (c as VideoCardContext).videoId === videoId);
        if (item) onRemoveItem(item);
    }, [items, onRemoveItem]);

    if (items.length === 0) return null;

    return (
        <div className="context-accordion">
            <button
                className="context-accordion-header"
                onClick={() => setIsExpanded(v => !v)}
                type="button"
            >
                <Paperclip size={12} className="interactive-text shrink-0" />
                <span className="flex-1 text-left truncate">
                    {label ? <span className="text-text-tertiary">{label}: </span> : null}
                    {summary}
                </span>
                <span
                    role="button"
                    tabIndex={0}
                    className="context-accordion-clear"
                    onClick={(e) => { e.stopPropagation(); onClearAll(); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClearAll(); } }}
                >
                    <X size={12} />
                </span>
                <ChevronUp size={12} className={`interactive-text shrink-0 transition-transform duration-150 ${(invertChevron ? !isExpanded : isExpanded) ? 'rotate-180' : ''}`} />
            </button>

            {isExpanded && (
                <div ref={scrollRef} className="px-2.5 pb-2 max-h-[40vh] overflow-y-auto scrollbar-compact">
                    {(() => {
                        const badgeMap = buildVideoBadgeMap(items);
                        // Cumulative canvas video counter across all canvas groups
                        let canvasVideoOffset = 0;

                        // Group contiguous items of the same type for visual cohesion,
                        // but preserve the chronological order from selectAllItems.
                        const groups: { type: string; items: AppContextItem[] }[] = [];
                        for (const item of items) {
                            const last = groups[groups.length - 1];
                            if (last && last.type === item.type) {
                                last.items.push(item);
                            } else {
                                groups.push({ type: item.type, items: [item] });
                            }
                        }

                        return groups.map((group, gi) => {
                            if (group.type === 'video-card') {
                                return (
                                    <div key={`g-${gi}`} className="flex flex-wrap gap-1.5 mb-2">
                                        {(group.items as VideoCardContext[]).map(v => {
                                            const badge = badgeMap.get(v.videoId);
                                            return (
                                                <VideoCardChip
                                                    key={v.videoId}
                                                    video={v}
                                                    onRemove={() => handleRemoveVideo(v.videoId)}
                                                    index={badge?.index ?? 1}
                                                    badgePrefix={badge?.prefix}
                                                />
                                            );
                                        })}
                                    </div>
                                );
                            }
                            if (group.type === 'suggested-traffic') {
                                return (
                                    <div key={`g-${gi}`} className="flex flex-wrap gap-1.5 mb-2">
                                        {group.items.map((tc, i) => (
                                            <SuggestedTrafficChip
                                                key={`traffic-${gi}-${i}`}
                                                context={tc as SuggestedTrafficContext}
                                                onRemove={() => onRemoveItem(tc)}
                                            />
                                        ))}
                                    </div>
                                );
                            }
                            if (group.type === 'canvas-selection') {
                                return (
                                    <div key={`g-${gi}`} className="flex flex-col gap-1.5 mb-2">
                                        {group.items.map((cc, i) => {
                                            const ctx = cc as CanvasSelectionContext;
                                            const offset = canvasVideoOffset;
                                            canvasVideoOffset += ctx.nodes.filter(n => n.nodeType === 'video' || n.nodeType === 'traffic-source').length;
                                            return (
                                                <CanvasSelectionChip
                                                    key={`canvas-${gi}-${i}`}
                                                    context={ctx}
                                                    onRemove={() => onRemoveItem(cc)}
                                                    videoStartIndex={offset}
                                                />
                                            );
                                        })}
                                    </div>
                                );
                            }
                            return null;
                        });
                    })()}
                </div>
            )}
        </div>
    );
};
