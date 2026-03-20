import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatScroll } from '../useChatScroll';

// Mock debug.scroll to suppress output in tests
vi.mock('../../../../core/utils/debug', () => ({
    debug: { scroll: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockContainer {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    scrollTo: ReturnType<typeof vi.fn>;
}

function makeMockContainer(overrides?: Partial<MockContainer>): MockContainer {
    return {
        scrollTop: 0,
        scrollHeight: 2000,
        clientHeight: 500,
        scrollTo: vi.fn(),
        getBoundingClientRect: () => ({ top: 0, left: 0, right: 500, bottom: 500, width: 500, height: 500, x: 0, y: 0, toJSON: () => ({}) }),
        ...overrides,
    } as MockContainer;
}

function makeMockClassList() {
    const classes = new Set<string>();
    return {
        add: (cls: string) => classes.add(cls),
        remove: (cls: string) => classes.delete(cls),
        contains: (cls: string) => classes.has(cls),
    };
}

function makeMockZone(overrides?: Partial<{ offsetTop: number; scrollHeight: number; style: Record<string, string>; getBoundingClientRect: () => DOMRect }>) {
    return {
        offsetTop: 1500,
        scrollHeight: 260,
        style: { minHeight: '' },
        classList: makeMockClassList(),
        scrollIntoView: vi.fn(),
        getBoundingClientRect: () => ({ top: 1500, left: 0, right: 500, bottom: 1760, width: 500, height: 260, x: 0, y: 0, toJSON: () => ({}) }),
        ...overrides,
    };
}

function makeMockSpacer() {
    return { offsetHeight: 0, style: { minHeight: '0px' } };
}

/** Assign mock DOM elements to refs after hook mounts */
function assignRefs(
    result: { current: ReturnType<typeof useChatScroll> },
    container: MockContainer,
    zone?: ReturnType<typeof makeMockZone>,
    spacer?: ReturnType<typeof makeMockSpacer>,
) {
    Object.defineProperty(result.current.containerRef, 'current', {
        value: container, writable: true, configurable: true,
    });
    if (zone) {
        Object.defineProperty(result.current.stickyZoneRef, 'current', {
            value: zone, writable: true, configurable: true,
        });
    }
    if (spacer) {
        Object.defineProperty(result.current.spacerRef, 'current', {
            value: spacer, writable: true, configurable: true,
        });
    }
}

// Capture rAF callbacks for manual flushing
let rafCallbacks: Array<() => void> = [];
function flushRAF() {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    cbs.forEach(cb => cb());
}

beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
    });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useChatScroll', () => {
    const defaultOpts = {
        messageCount: 0,
        isStreaming: false,
        streamingText: null as string | null,
        lastMessageRole: undefined as string | undefined,
    };

    describe('Initial state', () => {
        it('starts with isPinned=false and showScrollFab=false', () => {
            const { result } = renderHook(() => useChatScroll(defaultOpts));
            expect(result.current.isPinned).toBe(false);
            expect(result.current.showScrollFab).toBe(false);
        });
    });

    describe('P1 — user message pins', () => {
        it('sets isPinned=true when messageCount increases with lastMessageRole=user', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer();
            const zone = makeMockZone();
            assignRefs(result, container, zone);

            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });

            expect(result.current.isPinned).toBe(true);
        });

        it('sets min-height and calls scrollIntoView via useLayoutEffect (before paint)', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ scrollTop: 0, clientHeight: 500 });
            const zone = makeMockZone({ offsetTop: 1200 });
            assignRefs(result, container, zone);

            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });

            // min-height set to container.clientHeight
            expect(zone.style.minHeight).toBe('500px');
            // scrollIntoView called (browser handles scroll position)
            expect(zone.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
        });
    });

    describe('P2 — streaming stays pinned', () => {
        it('stays pinned when streaming starts after P1', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer();
            const zone = makeMockZone();
            assignRefs(result, container, zone);

            // P1: pin
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });
            expect(result.current.isPinned).toBe(true);

            // P2: streaming starts
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: true, streamingText: 'hello' });
            expect(result.current.isPinned).toBe(true);
        });

        it('activates pin on retry (streaming without new message)', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 5, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer();
            assignRefs(result, container);

            // Streaming starts without messageCount change (retry)
            rerender({ ...defaultOpts, messageCount: 5, lastMessageRole: 'model', isStreaming: true });
            expect(result.current.isPinned).toBe(true);
        });
    });

    describe('P3 — streaming ends (lazy approach)', () => {
        it('keeps isPinned=true when streaming ends (no DOM changes)', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer();
            const zone = makeMockZone();
            assignRefs(result, container, zone);

            // P1: pin
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });
            // P2: streaming
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: true, streamingText: 'hi' });
            // P3: streaming ends — isPinned stays true (lazy cleanup)
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: false, streamingText: null });

            expect(result.current.isPinned).toBe(true);
        });

        it('does not touch spacer or zone minHeight', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ clientHeight: 500 });
            const zone = makeMockZone({ scrollHeight: 260 });
            const spacer = makeMockSpacer();
            assignRefs(result, container, zone, spacer);

            // P1 sets zone minHeight via rAF
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });
            flushRAF();
            const minHeightAfterP1 = zone.style.minHeight;

            // P2 → P3
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: true, streamingText: 'x' });
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: false });

            // Zone minHeight unchanged (P3 doesn't touch DOM)
            expect(zone.style.minHeight).toBe(minHeightAfterP1);
            // Spacer unchanged
            expect(spacer.style.minHeight).toBe('0px');
        });

        it('scrollToBottom cleans up isPinned + minHeight after streaming', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ scrollHeight: 3000 });
            const zone = makeMockZone();
            const spacer = makeMockSpacer();
            assignRefs(result, container, zone, spacer);

            // P1 → P2 → P3
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: true, streamingText: 'x' });
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: false });

            // isPinned still true after P3
            expect(result.current.isPinned).toBe(true);

            // scrollToBottom (non-streaming) cleans everything up
            act(() => { result.current.scrollToBottom(); });
            expect(result.current.isPinned).toBe(false);
            expect(zone.style.minHeight).toBe('');
        });
    });

    describe('P4 — initial load scrolls to bottom', () => {
        it('scrolls to bottom on first message load', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: defaultOpts },
            );
            const container = makeMockContainer({ scrollHeight: 3000, clientHeight: 500 });
            assignRefs(result, container);

            rerender({ ...defaultOpts, messageCount: 10 });
            flushRAF(); // outer rAF
            flushRAF(); // inner rAF

            expect(container.scrollTop).toBe(2500); // 3000 - 500
        });
    });

    describe('FAB visibility', () => {
        it('hides FAB when intent is pinned even if far from bottom', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ scrollTop: 0, scrollHeight: 2000, clientHeight: 500 });
            const zone = makeMockZone();
            assignRefs(result, container, zone);

            // Pin via P1
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });

            // Simulate scroll — distanceFromBottom = 2000 - 0 - 500 = 1500 (> 200)
            act(() => { result.current.handleScroll(); });

            // FAB should still be hidden because intent is 'pinned'
            expect(result.current.showScrollFab).toBe(false);
        });

        it('shows FAB when away and far from bottom', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ scrollTop: 0, scrollHeight: 3000, clientHeight: 500 });
            const zone = makeMockZone({ offsetTop: 1500 });
            assignRefs(result, container, zone);

            // Pin via P1 — useLayoutEffect sets scrollTop = 1500
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });

            // Simulate user scrolling to top (far from bottom)
            container.scrollTop = 0; // distanceFromBottom = 3000 - 0 - 500 = 2500
            // First scroll: pinned → away
            act(() => { result.current.handleScroll(); });
            // Now intent is 'away', scroll again to check FAB
            act(() => { result.current.handleScroll(); });

            expect(result.current.showScrollFab).toBe(true);
        });
    });

    describe('Away detection and re-pin', () => {
        it('transitions to away when scrolling far during pinned', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ scrollTop: 0, scrollHeight: 2000, clientHeight: 500 });
            const zone = makeMockZone();
            assignRefs(result, container, zone);

            // Pin
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });
            // distanceFromBottom = 2000 - 0 - 500 = 1500 > 80
            act(() => { result.current.handleScroll(); });

            // isPinned stays true (CSS class stays), but intent is 'away'
            expect(result.current.isPinned).toBe(true);
        });

        it('re-pins when returning near bottom during streaming', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ scrollTop: 0, scrollHeight: 2000, clientHeight: 500 });
            const zone = makeMockZone();
            assignRefs(result, container, zone);

            // P1: pin
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });
            // P2: streaming
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: true, streamingText: 'hi' });
            // Scroll away
            act(() => { result.current.handleScroll(); }); // distanceFromBottom 1500 > 80 → away

            // Scroll back near bottom
            container.scrollTop = 1450; // distanceFromBottom = 2000 - 1450 - 500 = 50 ≤ 80
            act(() => { result.current.handleScroll(); });

            // Should re-pin (not idle) because streaming is active
            expect(result.current.isPinned).toBe(true);
        });

        it('goes to idle when returning near bottom after streaming ends', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ scrollTop: 0, scrollHeight: 2000, clientHeight: 500 });
            const zone = makeMockZone();
            const spacer = makeMockSpacer();
            assignRefs(result, container, zone, spacer);

            // P1 → P2 → P3 (streaming ends)
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: true, streamingText: 'hi' });
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: false });
            // Now idle, isPinned=false

            // Simulate being far from bottom
            container.scrollTop = 0;
            // But intent is already idle from P3, so this won't transition to away
            // Test that scrollToBottom resets everything:
            act(() => { result.current.scrollToBottom(); });
            expect(result.current.isPinned).toBe(false);
        });
    });

    describe('scrollToBottom', () => {
        it('returns to pinned view during streaming', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ scrollTop: 0, scrollHeight: 3000, clientHeight: 500 });
            // Zone at offsetTop 1500, getBoundingClientRect returns visual position
            const zone = makeMockZone({
                offsetTop: 1500,
                getBoundingClientRect: () => ({ top: 200, left: 0, right: 500, bottom: 460, width: 500, height: 260, x: 0, y: 0, toJSON: () => ({}) }),
            });
            assignRefs(result, container, zone);

            // P1: pin — useLayoutEffect sets scrollTop = 1500
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });
            // P2: streaming
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: true, streamingText: 'hi' });

            // Simulate user scrolled away, now clicking FAB
            container.scrollTop = 0;
            act(() => { result.current.scrollToBottom(); });

            // scrollTo called with zone position: scrollTop + zoneRect.top - containerRect.top = 0 + 200 - 0 = 200
            expect(container.scrollTo).toHaveBeenCalledWith({
                top: 200,
                behavior: 'smooth',
            });
            expect(result.current.isPinned).toBe(true);
        });

        it('scrolls to absolute bottom after streaming ends', () => {
            const { result } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 5, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ scrollHeight: 3000 });
            const spacer = makeMockSpacer();
            assignRefs(result, container, undefined, spacer);

            act(() => { result.current.scrollToBottom(); });

            expect(container.scrollTo).toHaveBeenCalledWith({
                top: 3000,
                behavior: 'smooth',
            });
            expect(result.current.isPinned).toBe(false);
            expect(spacer.style.minHeight).toBe('0px');
        });
    });

    describe('Full cycle — P1 pin, P2 streaming, P3 unpin', () => {
        it('completes full pin → stream → unpin cycle', () => {
            const { result, rerender } = renderHook(
                (props) => useChatScroll(props),
                { initialProps: { ...defaultOpts, messageCount: 3, lastMessageRole: 'model' } },
            );
            const container = makeMockContainer({ clientHeight: 500 });
            const zone = makeMockZone({ scrollHeight: 400 });
            const spacer = makeMockSpacer();
            assignRefs(result, container, zone, spacer);

            // 1. Initial: not pinned
            expect(result.current.isPinned).toBe(false);

            // 2. P1: user sends message → pinned
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user' });
            expect(result.current.isPinned).toBe(true);

            // 3. P2: streaming starts → stays pinned
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: true, streamingText: 'hello' });
            expect(result.current.isPinned).toBe(true);

            // 4. P2: streaming continues → stays pinned
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: true, streamingText: 'hello world' });
            expect(result.current.isPinned).toBe(true);

            // 5. P3: streaming ends → isPinned stays true (lazy cleanup)
            rerender({ ...defaultOpts, messageCount: 4, lastMessageRole: 'user', isStreaming: false, streamingText: null });
            expect(result.current.isPinned).toBe(true);

            // 6. scrollToBottom cleans up
            act(() => { result.current.scrollToBottom(); });
            expect(result.current.isPinned).toBe(false);
        });
    });
});
