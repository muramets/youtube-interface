/**
 * render.worker.ts — Web Worker for video encoding
 *
 * Runs Mediabunny encoding entirely off the main thread:
 * - OffscreenCanvas + CanvasSource for video
 * - AudioSampleSource for audio (from raw Float32Array channels)
 * - Posts progress updates and final ArrayBuffer back to main thread
 */
import {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    CanvasSource,
    AudioSampleSource,
    AudioSample,
} from 'mediabunny';

// ─── Message Types ─────────────────────────────────────────────────────

interface RenderStartMessage {
    type: 'start';
    imageBitmap: ImageBitmap;
    audioChannels: Float32Array[];   // transferable
    audioSampleRate: number;
    audioFrameCount: number;
    width: number;
    height: number;
    fps: number;
    videoBitrate: number;
    audioBitrate: number;
    keyFrameInterval: number;
    totalFrames: number;
}

interface AbortMessage {
    type: 'abort';
}

type WorkerInMessage = RenderStartMessage | AbortMessage;

// ─── Render session state ──────────────────────────────────────────────

class RenderSession {
    private output: Output | null = null;
    private _aborted = false;
    private generation = 0;

    get aborted(): boolean { return this._aborted; }
    get activeOutput(): Output | null { return this.output; }
    set activeOutput(o: Output | null) { this.output = o; }

    /** Abort the current render and cancel the active output if running */
    abort(): void {
        this._aborted = true;
        if (this.output && this.output.state === 'started') {
            this.output.cancel().catch(() => { });
        }
    }

    /** Prepare for a new render: abort previous, reset state, return generation */
    startNew(): number {
        this.abort();
        this.output = null;
        this._aborted = false;
        return ++this.generation;
    }

    /** Check if the given generation is stale (superseded by a newer render) */
    isStale(gen: number): boolean {
        return this._aborted || gen !== this.generation;
    }
}

const session = new RenderSession();

// ─── Main handler ──────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
    const msg = e.data;

    if (msg.type === 'abort') {
        session.abort();
        return;
    }

    if (msg.type === 'start') {
        const gen = session.startNew();
        await runRender(msg, gen);
    }
};

async function runRender(config: RenderStartMessage, gen: number): Promise<void> {
    const {
        imageBitmap, audioChannels, audioSampleRate, audioFrameCount,
        width, height, fps, videoBitrate, audioBitrate,
        keyFrameInterval, totalFrames,
    } = config;

    let bitmap: ImageBitmap | null = imageBitmap;
    try {
        // ── 1. Draw image onto OffscreenCanvas ─────────────────────────
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot create 2D context on OffscreenCanvas');

        drawCover(ctx, bitmap, width, height);
        bitmap.close(); // release memory
        bitmap = null;

        // ── 2. Create Mediabunny output ────────────────────────────────
        const target = new BufferTarget();
        const output = new Output({
            format: new Mp4OutputFormat(),
            target,
        });
        session.activeOutput = output;

        const videoSource = new CanvasSource(canvas, {
            codec: 'avc',
            bitrate: videoBitrate,
            bitrateMode: 'variable',
            latencyMode: 'quality',
            keyFrameInterval,
            fullCodecString: 'avc1.640028', // H.264 High Profile Level 4.0
            hardwareAcceleration: 'prefer-hardware',
        });

        const audioSource = new AudioSampleSource({
            codec: 'aac',
            bitrate: audioBitrate,
            fullCodecString: 'mp4a.40.2', // AAC-LC
        });

        output.addVideoTrack(videoSource, { frameRate: fps });
        output.addAudioTrack(audioSource);

        await output.start();

        // ── 3. Feed video frames ───────────────────────────────────────
        // Static image — canvas content is identical for every frame.
        // No yielding needed: we're in a worker, not blocking UI.
        for (let i = 0; i < totalFrames; i++) {
            if (session.isStale(gen)) throw new DOMException('Render cancelled', 'AbortError');

            const timestamp = i / fps;
            const duration = 1 / fps;
            await videoSource.add(timestamp, duration);

            // Report progress every 10 frames (5% → 90% for video)
            if (i % 10 === 0) {
                const pct = 5 + (i / totalFrames) * 85;
                self.postMessage({ type: 'progress', pct: Math.round(pct) });
            }
        }

        // ── 4. Feed audio ──────────────────────────────────────────────
        if (session.isStale(gen)) throw new DOMException('Render cancelled', 'AbortError');
        self.postMessage({ type: 'progress', pct: 92 });

        // Concatenate channels in planar layout (all ch0 samples, then all ch1 samples)
        const numberOfChannels = audioChannels.length;
        const planar = new Float32Array(audioFrameCount * numberOfChannels);
        for (let ch = 0; ch < numberOfChannels; ch++) {
            planar.set(audioChannels[ch], ch * audioFrameCount);
        }

        const audioSample = new AudioSample({
            data: planar,
            format: 'f32-planar',
            numberOfChannels,
            sampleRate: audioSampleRate,
            timestamp: 0,
        });
        await audioSource.add(audioSample);
        audioSample.close();

        // ── 5. Finalize ────────────────────────────────────────────────
        if (session.isStale(gen)) throw new DOMException('Render cancelled', 'AbortError');
        self.postMessage({ type: 'progress', pct: 95 });

        await output.finalize();
        session.activeOutput = null;

        const buffer = target.buffer;
        if (!buffer) throw new Error('Muxer produced no output');

        self.postMessage({ type: 'progress', pct: 100 });
        self.postMessage(
            { type: 'complete', buffer },
            { transfer: [buffer] }, // zero-copy transfer
        );
    } catch (err) {
        bitmap?.close();
        session.activeOutput = null;

        if (err instanceof DOMException && err.name === 'AbortError') {
            self.postMessage({ type: 'cancelled' });
        } else {
            self.postMessage({
                type: 'error',
                message: err instanceof Error ? err.message : 'Unknown worker error',
            });
        }
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function drawCover(
    ctx: OffscreenCanvasRenderingContext2D,
    img: ImageBitmap,
    canvasW: number,
    canvasH: number,
) {
    const imgRatio = img.width / img.height;
    const canvasRatio = canvasW / canvasH;

    let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;

    if (imgRatio > canvasRatio) {
        srcW = img.height * canvasRatio;
        srcX = (img.width - srcW) / 2;
    } else {
        srcH = img.width / canvasRatio;
        srcY = (img.height - srcH) / 2;
    }

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvasW, canvasH);
}
