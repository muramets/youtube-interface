import type { TimelineTrack } from '../../../../../core/types/editing';

const TARGET_SAMPLE_RATE = 48_000;
const TARGET_CHANNELS = 2;

/**
 * Result of audio mixing — contains transferable Float32Array channels
 * that can be sent to a Web Worker via postMessage.
 */
export interface MixedAudio {
    /** Per-channel sample data (Float32Array per channel) */
    channels: Float32Array[];
    /** Sample rate in Hz */
    sampleRate: number;
    /** Total number of audio frames (samples per channel) */
    frameCount: number;
    /** Total duration in seconds */
    duration: number;
}

/**
 * Fetch, decode, trim, volume-scale, concatenate, and loop audio tracks
 * into transferable Float32Array channels at 48 kHz stereo.
 *
 * Returns raw channel data instead of AudioBuffer so the result can be
 * efficiently transferred to a Web Worker via Transferable.
 */
export async function mixTracks(
    tracks: TimelineTrack[],
    masterVolume: number,
    loopCount: number,
    signal?: AbortSignal,
): Promise<MixedAudio> {
    if (tracks.length === 0) {
        throw new Error('No tracks to mix');
    }

    // Skip tracks with missing audio URLs (defensive — store should prevent this)
    const validTracks = tracks.filter((t) => t.audioUrl);
    if (validTracks.length === 0) {
        throw new Error('No tracks with valid audio URLs');
    }

    // ── 1. Fetch all tracks in parallel, then decode on a shared context ─
    const fetched = await Promise.all(
        validTracks.map(async (track) => {
            const response = await fetch(track.audioUrl, { signal });
            if (!response.ok) throw new Error(`Failed to fetch audio: ${track.title}`);
            return { arrayBuf: await response.arrayBuffer(), track };
        }),
    );

    // Single shared context — avoids creating N separate OfflineAudioContexts.
    // decodeAudioData calls are sequential because some browsers don't support
    // concurrent decode on the same context.
    const decodeCtx = new OfflineAudioContext(TARGET_CHANNELS, 1, TARGET_SAMPLE_RATE);
    const decoded: { buffer: AudioBuffer; track: TimelineTrack }[] = [];
    for (const { arrayBuf, track } of fetched) {
        const audioBuffer = await decodeCtx.decodeAudioData(arrayBuf);
        decoded.push({ buffer: audioBuffer, track });
    }

    // ── 2. Calculate total duration for one pass ───────────────────────
    const singlePassSamples = decoded.reduce((sum, { buffer, track }) => {
        const trimSamples = Math.round(
            (track.trimStart + track.trimEnd) * buffer.sampleRate
        );
        const usableSamples = Math.max(0, buffer.length - trimSamples);
        // Resample to target rate
        return sum + Math.round(usableSamples * (TARGET_SAMPLE_RATE / buffer.sampleRate));
    }, 0);

    const totalSamples = singlePassSamples * loopCount;

    if (totalSamples === 0) {
        throw new Error('Total audio duration is zero after trimming');
    }

    // ── 3. Create output channels (raw Float32Arrays) ──────────────────
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < TARGET_CHANNELS; ch++) {
        channels.push(new Float32Array(totalSamples));
    }

    // ── 4. Fill output: concat + trim + volume + loop ──────────────────
    for (let loop = 0; loop < loopCount; loop++) {
        let writeOffset = loop * singlePassSamples;

        for (const { buffer, track } of decoded) {
            const srcRate = buffer.sampleRate;
            const trimStartSamples = Math.round(track.trimStart * srcRate);
            const trimEndSamples = Math.round(track.trimEnd * srcRate);
            const usableLength = Math.max(0, buffer.length - trimStartSamples - trimEndSamples);

            if (usableLength === 0) continue;

            const resampledLength = Math.round(usableLength * (TARGET_SAMPLE_RATE / srcRate));
            const trackVolume = track.volume * masterVolume;

            for (let ch = 0; ch < TARGET_CHANNELS; ch++) {
                const srcChannel = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
                const outChannel = channels[ch];

                for (let i = 0; i < resampledLength; i++) {
                    // Linear interpolation for resampling
                    const srcPos = trimStartSamples + (i * usableLength) / resampledLength;
                    const srcIdx = Math.floor(srcPos);
                    const frac = srcPos - srcIdx;
                    const s0 = srcChannel[srcIdx] ?? 0;
                    const s1 = srcChannel[Math.min(srcIdx + 1, srcChannel.length - 1)] ?? 0;
                    const sample = s0 + frac * (s1 - s0);

                    outChannel[writeOffset + i] += sample * trackVolume;
                }
            }

            writeOffset += resampledLength;
        }
    }

    // ── 5. Clamp to [-1, 1] to prevent clipping distortion ────────────
    for (let ch = 0; ch < TARGET_CHANNELS; ch++) {
        const data = channels[ch];
        for (let i = 0; i < data.length; i++) {
            if (data[i] > 1) data[i] = 1;
            else if (data[i] < -1) data[i] = -1;
        }
    }

    return {
        channels,
        sampleRate: TARGET_SAMPLE_RATE,
        frameCount: totalSamples,
        duration: totalSamples / TARGET_SAMPLE_RATE,
    };
}
