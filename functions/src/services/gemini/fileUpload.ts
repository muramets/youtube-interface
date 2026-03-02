// =============================================================================
// File Upload — Gemini Files API helpers
// =============================================================================

import { getClient } from "./client.js";

export async function uploadToGemini(
    apiKey: string,
    fileOrBlob: File | Blob,
    mimeType: string,
    displayName?: string
): Promise<{ uri: string; expiryMs: number }> {
    const ai = await getClient(apiKey);
    const uploaded = await ai.files.upload({
        file: fileOrBlob,
        config: { mimeType, displayName },
    });
    if (!uploaded.uri) throw new Error("Gemini File API did not return a URI");
    const expiryMs = uploaded.expirationTime
        ? new Date(uploaded.expirationTime).getTime()
        : Date.now() + 48 * 60 * 60 * 1000;
    return { uri: uploaded.uri, expiryMs };
}

/**
 * Download file from Firebase Storage URL and re-upload to Gemini.
 */
export async function reuploadFromStorage(
    apiKey: string,
    storageUrl: string,
    mimeType: string,
    name: string
): Promise<{ uri: string; expiryMs: number }> {
    const response = await fetch(storageUrl);
    const blob = await response.blob();
    return uploadToGemini(apiKey, blob, mimeType, name);
}

/**
 * Upload a file to Gemini from a Firebase Storage path (server-side, no URL needed).
 */
export async function uploadFromStoragePath(
    apiKey: string,
    storagePath: string,
    mimeType: string,
    displayName: string
): Promise<{ uri: string; expiryMs: number }> {
    const admin = await import("firebase-admin");
    const bucket = admin.default.storage().bucket();
    const file = bucket.file(storagePath);
    const [buffer] = await file.download();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    return uploadToGemini(apiKey, blob, mimeType, displayName);
}
