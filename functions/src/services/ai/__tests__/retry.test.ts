// =============================================================================
// AI Retry — unit tests for withStreamRetry() and AiStreamTimeoutError
//
// Pure logic tests — no mocks required. Uses fake async functions to simulate
// transient/non-transient errors, abort signals, and retry exhaustion.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withStreamRetry, AiStreamTimeoutError } from "../retry.js";
import type { StreamRetryOpts } from "../retry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a function that fails `failCount` times with `error`, then resolves with `value`. */
function makeFailThenSucceed<T>(failCount: number, error: Error, value: T): () => Promise<T> {
    let calls = 0;
    return () => {
        calls++;
        if (calls <= failCount) {
            return Promise.reject(error);
        }
        return Promise.resolve(value);
    };
}

/** Always-transient predicate — every error is retryable. */
const alwaysTransient = () => true;

/** Never-transient predicate — no error is retryable. */
const neverTransient = () => false;

/** Standard opts factory with zero delay to keep tests fast. */
function makeOpts(overrides: Partial<StreamRetryOpts> = {}): StreamRetryOpts {
    return {
        maxRetries: 2,
        isTransient: alwaysTransient,
        delayMs: 0,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AiStreamTimeoutError", () => {
    it("is an instance of Error", () => {
        const err = new AiStreamTimeoutError();
        expect(err).toBeInstanceOf(Error);
    });

    it("has the name property set to 'AiStreamTimeoutError'", () => {
        const err = new AiStreamTimeoutError();
        expect(err.name).toBe("AiStreamTimeoutError");
    });

    it("uses a default message when none is provided", () => {
        const err = new AiStreamTimeoutError();
        expect(err.message).toBe(
            "AI model did not respond within the timeout window. Please try again.",
        );
    });

    it("accepts a custom message", () => {
        const err = new AiStreamTimeoutError("custom timeout");
        expect(err.message).toBe("custom timeout");
    });

    it("hadThinkingProgress defaults to false", () => {
        const err = new AiStreamTimeoutError();
        expect(err.hadThinkingProgress).toBe(false);
    });

    it("hadThinkingProgress can be set to true via opts", () => {
        const err = new AiStreamTimeoutError("timeout", { hadThinkingProgress: true });
        expect(err.hadThinkingProgress).toBe(true);
    });

    it("stores earlyInputTokens/earlyCacheRead/earlyCacheWrite from opts", () => {
        const err = new AiStreamTimeoutError("timeout", {
            hadThinkingProgress: true,
            earlyInputTokens: 5000,
            earlyCacheRead: 3000,
            earlyCacheWrite: 1000,
        });
        expect(err.earlyInputTokens).toBe(5000);
        expect(err.earlyCacheRead).toBe(3000);
        expect(err.earlyCacheWrite).toBe(1000);
    });

    it("backward compat: new AiStreamTimeoutError() works without opts", () => {
        const err = new AiStreamTimeoutError();
        expect(err.hadThinkingProgress).toBe(false);
        expect(err.earlyInputTokens).toBeUndefined();
        expect(err.earlyCacheRead).toBeUndefined();
        expect(err.earlyCacheWrite).toBeUndefined();
    });

    it("backward compat: new AiStreamTimeoutError('msg') works without opts", () => {
        const err = new AiStreamTimeoutError("custom msg");
        expect(err.message).toBe("custom msg");
        expect(err.hadThinkingProgress).toBe(false);
    });
});

describe("withStreamRetry", () => {
    it("returns result on first try without calling onRetry", async () => {
        const onRetry = vi.fn();
        const fn = vi.fn().mockResolvedValue("success");

        const result = await withStreamRetry(fn, makeOpts({ onRetry }));

        expect(result).toBe("success");
        expect(fn).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
    });

    it("retries on transient errors and returns result on success", async () => {
        const onRetry = vi.fn();
        const transientError = new Error("transient");
        const fn = makeFailThenSucceed(2, transientError, "recovered");

        const result = await withStreamRetry(fn, makeOpts({ onRetry }));

        expect(result).toBe("recovered");
        expect(onRetry).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenNthCalledWith(1, 1);
        expect(onRetry).toHaveBeenNthCalledWith(2, 2);
    });

    it("throws the last error after exhausting all retries", async () => {
        const onRetry = vi.fn();
        const transientError = new Error("always fails");
        const fn = vi.fn().mockRejectedValue(transientError);

        await expect(
            withStreamRetry(fn, makeOpts({ maxRetries: 2, onRetry })),
        ).rejects.toThrow(transientError);

        // Initial attempt + 2 retries = 3 total calls
        expect(fn).toHaveBeenCalledTimes(3);
        expect(onRetry).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenNthCalledWith(1, 1);
        expect(onRetry).toHaveBeenNthCalledWith(2, 2);
    });

    it("throws immediately on non-transient errors without retrying", async () => {
        const onRetry = vi.fn();
        const fatalError = new Error("fatal");
        const fn = vi.fn().mockRejectedValue(fatalError);

        await expect(
            withStreamRetry(fn, makeOpts({ isTransient: neverTransient, onRetry })),
        ).rejects.toThrow(fatalError);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
    });

    it("throws immediately when signal is aborted, even for transient errors", async () => {
        const onRetry = vi.fn();
        const controller = new AbortController();
        controller.abort(); // Pre-abort

        const transientError = new Error("transient");
        const fn = vi.fn().mockRejectedValue(transientError);

        await expect(
            withStreamRetry(
                fn,
                makeOpts({ onRetry, signal: controller.signal }),
            ),
        ).rejects.toThrow(transientError);

        // Only the first attempt — abort prevents retry
        expect(fn).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
    });

    it("throws when signal is aborted between retries", async () => {
        const onRetry = vi.fn();
        const controller = new AbortController();
        const transientError = new Error("transient");

        let callCount = 0;
        const fn = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.reject(transientError);
            }
            // After first retry delay + onRetry, abort before next attempt
            controller.abort();
            return Promise.reject(transientError);
        });

        await expect(
            withStreamRetry(
                fn,
                makeOpts({ maxRetries: 3, onRetry, signal: controller.signal }),
            ),
        ).rejects.toThrow(transientError);

        // First attempt fails, first retry fires onRetry(1), second attempt fails + aborts,
        // then abort check prevents further retry
        expect(fn).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    describe("delay behavior", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("respects custom delayMs between retries", async () => {
            const transientError = new Error("transient");
            const fn = makeFailThenSucceed(1, transientError, "ok");

            const resultPromise = withStreamRetry(
                fn,
                makeOpts({ delayMs: 5_000 }),
            );

            // Advance past the 5s delay
            await vi.advanceTimersByTimeAsync(5_000);

            const result = await resultPromise;
            expect(result).toBe("ok");
        });

        it("skips delay when delayMs is 0", async () => {
            const transientError = new Error("transient");
            const fn = makeFailThenSucceed(1, transientError, "ok");

            // With delayMs: 0, this should resolve without needing timer advancement
            const result = await withStreamRetry(fn, makeOpts({ delayMs: 0 }));
            expect(result).toBe("ok");
        });

        it("uses default delayMs of 2000 when not specified", async () => {
            const transientError = new Error("transient");
            const fn = makeFailThenSucceed(1, transientError, "ok");

            const resultPromise = withStreamRetry(fn, {
                maxRetries: 2,
                isTransient: alwaysTransient,
                // delayMs not specified — should default to 2000
            });

            // Advancing by 1999ms should NOT resolve it yet
            await vi.advanceTimersByTimeAsync(1_999);

            // Advancing past 2000ms should let it resolve
            await vi.advanceTimersByTimeAsync(1);

            const result = await resultPromise;
            expect(result).toBe("ok");
        });
    });

    it("works with maxRetries set to 0 (no retries allowed)", async () => {
        const onRetry = vi.fn();
        const transientError = new Error("transient");
        const fn = vi.fn().mockRejectedValue(transientError);

        await expect(
            withStreamRetry(fn, makeOpts({ maxRetries: 0, onRetry })),
        ).rejects.toThrow(transientError);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
    });

    it("does not call onRetry if it is not provided", async () => {
        const transientError = new Error("transient");
        const fn = makeFailThenSucceed(1, transientError, "ok");

        // Should not throw — onRetry is optional
        const result = await withStreamRetry(fn, makeOpts({ onRetry: undefined }));
        expect(result).toBe("ok");
    });

});
