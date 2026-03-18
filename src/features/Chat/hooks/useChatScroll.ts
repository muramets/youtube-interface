// =============================================================================
// Chat Scroll State Machine — manages scroll behavior for ChatMessageList
//
// States:
//   idle   — default, no special scroll behavior
//   pinned — user message pinned to top, streaming below
//   away   — user scrolled away from pinned position (up to see old messages)
//
// Transitions:
//   idle → pinned   — new user message sent (P1) or streaming starts (P2)
//   pinned → pinned — user scrolls up: spacer consumed proportionally (scroll-linked)
//   pinned → idle   — spacer fully consumed (reaches 0)
//   pinned → away   — user scrolls up past the pin point (leaves pinned area)
//   away → idle     — streaming ends (P3)
//   pinned → idle   — streaming ends (P3)
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { debug } from '../../../core/utils/debug';

type ScrollIntent = 'idle' | 'pinned' | 'away';

interface UseChatScrollOpts {
    /** Number of messages in the list (triggers scroll logic on change). */
    messageCount: number;
    /** Whether AI is currently streaming a response. */
    isStreaming: boolean;
    /** Current streaming text (used as effect dependency for scroll updates). */
    streamingText: string | null;
    /** Role of the last message ('user' | 'model'). */
    lastMessageRole?: string;
}

interface UseChatScrollReturn {
    /** Ref for the scrollable container element. */
    containerRef: React.RefObject<HTMLDivElement | null>;
    /** Ref for the invisible pin anchor (place after last message). */
    pinAnchorRef: React.RefObject<HTMLDivElement | null>;
    /** Ref for the scroll-past-end spacer (place after bottomRef). */
    spacerRef: React.RefObject<HTMLDivElement | null>;
    /** Ref for the bottom sentinel (place after streaming message). */
    bottomRef: React.RefObject<HTMLDivElement | null>;
    /** Whether to show the scroll-to-bottom FAB. */
    showScrollFab: boolean;
    /** Scroll the container to the bottom (smooth). */
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
    const pinAnchorRef = useRef<HTMLDivElement>(null);
    const spacerRef = useRef<HTMLDivElement>(null);

    const [showScrollFab, setShowScrollFab] = useState(false);
    const isProgrammaticRef = useRef(false);
    const scrollEndCleanupRef = useRef<(() => void) | null>(null);

    const intentRef = useRef<ScrollIntent>('idle');
    const prevMsgCountRef = useRef(messageCount);
    const prevStreamingRef = useRef(isStreaming);

    // Scroll-linked spacer consumption: tracks scrollTop to detect user scroll deltas
    // -1 = sentinel (not yet initialized after pin)
    const prevScrollTopRef = useRef(-1);

    // Helper: set scrollTop without triggering handleScroll's away-detection
    // Uses scrollend event to keep guard up for entire smooth scroll duration
    const programmaticScroll = useCallback((fn: () => void) => {
        debug.scroll('programmaticScroll: setting isProgrammatic=true');
        scrollEndCleanupRef.current?.();
        isProgrammaticRef.current = true;
        fn();
        const container = containerRef.current;
        if (container) {
            const reset = () => {
                isProgrammaticRef.current = false;
                const el = containerRef.current;
                const finalPos = el ? `scrollTop=${el.scrollTop} scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight}` : 'no container';
                debug.scroll(`programmaticScroll: reset isProgrammatic=false (scrollend/timeout) ${finalPos}`);
                clearTimeout(fallback);
                container.removeEventListener('scrollend', reset);
                scrollEndCleanupRef.current = null;
            };
            container.addEventListener('scrollend', reset, { once: true });
            const fallback = setTimeout(reset, 1000);
            scrollEndCleanupRef.current = reset;
        }
    }, []);

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
        const bottom = bottomRef.current;
        if (!container || !bottom) return;

        const newCount = messageCount;
        const prevCount = prevMsgCountRef.current;
        const streamingJustStarted = isStreaming && !prevStreamingRef.current;
        const streamingJustEnded = !isStreaming && prevStreamingRef.current;

        debug.scroll(`=== EFFECT === intent=${intentRef.current} msgs=${prevCount}->${newCount} streaming=${isStreaming} justStarted=${streamingJustStarted} justEnded=${streamingJustEnded} streamingText=${streamingText ? streamingText.length + 'chars' : 'null'}`);
        debug.scroll(`  container: scrollTop=${container.scrollTop} scrollHeight=${container.scrollHeight} clientHeight=${container.clientHeight}`);

        prevMsgCountRef.current = newCount;
        prevStreamingRef.current = isStreaming;

        // --- Priority 1: Pin-to-top when user sends a new message ---
        if (newCount > prevCount && prevCount > 0 && intentRef.current !== 'away') {
            if (lastMessageRole === 'user') {
                const anchor = pinAnchorRef.current;
                const lastMsgEl = anchor?.previousElementSibling as HTMLElement | null;
                const msgHeight = lastMsgEl?.offsetHeight ?? 0;
                const spacerHeight = Math.max(0, container.clientHeight - msgHeight - 24);
                setSpacer(spacerHeight);
                debug.scroll(`P1: spacer expanded to ${spacerHeight}px, scrollHeight now=${container.scrollHeight}`);

                // Reset scroll-linked tracking (will be initialized on first user scroll)
                prevScrollTopRef.current = -1;

                if (anchor) {
                    if (lastMsgEl) {
                        const cRect = container.getBoundingClientRect();
                        const mRect = lastMsgEl.getBoundingClientRect();
                        const targetScrollTop = container.scrollTop + (mRect.top - cRect.top - 12);
                        debug.scroll(`P1: pin scroll - current=${container.scrollTop} target=${targetScrollTop} delta=${mRect.top - cRect.top - 12} mRect.top=${mRect.top} cRect.top=${cRect.top}`);
                        programmaticScroll(() => {
                            container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
                        });
                    } else {
                        debug.scroll('P1: no lastMsgEl found (anchor.previousElementSibling is null)');
                    }
                } else {
                    debug.scroll('P1: no pinAnchorRef');
                }

                intentRef.current = 'pinned';
                debug.scroll('P1: intent -> pinned, returning');
                return;
            }
        }

        // --- Priority 2: During streaming — stay pinned, no auto-scroll ---
        if (isStreaming && intentRef.current !== 'away') {
            if (streamingJustStarted && intentRef.current === 'idle') {
                debug.scroll('P2: streaming just started, intent idle -> pinned');
                intentRef.current = 'pinned';
            }
            debug.scroll(`P2: streaming active, intent=${intentRef.current}, no scroll`);
            return;
        }

        // --- Priority 3: Streaming just ended — shrink spacer, preserve scroll position ---
        if (streamingJustEnded) {
            const currentScroll = container.scrollTop;
            const contentH = container.scrollHeight - (spacerRef.current?.offsetHeight ?? 0);
            const neededScrollH = currentScroll + container.clientHeight;
            const neededSpacer = Math.max(0, neededScrollH - contentH);
            debug.scroll(`P3: streaming ended, spacer ${spacerRef.current?.offsetHeight ?? 0}->${neededSpacer}, preserving scrollTop=${currentScroll}`);
            setSpacer(neededSpacer);
            intentRef.current = 'idle';
            return;
        }

        // --- Priority 4: Initial history load — scroll to bottom ---
        if (newCount > prevCount && intentRef.current === 'idle') {
            const isInitialLoad = prevCount === 0;
            debug.scroll(`P4: new messages, isInitialLoad=${isInitialLoad}`);
            if (isInitialLoad) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const finalScrollHeight = container.scrollHeight;
                        const target = finalScrollHeight - container.clientHeight;
                        debug.scroll(`P4 (instant): scrollHeight=${finalScrollHeight} target=${target}`);
                        container.scrollTop = target;
                        debug.scroll(`P4 (instant): scrollTop after set=${container.scrollTop}`);
                    });
                });
            }
        }

        debug.scroll(`=== END === intent=${intentRef.current}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messageCount, streamingText, isStreaming]);

    // Track scroll position for FAB + scroll-linked spacer consumption
    const handleScroll = useCallback(() => {
        if (isProgrammaticRef.current) {
            debug.scroll('handleScroll: skipped (programmatic)');
            return;
        }
        const el = containerRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

        // --- Scroll-linked spacer consumption while pinned ---
        if (intentRef.current === 'pinned') {
            const spacer = spacerRef.current;
            const spacerH = spacer?.offsetHeight ?? 0;

            // Initialize tracking on first user scroll after pin
            if (prevScrollTopRef.current === -1) {
                prevScrollTopRef.current = el.scrollTop;
                debug.scroll(`handleScroll[pinned]: initialized prevScrollTop=${el.scrollTop}`);
                return;
            }

            const delta = el.scrollTop - prevScrollTopRef.current;
            prevScrollTopRef.current = el.scrollTop;

            if (delta < 0 && spacerH > 0) {
                // User scrolling UP (trackpad down) — leaving pinned area, seeing old messages.
                // Consume spacer proportionally: spacer shrinks invisibly from below.
                // Math: scrollTop decreases by |delta|, spacer decreases by |delta| →
                // distFromBottom stays constant → no clamping possible.
                const consumed = Math.min(Math.abs(delta), spacerH);
                const newSpacerH = spacerH - consumed;
                if (spacer) spacer.style.minHeight = `${newSpacerH}px`;
                debug.scroll(`handleScroll[pinned]: scroll-linked consume ${consumed}px, spacer ${spacerH}->${newSpacerH}`);

                if (newSpacerH <= 0) {
                    debug.scroll('handleScroll[pinned]: spacer fully consumed → idle');
                    intentRef.current = 'idle';
                }
            } else if (delta < 0 && spacerH <= 0) {
                // Spacer already gone, user still scrolling up — release to normal scroll
                debug.scroll('handleScroll[pinned]: spacer already 0, scrolling up → away');
                intentRef.current = 'away';
            }
            // delta > 0 (scroll down while pinned): no action — user is at the pin,
            // streaming content is below, nothing useful to consume.

            setShowScrollFab(distanceFromBottom > 200);
            return;
        }

        // --- Normal scroll tracking (idle / away) ---
        setShowScrollFab(distanceFromBottom > 200);

        if (distanceFromBottom <= 80 && intentRef.current === 'away') {
            debug.scroll('handleScroll: user scrolled back near bottom, intent away -> idle');
            intentRef.current = 'idle';
        }

        // Lazy spacer cleanup: P3 leaves a residual spacer to preserve scroll
        // position after streaming ends. Once the user scrolls, collapse it.
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
                if (distFromBottom < 80) {
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
        intentRef.current = 'idle';
        prevScrollTopRef.current = -1;
        setSpacer(0);
        programmaticScroll(() => {
            containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
        });
    }, [setSpacer, programmaticScroll]);

    return {
        containerRef,
        pinAnchorRef,
        spacerRef,
        bottomRef,
        showScrollFab,
        scrollToBottom,
        handleScroll,
    };
}
