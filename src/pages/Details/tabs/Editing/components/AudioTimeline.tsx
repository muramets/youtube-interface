import React from 'react';
import { Music, Play, Pause, Volume2, ZoomIn } from 'lucide-react';
import {
    DndContext,
    DragOverlay,
    closestCenter,
} from '@dnd-kit/core';
import { SortableContext, type SortingStrategy } from '@dnd-kit/sortable';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { getEffectiveDuration } from '../../../../../core/types/editing';
import { TimelineTrackItem } from './TimelineTrackItem';
import { TimelineRuler } from './TimelineRuler';
import { useRulerTicks } from '../hooks/useRulerTicks';
import { useTimelineZoom } from '../hooks/useTimelineZoom';
import { useTimelinePlayback } from '../hooks/useTimelinePlayback';
import { useTimelineDnd } from '../hooks/useTimelineDnd';
import { useTimelineCursor } from '../hooks/useTimelineCursor';

// ─── Constants ──────────────────────────────────────────────────────────
const LANE_HEIGHT = 72;

// No-op sort strategy: Live Pattern — arrayMove in handleDragOver already handles
// reordering, so dnd-kit should NOT apply displacement transforms.
const noopSortStrategy: SortingStrategy = () => null;

export const AudioTimeline: React.FC = () => {
    const tracks = useEditingStore((s) => s.tracks);
    const volume = useEditingStore((s) => s.volume);
    const setVolume = useEditingStore((s) => s.setVolume);
    const isPlaying = useEditingStore((s) => s.isPlaying);

    const totalDuration = tracks.reduce((sum, t) => sum + getEffectiveDuration(t), 0);

    // ── Hooks ────────────────────────────────────────────────────────────
    const {
        zoom,
        containerRef,
        scrollRef,
        containerWidth,
        pxPerSecond,
        timelineWidth,
        timelineDuration,
    } = useTimelineZoom(totalDuration);

    const {
        handlePlayPause,
        cursorRulerRef,
        cursorLaneRef,
        activeTrackIndexRef,
        findTrackAtPosition,
    } = useTimelinePlayback(tracks, pxPerSecond);

    const {
        sensors,
        activeDragId,
        dropInsertIndex,
        dropGapPx,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleNativeDragOver,
        handleNativeDragLeave,
        handleNativeDrop,
    } = useTimelineDnd(tracks, pxPerSecond, scrollRef);

    const rulerTicks = useRulerTicks(pxPerSecond, timelineDuration);

    const {
        handleSeek,
        hoverPx,
        hoverTimeLabel,
        cursorPx,
        showCursor,
        handleMouseMove,
        handleMouseLeave,
        selectedTrackId,
        setSelectedTrackId,
    } = useTimelineCursor(
        tracks, pxPerSecond, totalDuration, scrollRef,
        isPlaying, activeTrackIndexRef, findTrackAtPosition, rulerTicks,
    );

    // ── Render ───────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-1.5">
            {/* Header: three-zone layout */}
            <div className="flex items-center justify-between gap-3">
                {/* LEFT — Title + Play/Pause */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <h3 className="text-sm font-semibold text-text-primary">Audio Timeline</h3>
                    {totalDuration > 0 && (
                        <button
                            onClick={handlePlayPause}
                            className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition-colors"
                            title={isPlaying ? 'Pause' : 'Play'}
                        >
                            {isPlaying
                                ? <Pause size={10} className="text-text-primary" />
                                : <Play size={10} className="text-text-primary ml-px" />
                            }
                        </button>
                    )}
                </div>

                {/* RIGHT — Volume */}
                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                        <Volume2 size={12} className="text-text-tertiary flex-shrink-0" />
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={volume}
                            onChange={(e) => setVolume(parseFloat(e.target.value))}
                            className="w-16 h-1 accent-accent bg-white/[0.08] rounded-full appearance-none cursor-pointer
                                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:shadow-sm
                                       [&::-webkit-slider-thumb]:hover:bg-white"
                        />
                    </div>
                </div>
            </div>

            {/* Timeline container */}
            <div
                ref={containerRef}
                className="relative rounded-xl border border-border bg-bg-secondary overflow-hidden"
                onDragOver={handleNativeDragOver}
                onDragLeave={handleNativeDragLeave}
                onDrop={handleNativeDrop}
            >
                {tracks.length === 0 ? (
                    <div
                        className="flex flex-col items-center justify-center gap-2 text-text-tertiary"
                        style={{ minHeight: 20 + LANE_HEIGHT }}
                    >
                        <Music size={24} />
                        <span className="text-sm">Add tracks from the browser panel →</span>
                    </div>
                ) : containerWidth > 0 ? (
                    <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden scrollbar-compact">
                        <div
                            style={{ width: Math.max(timelineWidth, containerWidth) }}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                            className="relative"
                        >
                            {/* ── Ruler ── */}
                            <TimelineRuler
                                pxPerSecond={pxPerSecond}
                                timelineDuration={timelineDuration}
                                cursorPx={cursorPx}
                                showCursor={showCursor}
                                cursorRulerRef={cursorRulerRef}
                                onClick={handleSeek}
                            />

                            {/* ── Waveform Lane ── */}
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragStart={handleDragStart}
                                onDragOver={handleDragOver}
                                onDragEnd={handleDragEnd}
                                modifiers={[restrictToHorizontalAxis]}
                            >
                                <SortableContext
                                    items={tracks.map((t) => t.id)}
                                    strategy={noopSortStrategy}
                                >
                                    <div
                                        className="relative flex cursor-crosshair"
                                        style={{ height: LANE_HEIGHT }}
                                        onClick={(e) => { setSelectedTrackId(null); handleSeek(e); }}
                                    >
                                        {/* Subtle vertical grid lines */}
                                        {rulerTicks.map((tick, i) => (
                                            <div
                                                key={i}
                                                className="absolute top-0 w-px h-full pointer-events-none"
                                                style={{
                                                    left: tick.px,
                                                    backgroundColor: tick.isMajor
                                                        ? 'rgba(255,255,255,0.03)'
                                                        : 'rgba(255,255,255,0.015)',
                                                }}
                                            />
                                        ))}

                                        {/* Track blocks */}
                                        {tracks.map((track) => (
                                            <TimelineTrackItem
                                                key={track.id}
                                                track={track}
                                                widthPx={Math.max(60, Math.round(getEffectiveDuration(track) * pxPerSecond))}
                                                masterVolume={volume}
                                                isBeingDragged={activeDragId === track.id}
                                                pxPerSecond={pxPerSecond}
                                                isSelected={selectedTrackId === track.id}
                                                onSelect={setSelectedTrackId}
                                            />
                                        ))}

                                        {/* Playback cursor on lane */}
                                        {showCursor && (
                                            <div
                                                ref={cursorLaneRef}
                                                className="absolute top-0 left-0 h-full w-0.5 bg-red-500/80 z-10 pointer-events-none"
                                                style={{ transform: `translateX(${cursorPx}px)`, willChange: 'transform' }}
                                            />
                                        )}

                                        {/* Drop insertion glow indicator */}
                                        {dropInsertIndex !== null && (
                                            <div
                                                className="absolute top-0 h-full w-0.5 pointer-events-none z-20"
                                                style={{ left: dropGapPx }}
                                            >
                                                <div className="absolute inset-0 w-0.5 bg-indigo-400 rounded-full" />
                                                <div className="absolute -inset-x-2 inset-y-0 bg-indigo-400/20 blur-md rounded-full" />
                                                <div className="absolute -inset-x-4 inset-y-0 bg-indigo-400/10 blur-xl rounded-full" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Hover cursor line (spans both ruler and lane) */}
                                    {hoverPx !== null && (
                                        <div
                                            className="absolute top-0 h-full w-px bg-white/20 pointer-events-none z-[5]"
                                            style={{ left: hoverPx }}
                                        >
                                            {hoverTimeLabel && (
                                                <span className="absolute top-0.5 left-1.5 text-[9px] text-white/60 bg-bg-secondary/80 px-1 rounded tabular-nums whitespace-nowrap">
                                                    {hoverTimeLabel}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </SortableContext>

                                {/* DragOverlay — renders the dragged track above everything */}
                                <DragOverlay dropAnimation={null}>
                                    {activeDragId ? (() => {
                                        const t = tracks.find((tr) => tr.id === activeDragId);
                                        if (!t) return null;
                                        return (
                                            <TimelineTrackItem
                                                track={t}
                                                widthPx={Math.max(60, Math.round(getEffectiveDuration(t) * pxPerSecond))}
                                                masterVolume={volume}
                                                isOverlay
                                            />
                                        );
                                    })() : null}
                                </DragOverlay>
                            </DndContext>
                        </div>
                    </div>
                ) : null}

                {/* Frozen zoom pill — bottom-right overlay */}
                {zoom !== 1 && (
                    <div className="absolute bottom-1.5 right-1.5 z-20
                                    flex items-center gap-1 px-2 py-0.5
                                    bg-bg-secondary/90 backdrop-blur-md
                                    border border-border rounded-full shadow-lg
                                    text-text-tertiary select-none pointer-events-none
                                    transition-opacity duration-300">
                        <ZoomIn size={10} />
                        <span className="text-[9px] font-mono tabular-nums">
                            {zoom.toFixed(1)}×
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};
