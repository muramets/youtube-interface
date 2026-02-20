// =============================================================================
// imagePreloaderService — Browser image preloading utility.
//
// Separated from the store data layer because `new Image()` is a DOM/browser
// concern and should not live in a Zustand state slice.
//
// Usage:
//   import { preloadImages } from './imagePreloaderService';
//   await preloadImages(urls, { timeout: 700 });
// =============================================================================

/**
 * Preloads an array of image URLs by creating off-screen Image objects.
 * Resolves when all images load (or error), or when the timeout elapses —
 * whichever comes first. This prevents an eternal loading state if any
 * image request hangs.
 *
 * @param urls     Array of image URLs to preload.
 * @param options.timeout  Max wait time in ms before resolving anyway (default: 700).
 */
export function preloadImages(
    urls: string[],
    { timeout = 700 }: { timeout?: number } = {},
): Promise<void> {
    if (urls.length === 0) return Promise.resolve();

    const imageLoads = urls.map(
        (url) =>
            new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = img.onerror = () => resolve();
                img.src = url;
            }),
    );

    return Promise.race([
        Promise.all(imageLoads) as Promise<unknown>,
        new Promise<void>((resolve) => setTimeout(resolve, timeout)),
    ]) as Promise<void>;
}
