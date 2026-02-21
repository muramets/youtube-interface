// =============================================================================
// useTrimMode — Trim + fade-out state, rAF preview loop, and Cloud Function save.
//
// Extracted from AudioPlayer to keep it a pure UI composition component.
// All trim/fade state, the rAF-based volume envelope, and the save action
// live here. AudioPlayer just destructures the return value and passes
// relevant props to WaveformCanvas.
// =============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useUIStore } from '../../../core/stores/uiStore';
import { TrackService } from '../../../core/services/trackService';
import type { Track, TrackVariant } from '../../../core/types/track';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseTrimModeParams {
    audioRef: React.RefObject<HTMLAudioElement | null>;
    track: Track | undefined;
    duration: number;
    volume: number;
    isMuted: boolean;
    playbackVolume: number | null;
    playingVariant: TrackVariant;
    playingTrackId: string | null;
    effectiveUserId: string;
    effectiveChannelId: string;
}

interface UseTrimModeReturn {
    // State
    isTrimMode: boolean;
    isTrimSaving: boolean;
    trimStartFrac: number;
    trimEndFrac: number;
    fadeOutStartFrac: number;
    fadeOutCurvature: number;
    // Actions
    enterTrimMode: () => void;
    isWaveformReloading: boolean;
    clearWaveformReloading: () => void;
    exitTrimMode: () => void;
    handleTrimChange: (startFrac: number, endFrac: number) => void;
    handleTrimSave: () => Promise<void>;
    handleFadeOutChange: (startFrac: number, curvature: number) => void;
    activateFadeOut: () => void;
    deactivateFadeOut: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTrimMode({
    audioRef,
    track,
    duration,
    volume,
    isMuted,
    playbackVolume,
    playingVariant,
    playingTrackId,
    effectiveUserId,
    effectiveChannelId,
}: UseTrimModeParams): UseTrimModeReturn {
    const { setIsPlaying } = useMusicStore.getState();

    // ── Trim mode state ──────────────────────────────────────────────
    const [isTrimMode, setIsTrimMode] = useState(false);
    const [trimStartFrac, setTrimStartFrac] = useState(0);
    const [trimEndFrac, setTrimEndFrac] = useState(0);
    const [isTrimSaving, setIsTrimSaving] = useState(false);
    const [isWaveformReloading, setIsWaveformReloading] = useState(false);
    const trimLoopRef = useRef(false);

    // ── Fade-out state ───────────────────────────────────────────────
    const [fadeOutStartFrac, setFadeOutStartFrac] = useState(0);
    const [fadeOutCurvature, setFadeOutCurvature] = useState(0);

    // ── Live refs for rAF tick (avoid stale closures) ────────────────
    const volumeRef = useRef(volume);
    const isMutedRef = useRef(isMuted);
    useEffect(() => { volumeRef.current = volume; }, [volume]);
    useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

    // ── Stable refs for rAF loop values ──────────────────────────────
    const trimStartSecRef = useRef(0);
    const trimEndSecRef = useRef(duration);
    const fadeStartSecRef = useRef(Infinity);
    const fadeDurationRef = useRef(0);
    const fadeOutCurvatureRef = useRef(0);

    // Keep refs in sync with state (direct assignment — refs don't need effects)
    trimStartSecRef.current = trimStartFrac * duration;
    const trimEndSec = duration - trimEndFrac * duration;
    trimEndSecRef.current = trimEndSec;
    const fadeStartSec = fadeOutStartFrac > 0 ? fadeOutStartFrac * duration : Infinity;
    fadeStartSecRef.current = fadeStartSec;
    fadeDurationRef.current = trimEndSec - fadeStartSec;
    fadeOutCurvatureRef.current = fadeOutCurvature;

    // ── Callbacks ────────────────────────────────────────────────────

    const handleFadeOutChange = useCallback((startFrac: number, curvature: number) => {
        setFadeOutStartFrac(startFrac);
        setFadeOutCurvature(curvature);
    }, []);

    const activateFadeOut = useCallback(() => {
        const trimEnd = 1 - trimEndFrac;
        const activeRegion = trimEnd - trimStartFrac;
        // Default: 8-second fade; fall back to 70% of active region if track is very short
        const fadeSecFrac = duration > 0 ? 8 / duration : 0;
        const defaultStart = fadeSecFrac < activeRegion
            ? trimEnd - fadeSecFrac
            : trimStartFrac + activeRegion * 0.3;  // short track fallback
        setFadeOutStartFrac(defaultStart);
        setFadeOutCurvature(0);
    }, [trimStartFrac, trimEndFrac, duration]);

    const deactivateFadeOut = useCallback(() => {
        setFadeOutStartFrac(0);
        setFadeOutCurvature(0);
    }, []);

    const handleTrimChange = useCallback((startFrac: number, endFrac: number) => {
        setTrimStartFrac(startFrac);
        setTrimEndFrac(endFrac);
    }, []);

    const enterTrimMode = useCallback(() => {
        const audio = audioRef.current;
        // If paused at a meaningful position, set trim end to the pause point
        const pauseFrac = (audio && audio.paused && duration > 0 && audio.currentTime > 0.5)
            ? 1 - (audio.currentTime / duration)
            : 0;
        setIsTrimMode(true);
        setTrimStartFrac(0);
        setTrimEndFrac(pauseFrac);
        setFadeOutStartFrac(0);
        setFadeOutCurvature(0);
        trimLoopRef.current = true;
    }, [duration, audioRef]);

    const exitTrimMode = useCallback(() => {
        setIsTrimMode(false);
        setTrimStartFrac(0);
        setTrimEndFrac(0);
        setFadeOutStartFrac(0);
        setFadeOutCurvature(0);
        trimLoopRef.current = false;
    }, []);

    const handleTrimSave = useCallback(async () => {
        if (!track || duration <= 0) return;
        const trimStartSec = trimStartFrac * duration;
        const newEndSec = duration - trimEndFrac * duration;

        // Guard: nothing to trim (less than 50ms from each edge)
        if (trimStartSec < 0.05 && (duration - newEndSec) < 0.05 && fadeOutStartFrac <= 0) {
            exitTrimMode();
            return;
        }

        // Build fade-out params if active
        const fadeOut = fadeOutStartFrac > 0 ? {
            startSec: fadeOutStartFrac * duration,
            durationSec: newEndSec - fadeOutStartFrac * duration,
            curvature: fadeOutCurvature,
        } : undefined;

        setIsTrimSaving(true);
        try {
            await TrackService.trimTrack(
                effectiveUserId,
                effectiveChannelId,
                track.id,
                playingVariant,
                trimStartSec,
                newEndSec,
                fadeOut,
            );
            setIsWaveformReloading(true);
            exitTrimMode();
        } catch (err) {
            console.error('[Trim] Failed to save trim:', err);
            useUIStore.getState().showToast('Failed to trim track. Please try again.', 'error');
        } finally {
            setIsTrimSaving(false);
        }
    }, [track, duration, trimStartFrac, trimEndFrac, fadeOutStartFrac, fadeOutCurvature, exitTrimMode, playingVariant, effectiveUserId, effectiveChannelId]);

    // Reset trim mode when track changes
    useEffect(() => {
        exitTrimMode();
    }, [playingTrackId, exitTrimMode]);

    // Callback to clear shimmer — called by WaveformCanvas via onPeaksComputed when
    // usePeaks finishes computing new peaks from the trimmed audio.
    const clearWaveformReloading = useCallback(() => {
        if (isWaveformReloading) {
            setIsWaveformReloading(false);
        }
    }, [isWaveformReloading]);

    // ── rAF preview loop ─────────────────────────────────────────────
    // Runs ONCE per trim session, reads refs each frame → no restart on drag.
    // The loop stops when audio hits trimEnd (to avoid idle spinning).
    // A 'play' listener re-arms it whenever the user hits play again.
    useEffect(() => {
        if (!isTrimMode || duration <= 0) return;
        const audio = audioRef.current;
        if (!audio) return;

        let rafId: number;

        const tick = () => {
            if (!trimLoopRef.current) { rafId = requestAnimationFrame(tick); return; }
            const t = audio.currentTime;
            const trimStart = trimStartSecRef.current;
            const trimEnd = trimEndSecRef.current;
            const fadeStart = fadeStartSecRef.current;
            const fadeDur = fadeDurationRef.current;

            // Boundary enforcement
            if (t >= trimEnd) {
                audio.pause();
                setIsPlaying(false);
                return; // Stop rAF — loop re-arms via the 'play' listener below
            } else if (t < trimStart) {
                audio.currentTime = trimStart;
            }

            // Fade-out gain (quadratic Bezier: matches backend FFmpeg formula)
            const baseVol = isMutedRef.current ? 0 : (playbackVolume ?? volumeRef.current);
            if (fadeStart < Infinity && fadeDur > 0 && t >= fadeStart) {
                const p = Math.max(0, Math.min(1, (t - fadeStart) / fadeDur));
                const pc = 0.5 + fadeOutCurvatureRef.current * 0.5;
                const gain = (1 - p) * (1 - p) + 2 * (1 - p) * p * pc;
                audio.volume = Math.max(0, Math.min(1, gain * baseVol));
            } else {
                audio.volume = baseVol;
            }

            rafId = requestAnimationFrame(tick);
        };

        // Re-arm the loop whenever the user hits play after the loop stopped at trimEnd
        const handlePlay = () => {
            // If playhead is at or past trimEnd, rewind to trimStart for seamless replay
            if (audio.currentTime >= trimEndSecRef.current - 0.05) {
                audio.currentTime = trimStartSecRef.current;
            }
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(tick);
        };

        audio.addEventListener('play', handlePlay);
        rafId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(rafId);
            audio.removeEventListener('play', handlePlay);
            // Restore volume when exiting trim mode
            if (audio) audio.volume = isMutedRef.current ? 0 : (playbackVolume ?? volumeRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTrimMode, duration, audioRef]);  // intentionally omit trim/fade fracs — read via refs

    return {
        isTrimMode,
        isTrimSaving,
        isWaveformReloading,
        clearWaveformReloading,
        trimStartFrac,
        trimEndFrac,
        fadeOutStartFrac,
        fadeOutCurvature,
        enterTrimMode,
        exitTrimMode,
        handleTrimChange,
        handleTrimSave,
        handleFadeOutChange,
        activateFadeOut,
        deactivateFadeOut,
    };
}
