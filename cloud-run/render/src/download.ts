/**
 * download.ts — File download helpers for render pipeline.
 *
 * Downloads audio tracks from Firebase Storage and cover images via HTTP.
 */
import { getStorage } from 'firebase-admin/storage';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

// Lazy init — getStorage() must be called AFTER initializeApp() in index.ts.
// ESM evaluates imports before the importing module's code runs,
// so top-level getStorage() would crash with "no default app".
let _storage: ReturnType<typeof getStorage> | null = null;
function storage() {
    if (!_storage) _storage = getStorage();
    return _storage;
}

/**
 * Download a file from Firebase Storage to local disk.
 */
export async function downloadFromStorage(storagePath: string, localPath: string): Promise<void> {
    const bucket = storage().bucket();
    const file = bucket.file(storagePath);

    const readStream = file.createReadStream();
    const writeStream = createWriteStream(localPath);
    await pipeline(readStream, writeStream);
}

/**
 * Download a file from any HTTP URL to local disk.
 * Works with Firebase Storage download URLs, YouTube thumbnails, etc.
 */
export async function downloadFromUrl(url: string, localPath: string): Promise<void> {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok || !res.body) {
        throw new Error(`Failed to download image: HTTP ${res.status}`);
    }

    const writeStream = createWriteStream(localPath);
    // Node 18+ fetch returns a web ReadableStream; convert to Node stream for pipeline
    const { Readable } = await import('node:stream');
    const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream);
    await pipeline(nodeStream, writeStream);
}
