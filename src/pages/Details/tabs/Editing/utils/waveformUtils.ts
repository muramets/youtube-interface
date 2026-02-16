// =============================================================================
// WAVEFORM UTILS: Canvas drawing and color helpers for timeline waveforms
// =============================================================================

/** Convert hex (#RRGGBB) to { h, s, l } where h is 0-360, s/l are 0-100 */
export function hexToHSL(hex: string): { h: number; s: number; l: number } {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s: s * 100, l: l * 100 };
}

/** Draw rounded-bar waveform using genre hex color.
 *  Width/height are passed explicitly to prevent vertical scaling on zoom.
 *  trimFractionStart/End (0–1) offset which portion of peaks are shown. */
export function drawWaveform(
    canvas: HTMLCanvasElement,
    peaks: number[],
    hex: string,
    drawW: number,
    drawH: number,
    volume = 1,
    trimFractionStart = 0,
    trimFractionEnd = 0,
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = drawW * dpr;
    canvas.height = drawH * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, drawW, drawH);

    const { h: hue, s, l } = hexToHSL(hex);
    const color = `hsl(${hue}, ${s}%, ${l}%)`;

    if (!peaks || peaks.length === 0) {
        ctx.strokeStyle = `hsla(${hue}, ${s}%, ${l}%, 0.25)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, drawH / 2);
        ctx.lineTo(drawW, drawH / 2);
        ctx.stroke();
        return;
    }

    // Calculate bar layout from the FULL (untrimmed) track to keep bar positions stable.
    // When trimming, we just draw fewer bars — existing bars don't shift.
    const visibleFraction = Math.max(0.01, 1 - trimFractionStart - trimFractionEnd);
    const fullWidth = drawW / visibleFraction;

    const fullBarCount = Math.max(8, Math.min(peaks.length, Math.floor(fullWidth / 3)));
    const step = peaks.length / fullBarCount;
    const barWidth = Math.max(1.5, (fullWidth / fullBarCount) * 0.6);
    const gap = (fullWidth - barWidth * fullBarCount) / fullBarCount;
    const maxBarHeight = drawH * 0.72;
    const minBarHeight = 2;
    // Shift center down so the tallest bar's bottom edge touches the title bar
    const centerY = drawH - maxBarHeight / 2;

    ctx.fillStyle = color;

    // Only draw bars within the visible (trimmed) range
    const startBar = Math.round(trimFractionStart * fullBarCount);
    const endBar = Math.round((1 - trimFractionEnd) * fullBarCount);

    for (let i = startBar; i < endBar; i++) {
        const peakIdx = Math.min(peaks.length - 1, Math.floor(i * step));
        const amplitude = Math.max(0, Math.min(1, peaks[peakIdx])) * volume;
        const barH = Math.max(minBarHeight, amplitude * maxBarHeight);
        // Position relative to the visible area (subtract startBar offset)
        const x = (i - startBar) * (barWidth + gap) + gap / 2;
        const y = centerY - barH / 2;

        const radius = Math.min(barWidth / 2, 1.5);
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, radius);
        ctx.fill();
    }
}
