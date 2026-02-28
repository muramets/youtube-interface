// =============================================================================
// InsightButtons — right-edge insight buttons on traffic source nodes.
//
// Resting: semicircle tab with ✨ icon, flush to node's right edge.
// Hover:   3 category buttons emerge from the tab and spread to positions.
//
// Design: CanvasToolbar pattern —
//   bg-bg-secondary/90 backdrop-blur-md border border-border shadow-lg
//   text-text-secondary → hover:text-text-primary hover:brightness-125
// =============================================================================

import React, { useState, useCallback, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import type { InsightCategory } from '../../../core/types/canvas';
import type { TrafficSourceCardData } from '../../../core/types/appContext';
import { InsightPopover } from './InsightPopover';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { INSIGHT_CATEGORIES as CATEGORIES } from '../constants/insightCategories';

const BTN_SIZE = 28;
const GAP = 4;
// --- Component ---

interface Props {
    nodeId: string;
    data: TrafficSourceCardData;
    nodeWidth: number;
    isHovered: boolean;
}

const InsightButtonsInner: React.FC<Props> = ({ nodeId, data, nodeWidth, isHovered }) => {
    // Dynamic offset: 4% of node width, clamped 8–16px
    const offset = Math.min(16, Math.max(8, Math.round(nodeWidth * 0.04)));
    const updateNodeData = useCanvasStore((s) => s.updateNodeData);
    const [isOpen, setIsOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<InsightCategory | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Track whether the InsightButtons area itself is hovered.
    // This prevents the parent node's isHovered=false from closing the menu
    // when the mouse is still inside the InsightButtons area (which sits OUTSIDE the node).
    const insightHoveredRef = useRef(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Debounced open/close prevents hover boundary flicker
    const openMenu = useCallback(() => {
        if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
        setIsOpen(true);
    }, []);
    const closeMenu = useCallback(() => {
        // CRITICAL: Clear previous timer BEFORE setting new one.
        // Without this, multiple closeMenu calls leak timers that can't be cancelled.
        if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
        closeTimer.current = setTimeout(() => setIsOpen(false), 300);
    }, []);

    // When node loses hover and no popover is active, close via debounce.
    // CRITICAL: Skip closing if the InsightButtons area itself is hovered.
    // The area sits OUTSIDE the node, so when the mouse moves from the node
    // onto the InsightButtons, the node fires isHovered=false. Without the ref guard,
    // this effect would immediately close the menu even though the user is still
    // interacting with it.
    React.useEffect(() => {
        if (!isHovered && !activeCategory && !insightHoveredRef.current) {
            closeMenu();
        } else if (isHovered) {
            if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
        }
    }, [isHovered, activeCategory, closeMenu, openMenu]);

    // Auto-open: consume pendingInsightReveal signal from store
    const pendingReveal = useCanvasStore((s) => s.pendingInsightReveal);
    React.useEffect(() => {
        if (pendingReveal && pendingReveal.nodeId === nodeId) {
            openMenu();
            useCanvasStore.getState().clearPendingInsightReveal();
        }
    }, [pendingReveal, nodeId, openMenu]);

    const insights = data.insights ?? {};

    const handleSave = useCallback((category: InsightCategory, text: string, pinned: boolean) => {
        const current = data.insights ?? {};
        const updated = { ...current };
        if (!text && !pinned) delete updated[category];
        else updated[category] = { text, pinned };
        updateNodeData(nodeId, { insights: Object.keys(updated).length > 0 ? updated : undefined });
    }, [nodeId, data.insights, updateNodeData]);



    const handleClosePopover = useCallback(() => setActiveCategory(null), []);

    // Total height of button stack
    const stackH = CATEGORIES.length * BTN_SIZE + (CATEGORIES.length - 1) * GAP;

    // Calculate active colors for the sparkles resting background
    const activeColors = CATEGORIES
        .filter(cat => insights[cat.key]?.text)
        .map(cat => cat.color);

    // CSS trick to show multiple colors behind the Sparkles icon
    // If 1 color: solid. If 2+: conic-gradient splitting the circle
    let badgeBackground = '';
    if (activeColors.length === 1) {
        badgeBackground = `${activeColors[0]}40`; // 25% opacity
    } else if (activeColors.length > 1) {
        const step = 100 / activeColors.length;
        const stops = activeColors.map((c, i) => `${c}40 ${i * step}%, ${c}40 ${(i + 1) * step}%`).join(', ');
        badgeBackground = `conic-gradient(${stops})`;
    }

    return (
        /* Outer wrapper: POSITIONING ONLY, no pointer events.
           This ensures hovering the empty zone between badge and buttons does NOT trigger the menu. */
        <div
            ref={wrapperRef}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                position: 'absolute',
                right: -(offset + BTN_SIZE),
                top: '70%',
                marginTop: -(stackH / 2),
                width: offset + BTN_SIZE + 12,
                height: stackH,
                // Must be above EdgeLayer lines (9999) and EdgeHandles (10000)
                zIndex: 10001,
                // CRITICAL: No pointer events on the wrapper itself.
                // Only children (badge, hitbox, buttons) accept mouse events.
                pointerEvents: 'none',
            }}
        >
            {/* Hitbox: Covers badge + buttons + gaps when menu is open.
                This is the SINGLE source of truth for hover lifecycle when the menu is visible.
                When closed, it's invisible to the mouse so it doesn't block canvas interactions. */}
            <div
                onMouseEnter={() => {
                    insightHoveredRef.current = true;
                    openMenu();
                }}
                onMouseLeave={(e) => {
                    // When mouse moves from hitbox to a sibling (badge/button) that sits
                    // ABOVE it (higher zIndex), the browser fires mouseLeave. But the mouse
                    // is still within InsightButtons — so we must NOT close the menu.
                    const related = e.relatedTarget;
                    if (related instanceof Node && wrapperRef.current?.contains(related)) return;
                    insightHoveredRef.current = false;
                    if (!activeCategory) closeMenu();
                }}
                style={{
                    position: 'absolute',
                    left: -20,
                    top: -10,
                    bottom: -10,
                    right: -10,
                    pointerEvents: isOpen ? 'auto' : 'none',
                    cursor: 'default',
                    zIndex: 0,
                    // Uncomment to debug hitbox bounds:
                    // backgroundColor: 'rgba(255, 0, 0, 0.15)',
                }}
            />
            {/* Resting indicator: Tiny Sparkles Badge — the SOLE trigger for opening the menu.
                Always has pointerEvents:auto so it's hoverable even when the menu is closed. */}
            <div
                className={`
                    flex items-center justify-center rounded-full
                    backdrop-blur-md shadow-md
                    transition-all duration-200
                    ${isOpen
                        ? 'text-text-primary brightness-125 ring-1 ring-white/20'
                        : activeColors.length > 0
                            ? 'text-white hover:brightness-125 ring-1 ring-white/10'
                            : 'bg-bg-secondary/90 text-text-tertiary hover:text-text-secondary'
                    }
                `}
                onMouseEnter={() => {
                    insightHoveredRef.current = true;
                    openMenu();
                }}
                style={{
                    position: 'absolute',
                    right: offset + BTN_SIZE - 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 20,
                    height: 20,
                    cursor: 'pointer',
                    zIndex: 2,
                    pointerEvents: 'auto',
                    background: isOpen ? 'var(--bg-secondary)' : (badgeBackground || undefined),
                }}
            >
                <Sparkles size={11} strokeWidth={2} />
            </div>

            {/* Category buttons — emerge from center and spread */}
            {CATEGORIES.map((cat, i) => {
                const insight = insights[cat.key];
                const hasFill = !!(insight && insight.text);
                const isActive = activeCategory === cat.key;
                const { Icon } = cat;

                const finalTop = i * (BTN_SIZE + GAP);
                const centerTop = (stackH - BTN_SIZE) / 2;

                return (
                    <div
                        key={cat.key}
                        className="transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1)"
                        style={{
                            position: 'absolute',
                            top: isOpen ? finalTop : centerTop,
                            right: isOpen ? 0 : BTN_SIZE, // start from badge pos
                            zIndex: 1,
                        }}
                    >
                        <button
                            onMouseDown={(e) => {
                                e.preventDefault(); // prevents textarea blur before toggle
                                e.stopPropagation();
                                setActiveCategory(prev => prev === cat.key ? null : cat.key);
                            }}
                            className={`
                                flex items-center justify-center rounded-full
                                bg-bg-secondary/90 backdrop-blur-md border shadow-lg
                                transition-all duration-200 select-none
                                ${isActive || hasFill
                                    ? 'border-white/20 brightness-110'
                                    : 'border-border text-text-secondary hover:brightness-125'
                                }
                            `}
                            style={{
                                width: BTN_SIZE,
                                height: BTN_SIZE,
                                padding: 0,
                                cursor: 'pointer',
                                transform: isOpen ? 'scale(1)' : 'scale(0.5)',
                                opacity: isOpen ? 1 : 0,
                                transitionDelay: isOpen ? `${i * 30}ms` : '0ms',
                                position: 'relative',
                                pointerEvents: isOpen ? 'auto' : 'none',
                                // Category color when active or has content
                                color: isActive || hasFill ? cat.color : undefined,
                            }}
                            title={cat.label}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.color = cat.color;
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive && !hasFill) {
                                    (e.currentTarget as HTMLElement).style.color = '';
                                }
                            }}
                        >
                            <Icon size={13} strokeWidth={2} />
                        </button>

                        {/* Invisible bridge — blocks mouse from falling through to EdgeLayer SVG.
                            NO hover handlers here; the outer container manages all open/close logic. */}
                        <div
                            style={{
                                position: 'absolute',
                                left: -(BTN_SIZE + GAP), // Bridge all the way back to the badge
                                width: BTN_SIZE + GAP + 10, // Cover the gap + overlap
                                height: BTN_SIZE + GAP, // Make it tall enough to cover vertical gaps between buttons
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: -1, // Behind the button, but inside the container
                                cursor: 'default',
                                pointerEvents: isOpen ? 'auto' : 'none',
                            }}
                        />

                        {/* Compact chip — preview of saved insight text.
                            NO hover handlers; the outer container manages open/close. */}
                        {hasFill && !isActive && (
                            <div
                                className="bg-bg-secondary/90 backdrop-blur-md border border-border shadow-lg"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveCategory(cat.key);
                                }}
                                style={{
                                    position: 'absolute',
                                    // Sits to the RIGHT of the button, further into canvas
                                    left: BTN_SIZE + 6,
                                    top: '50%',
                                    maxWidth: 160,
                                    height: BTN_SIZE,
                                    borderRadius: BTN_SIZE / 2,
                                    // Left accent strip via box-shadow inset
                                    boxShadow: `inset 3px 0 0 0 ${cat.color}, 0 4px 12px rgba(0,0,0,0.3)`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    paddingLeft: 10,
                                    paddingRight: 10,
                                    cursor: 'pointer',
                                    pointerEvents: isOpen ? 'auto' : 'none',
                                    // Fade + slide in with same delay as button
                                    opacity: isOpen ? 1 : 0,
                                    transform: isOpen
                                        ? 'translateY(-50%) translateX(0)'
                                        : 'translateY(-50%) translateX(8px)',
                                    transition: 'opacity 0.2s, transform 0.2s',
                                    transitionDelay: isOpen ? `${i * 30 + 60}ms` : '0ms',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    zIndex: 0,
                                }}
                            >
                                <span style={{
                                    fontSize: 11,
                                    color: 'var(--text-secondary)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 140,
                                }}>
                                    {insight!.text}
                                </span>
                            </div>
                        )}

                        {isActive && (
                            <div style={{
                                position: 'absolute',
                                left: BTN_SIZE + 8,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 100,
                                pointerEvents: 'auto',
                            }}>
                                <InsightPopover
                                    category={cat.key}
                                    insight={insight}
                                    onSave={handleSave}
                                    onClose={handleClosePopover}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export const InsightButtons = React.memo(InsightButtonsInner);
InsightButtons.displayName = 'InsightButtons';
