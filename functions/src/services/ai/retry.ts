// =============================================================================
// AI Retry — Generic retry logic for streaming AI calls
//
// Provider-agnostic retry logic for streaming AI calls.
// Each provider supplies its own `isTransient` predicate.
// =============================================================================

// --- Custom error for stream inactivity timeout ---

/**
 * Thrown when the AI model stream stalls (no chunks within the timeout window).
 * Providers should use this as a standard timeout signal.
 */
export class AiStreamTimeoutError extends Error {
    /** True when thinking events were received before the timeout — retry is pointless. */
    readonly hadThinkingProgress: boolean;
    /** Input tokens captured from the "message" event (available even on timeout). */
    readonly earlyInputTokens?: number;
    /** Cache read tokens captured from the "message" event. */
    readonly earlyCacheRead?: number;
    /** Cache write tokens captured from the "message" event. */
    readonly earlyCacheWrite?: number;

    constructor(
        message = "AI model did not respond within the timeout window. Please try again.",
        opts?: {
            hadThinkingProgress?: boolean;
            earlyInputTokens?: number;
            earlyCacheRead?: number;
            earlyCacheWrite?: number;
        },
    ) {
        super(message);
        this.name = "AiStreamTimeoutError";
        this.hadThinkingProgress = opts?.hadThinkingProgress ?? false;
        this.earlyInputTokens = opts?.earlyInputTokens;
        this.earlyCacheRead = opts?.earlyCacheRead;
        this.earlyCacheWrite = opts?.earlyCacheWrite;
    }
}

// --- Retry options ---

export interface StreamRetryOpts {
    /** Maximum number of retries (not counting the initial attempt). */
    maxRetries: number;
    /** Provider-specific predicate: returns true if the error is transient and safe to retry. */
    isTransient: (err: unknown) => boolean;
    /** Delay in ms before retrying (applied to all transient errors). Defaults to 2000. */
    delayMs?: number;
    /** Optional per-error delay override (e.g., longer wait for rate limits). Takes precedence over delayMs. */
    getRetryDelay?: (err: unknown) => number | undefined;
    /** Called on each retry attempt (1-indexed). */
    onRetry?: (attempt: number) => void;
    /** AbortSignal for caller-initiated cancellation — skips retry if aborted. */
    signal?: AbortSignal;
}

// --- Generic retry wrapper ---

/**
 * Execute `fn` with automatic retries on transient errors.
 *
 * Flow:
 *   1. Call fn()
 *   2. If it throws and isTransient(err) === true:
 *      - If caller has aborted (signal.aborted) → re-throw immediately
 *      - If attempts remain → wait delayMs, call onRetry, try again
 *      - If exhausted → re-throw
 *   3. If it throws and isTransient(err) === false → re-throw immediately
 *   4. On success → return result
 */
export async function withStreamRetry<T>(
    fn: () => Promise<T>,
    opts: StreamRetryOpts,
): Promise<T> {
    const { maxRetries, isTransient, delayMs = 2_000, getRetryDelay, onRetry, signal } = opts;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (err) {
            // Non-transient errors propagate immediately
            if (!isTransient(err)) throw err;

            // If the caller cancelled, don't retry — propagate immediately
            if (signal?.aborted) throw err;

            // If we have retries left, wait and try again
            if (attempt <= maxRetries) {
                console.log(
                    `[withStreamRetry] Retry attempt ${attempt}/${maxRetries} after transient error`,
                );
                const effectiveDelay = getRetryDelay?.(err) ?? delayMs;
                if (effectiveDelay > 0) {
                    await new Promise((r) => setTimeout(r, effectiveDelay));
                }
                onRetry?.(attempt);
                continue;
            }

            // Exhausted all retries — propagate
            throw err;
        }
    }

    // Unreachable — TypeScript needs this for exhaustive return
    throw new Error("[withStreamRetry] Unexpected: retry loop exited without return or throw");
}
