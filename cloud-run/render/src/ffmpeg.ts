/**
 * ffmpeg.ts — Build ffmpeg command for audio-over-static-image rendering
 *
 * Produces YouTube-compliant MP4 with:
 * - H.264 High Profile with B-frames (IPB structure)
 * - Standard handler names (VideoHandler / SoundHandler)
 * - AAC-LC 320 kbps audio
 * - Proper SAR/DAR, compatible brands
 */

import { spawn } from 'node:child_process';

// ─── Types ─────────────────────────────────────────────────────────────

export interface TrackInput {
    /** Local file path to the audio file */
    filePath: string;
    /** Per-track volume 0–1 */
    volume: number;
    /** Seconds trimmed from the beginning */
    trimStart: number;
    /** Seconds trimmed from the end */
    trimEnd: number;
    /** Total track duration in seconds (pre-trim) */
    duration: number;
}

export interface FfmpegDiagnostics {
    speed: string;
    fps: string;
    bitrate: string;
    outTimeSec: number;
    elapsedSec: number;
}

export interface RenderParams {
    /** Local path to the cover image */
    imagePath: string;
    /** Audio tracks in timeline order */
    tracks: TrackInput[];
    /** Video width */
    width: number;
    /** Video height */
    height: number;
    /** Video bitrate in bps (e.g. 8_000_000 for 1080p) */
    videoBitrate: number;
    /** How many times to loop the concatenated audio */
    loopCount: number;
    /** Master volume 0–1 */
    masterVolume: number;
    /** Output file path */
    outputPath: string;
    /** Progress callback (0–100) */
    onProgress?: (pct: number) => void;
    /** Diagnostic callback — emitted every ~30s with speed/fps/bitrate */
    onDiagnostic?: (diag: FfmpegDiagnostics) => void;
    /** AbortSignal for cancellation — when aborted, ffmpeg process is killed */
    abortSignal?: AbortSignal;
}

// ─── YouTube-compliant bitrate map ─────────────────────────────────────
// NOTE: Duplicated in src/pages/Details/tabs/Editing/services/renderService.ts
// for client-side file-size estimation. Keep both in sync if values change.

export const BITRATE_MAP: Record<string, number> = {
    '720p': 5_000_000,
    '1080p': 8_000_000,
    '1440p': 16_000_000,
    '4k': 35_000_000,
};

export const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '1440p': { width: 2560, height: 1440 },
    '4k': { width: 3840, height: 2160 },
};

// ─── Main render function ──────────────────────────────────────────────

export async function renderWithFfmpeg(params: RenderParams): Promise<void> {
    const {
        imagePath, tracks, width, height, videoBitrate,
        loopCount, masterVolume, outputPath, onProgress,
    } = params;

    // ── 1. Build the complex audio filter ──────────────────────────────
    // ffmpeg filter_complex:
    //   [1:a] atrim=start=trimStart:end=trimEnd-trimEnd, volume=trackVol*masterVol [a0]
    //   [2:a] atrim=..., volume=... [a1]
    //   [a0][a1]...[aN] concat=n=N:v=0:a=1 [mixed]
    //   (then loop if loopCount > 1)

    const inputArgs: string[] = [];
    const filterParts: string[] = [];
    const concatInputs: string[] = [];

    // Input 0: image (loop for video duration — we'll set -shortest)
    inputArgs.push('-loop', '1', '-framerate', '6', '-i', imagePath);

    // Inputs 1..N: audio tracks (per loop iteration)
    for (let loop = 0; loop < loopCount; loop++) {
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            const inputIdx = inputArgs.filter(a => a === '-i').length; // current input index
            inputArgs.push('-i', track.filePath);

            const vol = track.volume * masterVolume;
            const label = `a${loop}_${i}`;

            // Build per-track filter: trim → set pts → volume adjust
            const filters: string[] = [];
            if (track.trimStart > 0 || track.trimEnd > 0) {
                filters.push(`atrim=start=${track.trimStart.toFixed(3)}:end=${(track.duration - track.trimEnd).toFixed(3)}`);
                filters.push('asetpts=PTS-STARTPTS');
            }
            filters.push(`volume=${vol.toFixed(4)}`);

            filterParts.push(`[${inputIdx}:a]${filters.join(',')}[${label}]`);
            concatInputs.push(`[${label}]`);
        }
    }

    // Concat all audio segments
    const totalSegments = loopCount * tracks.length;
    filterParts.push(
        `${concatInputs.join('')}concat=n=${totalSegments}:v=0:a=1[mixed]`
    );

    // Add video scale filter to the filter_complex (cannot use -vf with -filter_complex)
    filterParts.push(
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[vout]`
    );

    const filterComplex = filterParts.join(';');

    // ── 2. Calculate expected total duration ───────────────────────────
    let totalDuration = 0;
    for (let loop = 0; loop < loopCount; loop++) {
        for (const track of tracks) {
            totalDuration += track.duration - track.trimStart - track.trimEnd;
        }
    }

    // ── 3. Build ffmpeg command ────────────────────────────────────────
    // H.264 level: 5.1 required for 4K, 4.0 sufficient for ≤1440p
    const h264Level = height >= 2160 ? '5.1' : '4.0';

    const args: string[] = [
        // Global flags
        '-y',                         // overwrite output
        '-hide_banner',
        '-loglevel', 'info',
        '-progress', 'pipe:2',        // progress to stderr

        // Inputs
        ...inputArgs,

        // Filter
        '-filter_complex', filterComplex,

        // Video encoding (static image → H.264)
        '-map', '[vout]',
        '-c:v', 'libx264',
        '-tune', 'stillimage',        // optimize for static content
        '-preset', 'veryfast',         // fast encode — no quality loss for static images
        '-profile:v', 'high',         // High Profile for B-frames
        '-level:v', h264Level,
        '-pix_fmt', 'yuv420p',
        '-crf', '23',                               // default x264 quality (plenty for static image)
        '-maxrate', `${videoBitrate}`,               // safety cap (YouTube recommended max)
        '-bufsize', `${Math.round(videoBitrate * 2)}`,
        '-threads', '0',               // use all available CPU cores
        '-g', '12',                   // GOP size (keyframe every 2 sec at 6fps)
        '-bf', '2',                   // 2 B-frames between P-frames
        '-r', '6',                    // output fps matches input (static image)

        // BT.709 color metadata (matches DaVinci Resolve, ensures correct YouTube interpretation)
        '-color_primaries', 'bt709',
        '-color_trc', 'bt709',
        '-colorspace', 'bt709',

        // Audio encoding
        '-map', '[mixed]',
        '-c:a', 'aac',
        '-b:a', '320k',
        '-ar', '48000',
        '-ac', '2',

        // MP4 container settings
        '-movflags', '+faststart',    // moov atom at beginning for streaming
        '-brand', 'isom',

        // Handler names (matches DaVinci Resolve output)
        '-metadata:s:v:0', 'handler_name=VideoHandler',
        '-metadata:s:a:0', 'handler_name=SoundHandler',

        // Explicit duration: -shortest is unreliable with -loop 1 + filter_complex
        // (ffmpeg doesn't detect audio end from concat filter output)
        '-t', totalDuration.toFixed(3),

        outputPath,
    ];

    // ── 4. Run ffmpeg ──────────────────────────────────────────────────
    return new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', args, {
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let killed = false;

        // Wire up AbortSignal → kill ffmpeg process
        if (params.abortSignal) {
            if (params.abortSignal.aborted) {
                proc.kill('SIGTERM');
                killed = true;
            } else {
                params.abortSignal.addEventListener('abort', () => {
                    killed = true;
                    proc.kill('SIGTERM');
                }, { once: true });
            }
        }

        // totalDuration already computed above
        let stderr = '';
        const MAX_STDERR = 2048;
        const DIAG_INTERVAL_MS = 30_000; // emit diagnostics every 30s
        let lastDiagTime = 0;
        const encodeStartTime = Date.now();

        proc.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            stderr = (stderr + text).slice(-MAX_STDERR);

            // Parse progress: "out_time_ms=123456" (microseconds)
            const match = text.match(/out_time_ms=(\d+)/);
            if (match && totalDuration > 0) {
                const currentSec = parseInt(match[1], 10) / 1_000_000;
                const pct = Math.min(99, Math.round((currentSec / totalDuration) * 100));
                onProgress?.(pct);

                // Emit diagnostics every DIAG_INTERVAL_MS
                const now = Date.now();
                if (params.onDiagnostic && now - lastDiagTime > DIAG_INTERVAL_MS) {
                    lastDiagTime = now;
                    const speedMatch = text.match(/speed=\s*([\d.]+x|N\/A)/);
                    const fpsMatch = text.match(/fps=\s*([\d.]+)/);
                    const bitrateMatch = text.match(/bitrate=\s*([\d.]+\w+\/s|N\/A)/);
                    params.onDiagnostic({
                        speed: speedMatch?.[1] || 'N/A',
                        fps: fpsMatch?.[1] || 'N/A',
                        bitrate: bitrateMatch?.[1] || 'N/A',
                        outTimeSec: Math.round(currentSec),
                        elapsedSec: Math.round((now - encodeStartTime) / 1000),
                    });
                }
            }
        });

        proc.on('close', (code) => {
            if (killed) {
                reject(new Error('RENDER_CANCELLED'));
            } else if (code === 0) {
                onProgress?.(100);
                resolve();
            } else {
                // Extract last 500 chars of stderr for error context
                const tail = stderr.slice(-500);
                reject(new Error(`ffmpeg exited with code ${code}: ${tail}`));
            }
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
        });
    });
}
