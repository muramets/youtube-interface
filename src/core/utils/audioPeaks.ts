// =============================================================================
// AUDIO PEAKS: Extract waveform peaks from audio files/URLs
// =============================================================================

/**
 * Number of peak samples for waveform visualization.
 */
export const PEAK_COUNT = 100;

/**
 * Shared peak extraction from an ArrayBuffer.
 */
async function decodePeaks(arrayBuffer: ArrayBuffer, count: number): Promise<number[]> {
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const samplesPerPeak = Math.floor(channelData.length / count);
    const peaks: number[] = [];

    for (let i = 0; i < count; i++) {
        const start = i * samplesPerPeak;
        const end = start + samplesPerPeak;
        let max = 0;
        for (let j = start; j < end; j++) {
            const abs = Math.abs(channelData[j]);
            if (abs > max) max = abs;
        }
        peaks.push(max);
    }

    await audioContext.close();
    return peaks;
}

/**
 * Extract peaks from an audio URL using Web Audio API.
 */
export async function extractPeaks(url: string, count: number = PEAK_COUNT): Promise<number[]> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return decodePeaks(arrayBuffer, count);
}

/**
 * Extract peaks directly from a File object (no network roundtrip).
 * Used during upload to pre-compute waveform data.
 */
export async function extractPeaksFromFile(file: File, count: number = PEAK_COUNT): Promise<number[]> {
    const arrayBuffer = await file.arrayBuffer();
    return decodePeaks(arrayBuffer, count);
}
