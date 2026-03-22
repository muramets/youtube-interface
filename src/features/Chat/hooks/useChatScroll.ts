// =============================================================================
// Chat Scroll State Machine — CSS sticky-based scroll pinning
//
// States:
//   idle   — default, no special scroll behavior
//   pinned — user message pinned to top via CSS position:sticky, streaming below
//   away   — user scrolled away from pinned position to view history
//
// Transitions:
//   idle → pinned   — new user message sent (P1) or streaming starts (P2)
//   pinned → away   — user scrolls >80px from bottom
//   away → pinned   — user scrolls back near bottom during streaming (re-pin)
//   away → idle     — user scrolls back near bottom after streaming ends
//   pinned → idle   — streaming ends (P3)
// =============================================================================

import { useEffect, useLayoutEffect, useReducer, useRef, useState, useCallback } from 'react';
import { debug } from '../../../core/utils/debug';

type ScrollIntent = 'idle' | 'pinned' | 'away';

/** Threshold (px) for showing scroll-to-bottom FAB */
const FAB_DISTANCE_THRESHOLD = 200;
/** Threshold (px) for "user scrolled away" detection during pinned state */
const AWAY_DISTANCE_THRESHOLD = 80;

/** Position zone flush with scrollport top (before paint). */
function flushZoneToTop(zone: HTMLDivElement, container: HTMLDivElement): void {
    zone.scrollIntoView({ block: 'start', behavior: 'instant' });
    const residualGap = zone.getBoundingClientRect().top - container.getBoundingClientRect().top;
    if (residualGap > 0) {
        container.scrollTop += residualGap;
    }
}

interface UseChatScrollOpts {
    /** Number of messages in the list (triggers scroll logic on change). */
    messageCount: number;
    /** Whether AI is currently streaming a response. */
    isStreaming: boolean;
    /** Current streaming text (effect dependency for transition detection). */
    streamingText: string | null;
    /** Role of the last message ('user' | 'model'). */
    lastMessageRole?: string;
}

interface UseChatScrollReturn {
    /** Ref for the scrollable container element. */
    containerRef: React.RefObject<HTMLDivElement | null>;
    /** Ref for the sticky zone wrapper (gets .chat-sticky-zone class when pinned). */
    stickyZoneRef: React.RefObject<HTMLDivElement | null>;
    /** Ref for the scroll-past-end spacer (one-shot P3 cushion, outside sticky zone). */
    spacerRef: React.RefObject<HTMLDivElement | null>;
    /** Ref for the bottom sentinel (inside sticky zone, after streaming content). */
    bottomRef: React.RefObject<HTMLDivElement | null>;
    /** Whether to show the scroll-to-bottom FAB. */
    showScrollFab: boolean;
    /** Whether the sticky zone is pinned (controls CSS class + minHeight in JSX). */
    isPinned: boolean;
    /** Scroll to bottom (or return to pinned view during streaming). */
    scrollToBottom: () => void;
    /** onScroll handler — attach to the scrollable container. */
    handleScroll: () => void;
}

export function useChatScroll({
    messageCount,
    isStreaming,
    streamingText,
    lastMessageRole,
}: UseChatScrollOpts): UseChatScrollReturn {
    const containerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const stickyZoneRef = useRef<HTMLDivElement>(null);
    const spacerRef = useRef<HTMLDivElement>(null);

    const [showScrollFab, setShowScrollFab] = useState(false);
    const [isPinned, setIsPinned] = useState(false);

    // Force useLayoutEffect re-run when isPinned is already true (P3 lazy doesn't reset it).
    // useReducer(x => x+1) always produces a new value → guaranteed re-render.
    const [pinTrigger, forcePinRerender] = useReducer((x: number) => x + 1, 0);

    const intentRef = useRef<ScrollIntent>('idle');
    const prevMsgCountRef = useRef(messageCount);
    const prevStreamingRef = useRef(isStreaming);

    // Ref mirror: lets stable callbacks (handleScroll, scrollToBottom) read current streaming state
    const isStreamingRef = useRef(isStreaming);
    isStreamingRef.current = isStreaming;

    // Flag: P1 sets this to trigger useLayoutEffect positioning on next render.
    // Prevents repositioning on non-P1 messageCount changes (e.g., model response arrival).
    const needsPositionRef = useRef(false);

    // Scroll preservation for "Load earlier messages" — track scrollHeight between renders
    const prevScrollHeightRef = useRef(0);
    const prevMsgCountLayoutRef = useRef(messageCount);

    // Helper: expand/collapse spacer synchronously via DOM
    const setSpacer = useCallback((height: number) => {
        debug.scroll(`setSpacer: ${height}px`);
        if (spacerRef.current) {
            spacerRef.current.style.minHeight = height > 0 ? `${height}px` : '0px';
        }
    }, []);

    // Single effect: all scroll decisions in one place, clear priority
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const newCount = messageCount;
        const prevCount = prevMsgCountRef.current;
        const streamingJustStarted = isStreaming && !prevStreamingRef.current;
        const streamingJustEnded = !isStreaming && prevStreamingRef.current;

        debug.scroll(`=== EFFECT === intent=${intentRef.current} msgs=${prevCount}->${newCount} streaming=${isStreaming} justStarted=${streamingJustStarted} justEnded=${streamingJustEnded} streamingText=${streamingText ? streamingText.length + 'chars' : 'null'}`);

        prevMsgCountRef.current = newCount;
        prevStreamingRef.current = isStreaming;

        // --- P1: Pin-to-top when user sends a new message ---
        // Sets isPinned=true → React re-renders → useLayoutEffect positions zone before paint.
        // Triggers for any new user message: prevCount > 0 (subsequent messages) OR
        // prevCount === 0 && newCount === 1 (first message in a new conversation).
        const isFirstMessage = prevCount === 0 && newCount === 1;
        if (newCount > prevCount && (prevCount > 0 || isFirstMessage) && intentRef.current !== 'away') {
            if (lastMessageRole === 'user') {
                needsPositionRef.current = true;
                setIsPinned(true);
                forcePinRerender(); // guaranteed re-render even if isPinned was already true
                intentRef.current = 'pinned';
                debug.scroll('P1: intent -> pinned');
                return;
            }
        }

        // --- P2: During streaming — stay pinned, no auto-scroll ---
        if (isStreaming && intentRef.current !== 'away') {
            if (streamingJustStarted && intentRef.current === 'idle') {
                setIsPinned(true);
                intentRef.current = 'pinned';
                debug.scroll('P2: streaming just started, intent idle -> pinned');
            }
            debug.scroll(`P2: streaming active, intent=${intentRef.current}, no scroll`);
            return;
        }

        // --- P3: Streaming just ended ---
        // Lazy approach: do NOTHING to the DOM. Keep sticky, keep minHeight, keep padding.
        // User stays in the pinned view (their message at top, model response below).
        // Cleanup happens on next P1 (overwrites) or scrollToBottom (explicit user action).
        if (streamingJustEnded) {
            intentRef.current = 'idle';
            debug.scroll('P3: streaming ended, intent -> idle (no DOM changes)');
            return;
        }

        // --- P4: Initial history load — scroll to bottom ---
        // Only for bulk loads (newCount > 1). Single first message (newCount === 1)
        // is handled by P1 above. Direct scrollTop set — useEffect runs after React
        // commits DOM, so content is ready.
        if (newCount > prevCount && intentRef.current === 'idle') {
            if (prevCount === 0 && newCount > 1) {
                container.scrollTop = container.scrollHeight - container.clientHeight;
                debug.scroll('P4: initial load scroll to bottom');
            }
        }

        debug.scroll(`=== END === intent=${intentRef.current}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messageCount, streamingText, isStreaming]);

    // Position zone BEFORE browser paint when isPinned changes to true.
    // useLayoutEffect runs after React commits DOM but before paint — zero frame delay.
    // This handles P1 positioning (minHeight + scrollTop) and ensures no visual "shift".
    // Position zone BEFORE browser paint. Depends on isPinned + messageCount because:
    // - isPinned: initial pin (false → true)
    // - messageCount: subsequent pins when isPinned is already true (P3 lazy approach
    //   doesn't reset isPinned, so setIsPinned(true) is a no-op on next send)
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const countDelta = messageCount - prevMsgCountLayoutRef.current;
        prevMsgCountLayoutRef.current = messageCount;

        // --- P1: Position zone before paint ---
        if (needsPositionRef.current) {
            needsPositionRef.current = false;

            const zone = stickyZoneRef.current;
            if (!zone) return;

            // Set minHeight — zone must cover viewport for sticky runway
            zone.style.minHeight = `${container.clientHeight}px`;

            // Position zone flush with scrollport top. Zone's own CSS padding-top (12px)
            // provides the visual gap — no reliance on container padding or flex gap.
            flushZoneToTop(zone, container);

            prevScrollHeightRef.current = container.scrollHeight;
            debug.scroll(`useLayoutEffect P1: flush, scrollTop=${container.scrollTop}`);
            return;
        }

        // --- Scroll preservation for bulk prepend ("Load earlier messages") ---
        // When messages are added above the zone while pinned, Chrome's scroll anchoring
        // can't fully compensate (zone has overflow-anchor:none). Re-position zone flush
        // with the scrollport — same absolute logic as P1, idempotent regardless of
        // what Chrome already did.
        // countDelta > 1 filters out single model-message arrivals (+1).
        if (isPinned && countDelta > 1 && prevScrollHeightRef.current > 0) {
            const zone = stickyZoneRef.current;
            if (zone) {
                flushZoneToTop(zone, container);
                debug.scroll(`useLayoutEffect: prepend re-flush, countDelta=${countDelta}`);
            }
            prevScrollHeightRef.current = container.scrollHeight;
        }
    }, [isPinned, messageCount, pinTrigger]);

    // Track scroll position for FAB + away detection
    const handleScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

        // Hide FAB when pinned — user is already in correct view (Key Decision #10)
        setShowScrollFab(distanceFromBottom > FAB_DISTANCE_THRESHOLD && intentRef.current !== 'pinned');

        // Pinned → away: user scrolled to history during streaming
        if (distanceFromBottom > AWAY_DISTANCE_THRESHOLD && intentRef.current === 'pinned') {
            debug.scroll(`handleScroll: user scrolled away, intent pinned -> away`);
            intentRef.current = 'away';
        }

        // Away → return: user scrolled back near bottom
        if (distanceFromBottom <= AWAY_DISTANCE_THRESHOLD && intentRef.current === 'away') {
            if (isStreamingRef.current) {
                // Streaming still active — re-pin (Key Decision #9)
                debug.scroll('handleScroll: back near bottom during streaming, re-pin');
                intentRef.current = 'pinned';
                // isPinned stays true (never set to false during away)
            } else {
                debug.scroll('handleScroll: back near bottom, intent away -> idle');
                intentRef.current = 'idle';
                setIsPinned(false);
                setSpacer(0);
            }
        }

        // Lazy spacer cleanup (P3 residual)
        const spacerH = spacerRef.current?.offsetHeight ?? 0;
        if (spacerH > 0 && intentRef.current === 'idle') {
            debug.scroll(`handleScroll: collapsing residual spacer (${spacerH}px)`);
            setSpacer(0);
        }
    }, [setSpacer]);

    // Auto-scroll when container height shrinks (e.g. context chips appear in ChatInput)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let prevHeight = el.clientHeight;
        const observer = new ResizeObserver(() => {
            const newHeight = el.clientHeight;
            if (newHeight < prevHeight) {
                const distFromBottom = el.scrollHeight - el.scrollTop - prevHeight;
                if (distFromBottom < AWAY_DISTANCE_THRESHOLD) {
                    el.scrollTop = el.scrollHeight - newHeight;
                }
            }
            prevHeight = newHeight;
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const scrollToBottom = useCallback(() => {
        debug.scroll('scrollToBottom clicked');
        if (isStreamingRef.current && stickyZoneRef.current && containerRef.current) {
            // During streaming: return to pinned view (Key Decision #10)
            intentRef.current = 'pinned';
            const containerRect = containerRef.current.getBoundingClientRect();
            const zoneRect = stickyZoneRef.current.getBoundingClientRect();
            containerRef.current.scrollTo({
                top: containerRef.current.scrollTop + zoneRect.top - containerRect.top,
                behavior: 'smooth',
            });
        } else {
            // After streaming: normal scroll to bottom
            intentRef.current = 'idle';
            setIsPinned(false);
            setSpacer(0);
            if (stickyZoneRef.current) stickyZoneRef.current.style.minHeight = '';
            containerRef.current?.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, [setSpacer]);

    return {
        containerRef,
        stickyZoneRef,
        spacerRef,
        bottomRef,
        showScrollFab,
        isPinned,
        scrollToBottom,
        handleScroll,
    };
}
