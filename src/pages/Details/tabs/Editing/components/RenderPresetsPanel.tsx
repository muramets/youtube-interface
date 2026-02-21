import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, ChevronDown, Check, AlertTriangle, Trash2 } from 'lucide-react';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';
import { useRenderPresetsStore } from '../../../../../core/stores/editing/renderPresetsStore';
import { useMusicStore, selectAllTracks, selectAllGenres } from '../../../../../core/stores/musicStore';
import { useUIStore } from '../../../../../core/stores/uiStore';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import type { RenderPreset } from '../../../../../core/types/editing';
import './RenderPresetsPanel.css';

// ─── Helpers ────────────────────────────────────────────────────────────

/** Format epoch ms to relative time string */
function relativeTime(epochMs: number): string {
    const diffMs = Date.now() - epochMs;
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}

/** Format seconds to M:SS */
function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}



// ─── Component ──────────────────────────────────────────────────────────

interface RenderPresetsPanelProps {
    videoId: string;
}

export const RenderPresetsPanel: React.FC<RenderPresetsPanelProps> = ({ videoId }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const musicTracks = useMusicStore(selectAllTracks);
    const allGenres = useMusicStore(selectAllGenres);

    const presets = useRenderPresetsStore((s) => s.presets);
    const loading = useRenderPresetsStore((s) => s.loading);
    const error = useRenderPresetsStore((s) => s.error);
    const fetchPresets = useRenderPresetsStore((s) => s.fetchPresets);
    const applyPreset = useRenderPresetsStore((s) => s.applyPreset);
    const deletePreset = useRenderPresetsStore((s) => s.deletePreset);

    const [isOpen, setIsOpen] = useState(false);
    const [appliedId, setAppliedId] = useState<string | null>(null);
    const [skeletonReady, setSkeletonReady] = useState(false);
    const skeletonTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const appliedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            clearTimeout(skeletonTimerRef.current);
            clearTimeout(appliedTimerRef.current);
        };
    }, []);

    // Fetch presets on first expand
    useEffect(() => {
        if (isOpen && user?.uid && currentChannel?.id) {
            fetchPresets(user.uid, currentChannel.id);
        }
    }, [isOpen, user?.uid, currentChannel?.id, fetchPresets]);

    // Delayed skeleton: set skeletonReady after 150ms of loading to prevent 1-frame flash
    useEffect(() => {
        if (loading) {
            skeletonTimerRef.current = setTimeout(() => setSkeletonReady(true), 150);
        } else {
            clearTimeout(skeletonTimerRef.current);
        }
        return () => clearTimeout(skeletonTimerRef.current);
    }, [loading]);

    // Reset skeletonReady when loading completes (deferred via microtask to avoid sync setState in effect)
    useEffect(() => {
        if (!loading && skeletonReady) {
            // Use queueMicrotask to avoid the lint rule about sync setState in effects
            queueMicrotask(() => setSkeletonReady(false));
        }
    }, [loading, skeletonReady]);

    // Derive showSkeleton from both signals
    const showSkeleton = loading && skeletonReady;

    // Surface fetch errors to user
    useEffect(() => {
        if (error) {
            useUIStore.getState().showToast(error, 'error');
        }
    }, [error]);

    // Filter out presets from the current video
    const filteredPresets = useMemo(
        () => presets.filter((p) => p.videoId !== videoId),
        [presets, videoId],
    );

    // Build a Set of available storage paths for "unavailable" detection
    const availablePaths = useMemo(() => {
        const set = new Set<string>();
        for (const mt of musicTracks) {
            if (mt.vocalStoragePath) set.add(mt.vocalStoragePath);
            if (mt.instrumentalStoragePath) set.add(mt.instrumentalStoragePath);
        }
        return set;
    }, [musicTracks]);

    const handleApply = useCallback((preset: RenderPreset) => {
        // Guard against double-click
        if (appliedId) return;
        applyPreset(preset, musicTracks, allGenres);
        setAppliedId(preset.renderId);
        clearTimeout(appliedTimerRef.current);
        appliedTimerRef.current = setTimeout(() => setAppliedId(null), 2000);
    }, [applyPreset, musicTracks, allGenres, appliedId]);

    const uid = user?.uid;
    const channelId = currentChannel?.id;

    const handleDelete = useCallback((e: React.MouseEvent, presetId: string) => {
        e.stopPropagation();
        if (!uid || !channelId) return;
        deletePreset(uid, channelId, presetId);
    }, [uid, channelId, deletePreset]);

    const handleToggle = useCallback(() => {
        setIsOpen((prev) => !prev);
    }, []);

    return (
        <div className="render-presets-panel">
            {/* ── Trigger Button ──────────────────────────────────────── */}
            <button
                onClick={handleToggle}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg
                           text-text-tertiary hover:text-text-secondary
                           hover:bg-white/[0.04] transition-colors text-xs"
            >
                <History size={12} />
                <span>Use from recent render</span>
                <ChevronDown
                    size={12}
                    className="transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}
                />
            </button>

            {/* ── Collapsible Body ────────────────────────────────────── */}
            <div className={`render-presets-body ${isOpen ? 'is-open' : ''}`}>
                <div className="render-presets-inner">
                    {showSkeleton ? (
                        <div className="render-presets-scroll">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="preset-skeleton" />
                            ))}
                        </div>
                    ) : loading ? (
                        // Still loading but under 150ms threshold — render nothing to prevent flash
                        null
                    ) : filteredPresets.length === 0 ? (
                        <div className="render-presets-empty">
                            No recent renders found for this channel
                        </div>
                    ) : (
                        <div className="render-presets-scroll">
                            {filteredPresets.map((preset) => {
                                const totalDuration = preset.tracks.reduce(
                                    (sum, t) => sum + (t.duration - t.trimStart - t.trimEnd),
                                    0,
                                );
                                const unavailableTracks = preset.tracks.filter(
                                    (t) => !availablePaths.has(t.audioStoragePath),
                                );
                                const unavailable = unavailableTracks.length;
                                const allUnavailable = unavailable === preset.tracks.length;
                                const isApplied = appliedId === preset.renderId;

                                // Distinguish shared vs own unavailable tracks
                                const ownPrefix = uid ? `users/${uid}/` : '';
                                const unavailableShared = ownPrefix
                                    ? unavailableTracks.filter((t) => !t.audioStoragePath.startsWith(ownPrefix)).length
                                    : 0;

                                // Build tooltip text for warning chip
                                let warningTooltip = '';
                                if (unavailable > 0) {
                                    if (unavailableShared === unavailable) {
                                        warningTooltip = `${unavailable} track${unavailable > 1 ? 's' : ''} from a shared library — access may have been revoked`;
                                    } else if (unavailableShared > 0) {
                                        const ownUnavail = unavailable - unavailableShared;
                                        warningTooltip = `${unavailableShared} shared library track${unavailableShared > 1 ? 's' : ''} (access may have been revoked), ${ownUnavail} other track${ownUnavail > 1 ? 's' : ''} unavailable`;
                                    } else {
                                        warningTooltip = `${unavailable} track${unavailable > 1 ? 's' : ''} no longer in your library`;
                                    }
                                }

                                return (
                                    <div key={preset.renderId} className={`render-preset-card group${allUnavailable ? ' opacity-50' : ''}`}>
                                        {/* Header: image + title + time */}
                                        <div className="flex items-start gap-2 mb-2">
                                            {preset.imageUrl && (
                                                <img
                                                    src={preset.imageUrl}
                                                    alt=""
                                                    className="w-14 rounded-md object-cover flex-shrink-0"
                                                    style={{ aspectRatio: '16/9' }}
                                                />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <PortalTooltip
                                                    content={preset.videoTitle || 'Untitled'}
                                                    enterDelay={500}
                                                    align="center"
                                                    side="top"
                                                >
                                                    <span className="text-xs font-medium text-text-primary truncate leading-tight block">
                                                        {preset.videoTitle || 'Untitled'}
                                                    </span>
                                                </PortalTooltip>
                                                <span className="text-[10px] text-text-tertiary">
                                                    {relativeTime(preset.completedAt)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Bottom row: meta + apply */}
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-[10px] text-text-tertiary group-hover:text-text-secondary transition-colors whitespace-nowrap">
                                                    {preset.tracks.length} track{preset.tracks.length !== 1 ? 's' : ''} · {formatDuration(totalDuration)}
                                                </span>
                                                {unavailable > 0 && (
                                                    <PortalTooltip
                                                        content={warningTooltip}
                                                        side="top"
                                                        enterDelay={200}
                                                    >
                                                        <span className="preset-warning-chip">
                                                            <AlertTriangle size={8} />
                                                            {unavailable}
                                                        </span>
                                                    </PortalTooltip>
                                                )}

                                            </div>

                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <button
                                                    onClick={(e) => handleDelete(e, preset.renderId)}
                                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded
                                                               text-text-tertiary hover:text-red-400
                                                               transition-all duration-150"
                                                    title="Delete preset"
                                                >
                                                    <Trash2 size={11} />
                                                </button>

                                                <PortalTooltip
                                                    content={allUnavailable ? 'All tracks unavailable' : null}
                                                    side="top"
                                                    enterDelay={200}
                                                    disabled={!allUnavailable}
                                                >
                                                    <button
                                                        onClick={() => !allUnavailable && handleApply(preset)}
                                                        disabled={isApplied || allUnavailable}
                                                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium
                                                                   transition-all duration-200
                                                                   ${isApplied
                                                                ? 'bg-green-500/15 text-green-400'
                                                                : allUnavailable
                                                                    ? 'bg-white/[0.03] text-text-tertiary cursor-not-allowed'
                                                                    : 'bg-white/[0.06] text-text-secondary hover:bg-white/[0.12] hover:text-text-primary'
                                                            }`}
                                                    >
                                                        {isApplied ? (
                                                            <>
                                                                <Check size={10} />
                                                                Applied
                                                            </>
                                                        ) : (
                                                            'Apply'
                                                        )}
                                                    </button>
                                                </PortalTooltip>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
