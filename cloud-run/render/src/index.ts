/**
 * index.ts — Cloud Run Job entry point for video rendering (orchestrator)
 *
 * Lifecycle:
 * 1. Read render parameters from environment variables
 * 2. Pre-flight cancellation check
 * 3. Atomic status transition (queued → rendering)
 * 4. Download audio tracks + cover image from Firebase Storage
 * 5. Run ffmpeg to produce MP4
 * 6. Upload result to Cloudflare R2
 * 7. Update Firestore render job document with download URL + expiry
 * 8. Clean up temp files and exit
 *
 * Environment variables (set by Cloud Tasks when creating the job):
 * - RENDER_ID: unique render job identifier
 * - USER_ID: Firebase Auth UID
 * - CHANNEL_ID: user channel ID
 * - VIDEO_ID: video document ID
 * - RENDER_PARAMS_JSON: JSON-encoded render parameters
 * - R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME
 * - FIREBASE_STORAGE_BUCKET: Firebase Storage bucket (env var or hardcoded fallback)
 * - GOOGLE_CLOUD_PROJECT: auto-injected by Cloud Run
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { S3Client, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';

import { renderWithFfmpeg, BITRATE_MAP, RESOLUTION_MAP, type TrackInput } from './ffmpeg.js';
import { log, logError } from './logger.js';
import { downloadFromStorage, downloadFromUrl } from './download.js';
import { uploadToR2 } from './upload.js';

// ─── Types ─────────────────────────────────────────────────────────────

interface RenderTrackParam {
    audioStoragePath: string;  // Firebase Storage path
    volume: number;
    trimStart: number;
    trimEnd: number;
    duration: number;
    title: string;
}

// Duplicated from src/core/types/editing.ts — Cloud Run has no access to shared/.
type RenderResolution = '720p' | '1080p' | '1440p' | '4k';

interface RenderParamsPayload {
    imageUrl: string;          // HTTP download URL for cover image
    tracks: RenderTrackParam[];
    resolution: RenderResolution;
    loopCount: number;
    masterVolume: number;
    videoTitle: string;
}

// ─── Init ──────────────────────────────────────────────────────────────

const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
if (!storageBucket) {
    throw new Error('FIREBASE_STORAGE_BUCKET env var is required');
}

if (getApps().length === 0) {
    initializeApp({ storageBucket });
}

const db = getFirestore();

function getR2Client(): S3Client {
    return new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
    const renderId = process.env.RENDER_ID;
    const userId = process.env.USER_ID;
    const channelId = process.env.CHANNEL_ID;
    const videoId = process.env.VIDEO_ID;
    const paramsJson = process.env.RENDER_PARAMS_JSON;

    if (!renderId || !userId || !channelId || !videoId || !paramsJson) {
        throw new Error('Missing required environment variables');
    }

    const params: RenderParamsPayload = JSON.parse(paramsJson);
    const renderDocPath = `users/${userId}/channels/${channelId}/videos/${videoId}/renders/${renderId}`;
    const renderRef = db.doc(renderDocPath);

    log('start', { videoId, resolution: params.resolution, trackCount: params.tracks.length });

    // Signal to client: container is alive
    await renderRef.update({ stage: 'initializing' });

    let cancelListenerUnsub: (() => void) | null = null;

    try {
        // ── 1. Idempotency check ───────────────────────────────────────
        await renderRef.update({ stage: 'loading_params' });

        const r2Key = `renders/${renderId}.mp4`;
        const r2 = getR2Client();
        const bucketName = process.env.R2_BUCKET_NAME!;

        try {
            await r2.send(new HeadObjectCommand({ Bucket: bucketName, Key: r2Key }));
            // File already exists — skip render, just update Firestore
            log('idempotency_skip', { r2Key });

            const downloadUrl = await getSignedUrl(
                r2,
                new GetObjectCommand({ Bucket: bucketName, Key: r2Key }),
                { expiresIn: 86400 }, // 24 hours
            );

            await renderRef.update({
                status: 'complete',
                progress: 100,
                downloadUrl,
                completedAt: FieldValue.serverTimestamp(),
            });

            log('complete_idempotent');
            return;
        } catch {
            // File doesn't exist — proceed with render
        }

        // ── 2. Pre-flight cancellation check ─────────────────────────────
        // If cancelled while waiting in Cloud Tasks queue, exit immediately
        const preflightSnap = await renderRef.get();
        if (preflightSnap.exists && preflightSnap.data()?.status === 'cancelled') {
            log('cancelled_prestart');
            return;
        }

        // ── 3. Set up cancellation listener ──────────────────────────────
        const abortController = new AbortController();

        cancelListenerUnsub = renderRef.onSnapshot((snap) => {
            if (snap.exists && snap.data()?.status === 'cancelled') {
                log('cancellation_received');
                abortController.abort();
            }
        });

        // Helper: throw if abort signal fired (call between every phase)
        const checkAbort = () => {
            if (abortController.signal.aborted) throw new Error('RENDER_CANCELLED');
        };

        // ── 4. Atomic status transition (queued → rendering) ─────────────
        // Uses transaction to prevent overwriting 'cancelled' status
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(renderRef);
            const currentStatus = snap.data()?.status;
            if (currentStatus === 'cancelled') {
                throw new Error('RENDER_CANCELLED');
            }
            tx.update(renderRef, {
                status: 'rendering',
                stage: 'downloading',
                progress: 0,
                startedAt: FieldValue.serverTimestamp(),
            });
        });

        // ── 5. Download files from Firebase Storage ────────────────────
        const tmpDir = '/tmp/render';
        mkdirSync(tmpDir, { recursive: true });

        log('download_start');

        // Download cover image (via HTTP URL — works with Firebase Storage, YouTube, etc.)
        const imagePath = path.join(tmpDir, 'cover.jpg');
        await downloadFromUrl(params.imageUrl, imagePath);

        // Download audio tracks
        const trackInputs: TrackInput[] = [];
        await Promise.all(params.tracks.map(async (track, i) => {
            const ext = path.extname(track.audioStoragePath) || '.mp3';
            const trackPath = path.join(tmpDir, `track_${i}${ext}`);
            await downloadFromStorage(track.audioStoragePath, trackPath);

            trackInputs[i] = {
                filePath: trackPath,
                volume: track.volume,
                trimStart: track.trimStart,
                trimEnd: track.trimEnd,
                duration: track.duration,
            };
        }));

        log('download_complete', { trackCount: trackInputs.length });

        // Check cancellation after download phase
        checkAbort();

        // ── 6. Run ffmpeg ──────────────────────────────────────────────
        if (!(params.resolution in RESOLUTION_MAP)) {
            throw new Error(`Invalid resolution: "${params.resolution}". Expected one of: ${Object.keys(RESOLUTION_MAP).join(', ')}`);
        }
        const res = RESOLUTION_MAP[params.resolution];
        const bitrate = BITRATE_MAP[params.resolution];
        const outputPath = path.join(tmpDir, 'output.mp4');

        // Update stage to encoding before ffmpeg
        await renderRef.update({ stage: 'encoding' });

        // Progress: throttled Firestore updates (max every 500ms for smooth UX)
        let lastProgressUpdate = 0;
        const PROGRESS_THROTTLE_MS = 500;

        const encodeT0 = Date.now();
        log('ffmpeg_start', { width: res.width, height: res.height, bitrate });

        await renderWithFfmpeg({
            imagePath,
            tracks: trackInputs,
            width: res.width,
            height: res.height,
            videoBitrate: bitrate,
            loopCount: params.loopCount,
            masterVolume: params.masterVolume,
            outputPath,
            abortSignal: abortController.signal,
            onProgress: (pct) => {
                const now = Date.now();
                if (now - lastProgressUpdate > PROGRESS_THROTTLE_MS) {
                    lastProgressUpdate = now;
                    renderRef.update({ progress: pct }).catch((e) => {
                        logError('progress_update_failed', e);
                    });
                }
            },
            onDiagnostic: (diag) => {
                log('ffmpeg_diag', { ...diag });
            },
        });

        const encodeDurationSec = Math.round((Date.now() - encodeT0) / 1000);
        log('ffmpeg_complete', { encodeDurationSec });

        // Check cancellation after encoding phase
        checkAbort();

        // ── 7. Upload to R2 ────────────────────────────────────────────
        await renderRef.update({ stage: 'uploading', progress: 100 });
        log('upload_start');

        const fileStat = statSync(outputPath);

        await uploadToR2({
            r2,
            bucket: bucketName,
            key: r2Key,
            filePath: outputPath,
            fileSize: fileStat.size,
            contentType: 'video/mp4',
            contentDisposition: `attachment; filename="${encodeURIComponent(params.videoTitle)}.mp4"`,
            log,
        });

        // Check cancellation after upload phase
        checkAbort();

        // Generate signed download URL (24 hours — matches R2 lifecycle policy)
        await renderRef.update({ stage: 'finalizing' });
        const downloadUrl = await getSignedUrl(
            r2,
            new GetObjectCommand({ Bucket: bucketName, Key: r2Key }),
            { expiresIn: 86400 },
        );

        log('upload_complete', { r2Key, sizeBytes: fileStat.size });

        // ── 8. Update Firestore ────────────────────────────────────────
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await renderRef.update({
            status: 'complete',
            progress: 100,
            downloadUrl,
            fileSizeBytes: fileStat.size,
            expiresAt,
            completedAt: FieldValue.serverTimestamp(),
        });

        log('complete', { sizeBytes: fileStat.size });

        // ── 8b. Create render preset (decoupled from render lifecycle) ──
        checkAbort(); // Guard against late cancellation between upload and preset creation
        const MAX_PRESETS = 20;
        const presetsCol = db.collection(
            `users/${userId}/channels/${channelId}/renderPresets`,
        );

        try {
            await presetsCol.doc(renderId).set({
                renderId,
                videoId,
                videoTitle: params.videoTitle || 'Untitled',
                imageUrl: params.imageUrl || '',
                completedAt: FieldValue.serverTimestamp(),
                tracks: params.tracks.map((t) => ({
                    title: t.title || '',
                    volume: t.volume,
                    trimStart: t.trimStart,
                    trimEnd: t.trimEnd,
                    duration: t.duration,
                    audioStoragePath: t.audioStoragePath,
                })),
                resolution: params.resolution,
                loopCount: params.loopCount,
                masterVolume: params.masterVolume,
            });

            // Sliding window: prune oldest beyond MAX_PRESETS
            const allPresets = await presetsCol
                .orderBy('completedAt', 'desc')
                .get();

            if (allPresets.size > MAX_PRESETS) {
                const batch = db.batch();
                allPresets.docs.slice(MAX_PRESETS).forEach((d) => batch.delete(d.ref));
                await batch.commit();
                log('presets_pruned', { deleted: allPresets.size - MAX_PRESETS });
            }

            log('preset_created', { presetId: renderId });
        } catch (presetErr) {
            // Non-critical — don't fail the render if preset creation fails
            logError('preset_creation_failed', presetErr);
        }

        // ── 9. Cleanup ─────────────────────────────────────────────────
        cancelListenerUnsub?.();
        rmSync(tmpDir, { recursive: true, force: true });

    } catch (error) {
        cancelListenerUnsub?.();

        const isCancelled = error instanceof Error && error.message === 'RENDER_CANCELLED';

        if (isCancelled) {
            log('cancelled_cleanup');
            rmSync('/tmp/render', { recursive: true, force: true });
            // Firestore already has status='cancelled' (set by the Cloud Function)
            // Return cleanly — allows proper Firestore flush and log delivery
            return;
        }

        logError('failed', error);

        // Update Firestore with error status
        try {
            await renderRef.update({
                status: 'render_failed',
                error: error instanceof Error ? error.message : 'Unknown error',
                failedAt: FieldValue.serverTimestamp(),
            });
        } catch (updateErr) {
            logError('firestore_update_failed', updateErr);
        }

        // Non-zero exit for Cloud Tasks retry
        process.exitCode = 1;
    }
}

// ─── Run ───────────────────────────────────────────────────────────────

main().catch((err) => {
    logError('unhandled_error', err);
    process.exit(1);
});
