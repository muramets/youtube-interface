// =============================================================================
// uploadTrack handler — Upload audio track to channel's music library
//
// Flow:
//   1. Validate genre + tags against channel registry
//   2. Read local audio file(s), extract ID3 metadata (title, artist, BPM,
//      duration, embedded cover art)
//   3. Upload audio + cover to Firebase Storage (with download tokens)
//   4. Create Firestore track doc with empty peaks (frontend lazy-generates)
//
// Waveform peaks are NOT computed here — the client detects empty peaks
// on first render and computes them via Web Audio API.
// =============================================================================

import { admin, db } from "../../../../shared/db.js";
import type { ToolContext } from "../../types.js";
import { resolveTargetChannel, readMusicSettings, validateGenreAndTags } from "./musicLibrary.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractedMetadata {
    title?: string;
    artist?: string;
    bpm?: number;
    lyrics?: string;
    duration: number;
    cover?: { buffer: Buffer; mimeType: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function validateLocalFile(filePath: string): Promise<void> {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
        throw new Error(`Not a file: ${filePath}`);
    }
}

async function extractMetadata(filePath: string): Promise<ExtractedMetadata> {
    // music-metadata is ESM-only; use dynamic import from CJS build
    const mm = await import("music-metadata");
    const parsed = await mm.parseFile(filePath);
    const { common, format } = parsed;

    const firstPicture = common.picture?.[0];
    const cover = firstPicture
        ? {
            buffer: Buffer.from(firstPicture.data),
            mimeType: firstPicture.format || "image/jpeg",
        }
        : undefined;

    return {
        title: common.title || undefined,
        artist: common.artist || undefined,
        bpm: typeof common.bpm === "number" ? common.bpm : undefined,
        lyrics: Array.isArray(common.lyrics) && common.lyrics.length > 0
            ? common.lyrics.map((l) => typeof l === "string" ? l : l.text).join("\n")
            : undefined,
        duration: format.duration ?? 0,
        cover,
    };
}

function buildFirebaseDownloadUrl(
    bucketName: string,
    storagePath: string,
    token: string,
): string {
    const encoded = encodeURIComponent(storagePath);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

function mimeToExt(mime: string): string {
    const lower = mime.toLowerCase();
    if (lower.includes("png")) return "png";
    if (lower.includes("webp")) return "webp";
    if (lower.includes("gif")) return "gif";
    return "jpg";
}

async function uploadFileToStorage(
    localPath: string,
    storagePath: string,
    contentType: string,
    customMetadata: Record<string, string>,
): Promise<{ url: string; storagePath: string }> {
    const bucket = admin.storage().bucket();
    const token = crypto.randomUUID();
    await bucket.upload(localPath, {
        destination: storagePath,
        metadata: {
            contentType,
            cacheControl: "public,max-age=31536000",
            metadata: {
                ...customMetadata,
                firebaseStorageDownloadTokens: token,
            },
        },
    });
    return {
        url: buildFirebaseDownloadUrl(bucket.name, storagePath, token),
        storagePath,
    };
}

async function uploadBufferToStorage(
    buffer: Buffer,
    storagePath: string,
    contentType: string,
): Promise<{ url: string; storagePath: string }> {
    const bucket = admin.storage().bucket();
    const token = crypto.randomUUID();
    const file = bucket.file(storagePath);
    await file.save(buffer, {
        contentType,
        metadata: {
            cacheControl: "public,max-age=31536000",
            metadata: {
                firebaseStorageDownloadTokens: token,
            },
        },
    });
    return {
        url: buildFirebaseDownloadUrl(bucket.name, storagePath, token),
        storagePath,
    };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleUploadTrack(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const uploadedStoragePaths: string[] = [];

    try {
        // --- Parse args ---
        const vocalPath = typeof args.vocalPath === "string" ? args.vocalPath.trim() : undefined;
        const instrumentalPath = typeof args.instrumentalPath === "string" ? args.instrumentalPath.trim() : undefined;
        const genre = typeof args.genre === "string" ? args.genre.trim() : "";
        const tagsArg = Array.isArray(args.tags) ? (args.tags as unknown[]).filter((t) => typeof t === "string") as string[] : [];
        const titleArg = typeof args.title === "string" ? args.title.trim() : undefined;
        const artistArg = typeof args.artist === "string" ? args.artist.trim() : undefined;
        const bpmArg = typeof args.bpm === "number" ? args.bpm : undefined;
        const lyricsArg = typeof args.lyrics === "string" ? args.lyrics : undefined;
        const promptArg = typeof args.prompt === "string" ? args.prompt : undefined;

        if (!vocalPath && !instrumentalPath) {
            return { error: "At least one of vocalPath or instrumentalPath is required." };
        }
        if (!genre) return { error: "genre is required." };

        // --- Resolve target channel + validate genre/tags ---
        const { userId, channelId, basePath, settingsDocPath } = resolveTargetChannel(ctx, args.targetChannelId);
        const settings = await readMusicSettings(settingsDocPath);

        const validationError = validateGenreAndTags(settings, genre, tagsArg);
        if (validationError) return { error: validationError };

        // --- Validate file paths ---
        if (vocalPath) await validateLocalFile(vocalPath);
        if (instrumentalPath) await validateLocalFile(instrumentalPath);

        // --- Extract metadata from first available file (prefer vocal) ---
        const primaryPath = vocalPath ?? instrumentalPath!;
        const metadata = await extractMetadata(primaryPath);

        const title = titleArg || metadata.title || path.basename(primaryPath, path.extname(primaryPath));
        const artist = artistArg || metadata.artist;
        const bpm = bpmArg ?? metadata.bpm;
        const lyrics = lyricsArg ?? metadata.lyrics;

        // --- Generate trackId + prepare storage paths ---
        const trackId = crypto.randomUUID();
        const tracksFolder = `users/${userId}/channels/${channelId}/tracks/${trackId}`;

        // --- Upload audio files ---
        ctx.reportProgress?.("Uploading audio to Storage...");

        let vocalUpload: { url: string; storagePath: string; fileName: string } | undefined;
        let instrumentalUpload: { url: string; storagePath: string; fileName: string } | undefined;

        if (vocalPath) {
            const ext = path.extname(vocalPath).slice(1) || "mp3";
            const result = await uploadFileToStorage(
                vocalPath,
                `${tracksFolder}/vocal.${ext}`,
                `audio/${ext === "mp3" ? "mpeg" : ext}`,
                {
                    originalFilename: path.basename(vocalPath),
                    variant: "vocal",
                    uploadedAt: new Date().toISOString(),
                },
            );
            uploadedStoragePaths.push(result.storagePath);
            vocalUpload = { ...result, fileName: path.basename(vocalPath) };
        }

        if (instrumentalPath) {
            const ext = path.extname(instrumentalPath).slice(1) || "mp3";
            const result = await uploadFileToStorage(
                instrumentalPath,
                `${tracksFolder}/instrumental.${ext}`,
                `audio/${ext === "mp3" ? "mpeg" : ext}`,
                {
                    originalFilename: path.basename(instrumentalPath),
                    variant: "instrumental",
                    uploadedAt: new Date().toISOString(),
                },
            );
            uploadedStoragePaths.push(result.storagePath);
            instrumentalUpload = { ...result, fileName: path.basename(instrumentalPath) };
        }

        // --- Upload embedded cover if present ---
        let coverUpload: { url: string; storagePath: string } | undefined;
        if (metadata.cover) {
            ctx.reportProgress?.("Uploading embedded cover...");
            const ext = mimeToExt(metadata.cover.mimeType);
            coverUpload = await uploadBufferToStorage(
                metadata.cover.buffer,
                `${tracksFolder}/cover.${ext}`,
                metadata.cover.mimeType,
            );
            uploadedStoragePaths.push(coverUpload.storagePath);
        }

        // --- Build Firestore track document ---
        const now = Date.now();
        // Peaks are intentionally omitted — the frontend detects missing peaks and
        // lazily generates them on first render (empty array would also work, but
        // missing field is cleaner and matches what trimAudioFile does via FieldValue.delete()).
        const trackDoc: Record<string, unknown> = {
            id: trackId,
            title,
            genre,
            tags: tagsArg,
            duration: metadata.duration,
            createdAt: now,
            updatedAt: now,
        };
        if (artist) trackDoc.artist = artist;
        if (typeof bpm === "number") trackDoc.bpm = bpm;
        if (lyrics) trackDoc.lyrics = lyrics;
        if (promptArg) trackDoc.prompt = promptArg;
        if (vocalUpload) {
            trackDoc.vocalUrl = vocalUpload.url;
            trackDoc.vocalStoragePath = vocalUpload.storagePath;
            trackDoc.vocalFileName = vocalUpload.fileName;
        }
        if (instrumentalUpload) {
            trackDoc.instrumentalUrl = instrumentalUpload.url;
            trackDoc.instrumentalStoragePath = instrumentalUpload.storagePath;
            trackDoc.instrumentalFileName = instrumentalUpload.fileName;
        }
        if (coverUpload) {
            trackDoc.coverUrl = coverUpload.url;
            trackDoc.coverStoragePath = coverUpload.storagePath;
        }

        ctx.reportProgress?.("Writing Firestore document...");
        await db.doc(`${basePath}/tracks/${trackId}`).set(trackDoc);

        return {
            success: true,
            trackId,
            channelId,
            title,
            artist: artist ?? null,
            genre,
            tags: tagsArg,
            bpm: bpm ?? null,
            duration: metadata.duration,
            hasVocal: Boolean(vocalUpload),
            hasInstrumental: Boolean(instrumentalUpload),
            hasCover: Boolean(coverUpload),
            note: "Waveform peaks will be generated by the frontend on first open.",
        };
    } catch (err) {
        // Best-effort cleanup: remove any uploaded Storage files so we don't leave orphans
        if (uploadedStoragePaths.length > 0) {
            const bucket = admin.storage().bucket();
            await Promise.all(
                uploadedStoragePaths.map((p) =>
                    bucket.file(p).delete().catch(() => { /* ignore */ }),
                ),
            );
        }
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Failed to upload track: ${message}` };
    }
}
