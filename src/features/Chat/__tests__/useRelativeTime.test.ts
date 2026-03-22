import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _testApi } from '../useRelativeTime';

const { subscribe } = _testApi;

describe('useRelativeTime shared clock', () => {
    // Track all subscriptions for guaranteed cleanup
    let cleanups: Array<() => void>;

    beforeEach(() => {
        vi.useFakeTimers();
        cleanups = [];
    });

    afterEach(() => {
        // Unsubscribe all to reset module state between tests
        cleanups.forEach((fn) => fn());
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function track(unsub: () => void) {
        cleanups.push(unsub);
        return unsub;
    }

    it('starts interval on first subscriber, stops on last unsubscribe', () => {
        const setIntervalSpy = vi.spyOn(global, 'setInterval');
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

        const unsub1 = track(subscribe(() => {}));
        expect(setIntervalSpy).toHaveBeenCalledTimes(1);
        expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);

        // Second subscriber reuses the same interval
        const unsub2 = track(subscribe(() => {}));
        expect(setIntervalSpy).toHaveBeenCalledTimes(1);

        // First unsubscribe — clock still running (1 listener left)
        unsub1();
        cleanups = cleanups.filter((fn) => fn !== unsub1);
        expect(clearIntervalSpy).not.toHaveBeenCalled();

        // Last unsubscribe — clock stops
        unsub2();
        cleanups = cleanups.filter((fn) => fn !== unsub2);
        expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    });

    it('notifies all subscribers simultaneously on tick', () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        track(subscribe(listener1));
        track(subscribe(listener2));
        track(subscribe(listener3));

        expect(listener1).not.toHaveBeenCalled();

        // One tick — all three fire together
        vi.advanceTimersByTime(60_000);
        expect(listener1).toHaveBeenCalledTimes(1);
        expect(listener2).toHaveBeenCalledTimes(1);
        expect(listener3).toHaveBeenCalledTimes(1);

        // Second tick — all three again
        vi.advanceTimersByTime(60_000);
        expect(listener1).toHaveBeenCalledTimes(2);
        expect(listener2).toHaveBeenCalledTimes(2);
        expect(listener3).toHaveBeenCalledTimes(2);
    });

    it('does not leak interval after all subscribers unsubscribe', () => {
        const listener = vi.fn();

        const unsub = subscribe(listener);
        unsub();

        // Clock is stopped — no calls even after 2 minutes
        vi.advanceTimersByTime(120_000);
        expect(listener).not.toHaveBeenCalled();
    });
});
