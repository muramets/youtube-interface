/**
 * audio/trimAudioFile.ts — Trim an audio track and optionally apply Bezier fade-out.
 *
 * Downloads the file from Firebase Storage, processes with FFmpeg, overwrites
 * the original, and updates the Firestore track document.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../shared/db.js";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Point fluent-ffmpeg to the bundled binary
ffmpeg.setFfmpegPath(ffmpegPath.path);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrimRequest {
    trackId: string;
    channelId: string;
    variant: "vocal" | "instrumental";
    trimStartSec: number;
    trimEndSec: number;
    fadeOut?: {
        startSec: number;      // absolute time where fade begins (after trim offset)
        durationSec: number;   // fade duration in seconds
        curvature: number;     // -1..1 — maps to Bezier control point
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the Bezier-based volume expression for FFmpeg.
 * Matches the frontend rAF tick formula exactly:
 *   gain = (1-p)² + 2·(1-p)·p·pc   where pc = 0.5 + curvature * 0.5
 *
 * FFmpeg `volume` filter with `eval=frame` evaluates the expression per frame.
 */
function buildBezierVolumeFilter(
    fadeStartSec: number,
    fadeDurationSec: number,
    curvature: number,
): string {
    const pc = (0.5 + curvature * 0.5).toFixed(6);
    const fStart = fadeStartSec.toFixed(6);
    const fd = fadeDurationSec.toFixed(6);

    // p = progress through fade (0..1), clamped
    // gain = quadratic Bezier: (1-p)^2 + 2*(1-p)*p*pc
    // Before fade start → gain = 1
    return [
        `volume='`,
        `if(lt(t,${fStart}),`,        // if t < fadeStart
        `1,`,                          //   → full volume
        `(1-min(1,max(0,(t-${fStart})/${fd})))*`,  // else compute (1-p) ×
        `(1-min(1,max(0,(t-${fStart})/${fd})))+`,  //   (1-p) +
        `2*(1-min(1,max(0,(t-${fStart})/${fd})))*`, // 2*(1-p) ×
        `min(1,max(0,(t-${fStart})/${fd}))*`,       //   p ×
        `${pc}`,                                    //   pc
        `)':eval=frame`,
    ].join("");
}

/**
 * Run FFmpeg and return a promise.
 */
function runFfmpeg(command: ffmpeg.FfmpegCommand): Promise<void> {
    return new Promise((resolve, reject) => {
        command
            .on("end", () => resolve())
            .on("error", (err: Error) => reject(err))
            .run();
    });
}

/**
 * Detect the correct FFmpeg codec and MIME content type from file extension.
 * Falls back to MP3 for unknown extensions.
 */
function getCodecForExtension(ext: string): { codec: string; contentType: string; bitrate?: string } {
    switch (ext.toLowerCase()) {
        case ".wav": return { codec: "pcm_s16le", contentType: "audio/wav" };
        case ".flac": return { codec: "flac", contentType: "audio/flac" };
        case ".aac": return { codec: "aac", contentType: "audio/aac", bitrate: "192k" };
        case ".m4a": return { codec: "aac", contentType: "audio/mp4", bitrate: "192k" };
        case ".ogg": return { codec: "libvorbis", contentType: "audio/ogg", bitrate: "192k" };
        case ".mp3":
        default: return { codec: "libmp3lame", contentType: "audio/mpeg", bitrate: "192k" };
    }
}

// ---------------------------------------------------------------------------
// Cloud Function
// ---------------------------------------------------------------------------

export const trimAudioFile = onCall(
    {
        timeoutSeconds: 120,
        memory: "512MiB",
    },
    async (request) => {
        // 1. Auth
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;

        // 2. Parse & validate input
        const {
            trackId, channelId, variant,
            trimStartSec, trimEndSec, fadeOut,
        } = request.data as TrimRequest;

        if (!trackId || !channelId || !variant) {
            throw new HttpsError("invalid-argument", "Missing trackId, channelId, or variant.");
        }
        if (!["vocal", "instrumental"].includes(variant)) {
            throw new HttpsError("invalid-argument", `Invalid variant: ${variant}`);
        }
        if (typeof trimStartSec !== "number" || typeof trimEndSec !== "number") {
            throw new HttpsError("invalid-argument", "trimStartSec and trimEndSec must be numbers.");
        }
        if (trimEndSec <= trimStartSec) {
            throw new HttpsError("invalid-argument", "trimEndSec must be greater than trimStartSec.");
        }

        // 3. Fetch track document
        const trackDocPath = `users/${userId}/channels/${channelId}/tracks/${trackId}`;
        const trackDoc = await db.doc(trackDocPath).get();
        if (!trackDoc.exists) {
            throw new HttpsError("not-found", "Track not found.");
        }

        const trackData = trackDoc.data()!;
        const storagePathKey = `${variant}StoragePath` as const;
        const urlKey = `${variant}Url` as const;
        const peaksKey = `${variant}Peaks` as const;
        const storagePath: string | undefined = trackData[storagePathKey];

        if (!storagePath) {
            throw new HttpsError("not-found", `No ${variant} audio file found for this track.`);
        }

        // 4. Download from Firebase Storage to /tmp
        const bucket = admin.storage().bucket();
        const ext = path.extname(storagePath) || ".mp3";
        const tmpInput = path.join(os.tmpdir(), `trim_input_${trackId}${ext}`);
        const tmpOutput = path.join(os.tmpdir(), `trim_output_${trackId}${ext}`);

        try {
            console.log(`[trimAudioFile] Downloading ${storagePath}...`);
            await bucket.file(storagePath).download({ destination: tmpInput });

            // 5. Build FFmpeg command
            const newDuration = trimEndSec - trimStartSec;
            const { codec, contentType, bitrate } = getCodecForExtension(ext);
            const cmd = ffmpeg(tmpInput)
                .setStartTime(trimStartSec)
                .duration(newDuration)
                .audioCodec(codec);

            if (bitrate) {
                cmd.audioBitrate(bitrate);
            }

            // Apply Bezier fade-out filter if requested
            if (fadeOut && fadeOut.durationSec > 0) {
                // fadeOut.startSec is relative to the original file
                // After trim, adjust to be relative to the trimmed output
                const fadeStartInOutput = fadeOut.startSec - trimStartSec;
                if (fadeStartInOutput >= 0 && fadeStartInOutput < newDuration) {
                    const filter = buildBezierVolumeFilter(
                        fadeStartInOutput,
                        fadeOut.durationSec,
                        fadeOut.curvature,
                    );
                    cmd.audioFilters(filter);
                }
            }

            cmd.output(tmpOutput);

            console.log(`[trimAudioFile] Processing: ${trimStartSec.toFixed(2)}s → ${trimEndSec.toFixed(2)}s (${newDuration.toFixed(2)}s)${fadeOut ? `, fade-out at ${fadeOut.startSec.toFixed(2)}s for ${fadeOut.durationSec.toFixed(2)}s` : ""
                }`);

            await runFfmpeg(cmd);

            // 6. Upload processed file back to same Storage path (with download token)
            const downloadToken = crypto.randomUUID();
            console.log(`[trimAudioFile] Uploading to ${storagePath}...`);
            await bucket.upload(tmpOutput, {
                destination: storagePath,
                metadata: {
                    contentType,
                    metadata: {
                        trimmedAt: new Date().toISOString(),
                        firebaseStorageDownloadTokens: downloadToken,
                    },
                },
            });

            // 7. Build Firebase Storage download URL (never expires)
            const bucketName = bucket.name;
            const encodedPath = encodeURIComponent(storagePath);
            const newUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;

            // 8. Update Firestore
            const updates: Record<string, unknown> = {
                [urlKey]: newUrl,
                duration: newDuration,
                [peaksKey]: admin.firestore.FieldValue.delete(),  // client recomputes
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            await db.doc(trackDocPath).update(updates);

            console.log(`[trimAudioFile] Done. New duration: ${newDuration.toFixed(2)}s`);

            return {
                success: true,
                newDuration,
                newUrl,
            };
        } finally {
            // 9. Cleanup /tmp
            for (const f of [tmpInput, tmpOutput]) {
                try { fs.unlinkSync(f); } catch { /* ignore */ }
            }
        }
    },
);
