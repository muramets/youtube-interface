import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TimelineTrack } from '../../../../../core/types/editing';
import { getEffectiveDuration } from '../../../../../core/types/editing';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useMusicStore, selectAllTracks } from '../../../../../core/stores/musicStore';
import { formatDuration } from '../utils/formatDuration';
import { drawWaveform, hexToHSL } from '../utils/waveformUtils';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';

// Fixed dimensions — waveform height is independent of zoom
const TITLE_BAR_H = 18;

/** Timestamp of last trim drag end — used by AudioTimeline to suppress click-seeks */
export let lastTrimDragEndMs = 0;


// ─── Component ──────────────────────────────────────────────────────────

interface TimelineTrackItemProps {
    track: TimelineTrack;
    widthPx: number;
    masterVolume: number;
    /** Pixels per second — needed for trim drag calculations */
    pxPerSecond?: number;
    /** True when this item is the one being dragged (original — should be invisible) */
    isBeingDragged?: boolean;
    /** True when rendered inside DragOverlay (skip useSortable) */
    isOverlay?: boolean;
    /** True when this track is selected */
    isSelected?: boolean;
    /** Called when track is clicked to select it */
    onSelect?: (trackId: string) => void;
}

export const TimelineTrackItem: React.FC<TimelineTrackItemProps> = ({ track, widthPx, masterVolume, pxPerSecond = 1, isBeingDragged, isOverlay, isSelected, onSelect }) => {
    const removeTrack = useEditingStore((s) => s.removeTrack);
    const toggleVariant = useEditingStore((s) => s.toggleTrackVariant);
    const musicTracks = useMusicStore(selectAllTracks);
    const allTags = useMusicStore((s) => s.tags);
    const categoryOrder = useMusicStore((s) => s.categoryOrder);
    const setTrackVolume = useEditingStore((s) => s.setTrackVolume);
    const setTrackTrim = useEditingStore((s) => s.setTrackTrim);
    const isLocked = useEditingStore((s) => s.isLocked);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const { h: hue, s: sat, l: lig } = hexToHSL(track.genreColor);

    // Trim gap state (must be declared before style block)
    const [trimGapPx, setTrimGapPx] = useState(0);
    const [isTrimSnapping, setIsTrimSnapping] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: track.id, disabled: !!isOverlay || isLocked });

    const style: React.CSSProperties = {
        transform: isBeingDragged ? undefined : CSS.Translate.toString(transform),
        transition: isOverlay ? 'none' : [
            transition,
            isTrimSnapping ? 'margin-left 200ms ease-out' : undefined,
        ].filter(Boolean).join(', ') || undefined,
        opacity: isBeingDragged ? 0 : 1,
        width: widthPx,
        marginLeft: trimGapPx > 0 ? trimGapPx : undefined,
        zIndex: isOverlay ? 20 : 1,
    };

    // Draw waveform — width from canvas.clientWidth, height from canvas.clientHeight
    // Height is stable (flex-1 = LANE_HEIGHT - TITLE_BAR_H), only width changes on zoom
    const canvasW = widthPx - 2; // match left/right 1px inset

    // ── Gain line drag (native events for real-time responsiveness) ────
    const draggingRef = useRef(false);
    const rafRef = useRef(0);
    const trackRef = useRef<HTMLDivElement>(null);
    const [localVolume, setLocalVolume] = useState(track.volume);
    const [showGainUI, setShowGainUI] = useState(false);

    // Sync local volume when store changes (and not dragging)
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: syncing external store value with local drag state
        if (!draggingRef.current) setLocalVolume(track.volume);
    }, [track.volume]);

    const computeVolume = useCallback((clientY: number) => {
        const el = trackRef.current;
        if (!el) return track.volume;
        const rect = el.getBoundingClientRect();
        const y = clientY - rect.top;
        return 1 - Math.max(0, Math.min(1, y / rect.height));
    }, [track.volume]);

    const handleGainPointerDown = useCallback((e: React.PointerEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        draggingRef.current = true;
        setShowGainUI(true);

        const onMove = (ev: PointerEvent) => {
            if (!draggingRef.current) return;
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                const vol = computeVolume(ev.clientY);
                setLocalVolume(vol);
                setTrackVolume(track.id, vol);
            });
        };

        const onUp = () => {
            draggingRef.current = false;
            setShowGainUI(false);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            cancelAnimationFrame(rafRef.current);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }, [computeVolume, track.id, setTrackVolume, isLocked]);

    // CSS filter: brightness + saturate dims the track naturally (like a real mixer)
    const effectiveVolume = masterVolume * localVolume;
    const brightness = 0.3 + 0.7 * effectiveVolume;   // 1.0 → 0.3
    const saturate = 0.2 + 0.8 * effectiveVolume;      // 1.0 → 0.2
    const contentFilter = `brightness(${brightness}) saturate(${saturate})`;

    // Draw waveform — redraws on zoom, data change, AND volume change
    // Offset peaks by trimStart fraction so waveform shows only the visible portion
    useEffect(() => {
        const c = canvasRef.current;
        if (!c || canvasW <= 0) return;
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (w > 0 && h > 0) {
            const trimFractionStart = track.duration > 0 ? track.trimStart / track.duration : 0;
            const trimFractionEnd = track.duration > 0 ? track.trimEnd / track.duration : 0;
            drawWaveform(c, track.peaks || [], track.genreColor, w, h, effectiveVolume, trimFractionStart, trimFractionEnd);
        }
    }, [track.peaks, track.genreColor, canvasW, effectiveVolume, track.trimStart, track.trimEnd, track.duration]);

    // ── Trim edge drag ────────────────────────────────────────────────
    const EDGE_ZONE = 8; // px from edge that activates trim cursor
    const [hoverEdge, setHoverEdge] = useState<'start' | 'end' | null>(null);
    const trimDraggingRef = useRef<'start' | 'end' | null>(null);
    const trimStartXRef = useRef(0);
    const trimStartValRef = useRef({ trimStart: 0, trimEnd: 0 });

    const handleTrimMouseMove = useCallback((e: React.MouseEvent) => {
        if (trimDraggingRef.current) return; // don't change hover during drag
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x <= EDGE_ZONE) setHoverEdge('start');
        else if (x >= rect.width - EDGE_ZONE) setHoverEdge('end');
        else setHoverEdge(null);
    }, []);

    const handleTrimMouseLeave = useCallback(() => {
        if (!trimDraggingRef.current) setHoverEdge(null);
    }, []);

    const handleTrimPointerDown = useCallback((e: React.PointerEvent, edge: 'start' | 'end') => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        trimDraggingRef.current = edge;
        trimStartXRef.current = e.clientX;
        trimStartValRef.current = { trimStart: track.trimStart, trimEnd: track.trimEnd };
        if (edge === 'start') {
            setTrimGapPx(0);
            setIsTrimSnapping(false);
        }

        const onMove = (ev: PointerEvent) => {
            if (!trimDraggingRef.current) return;
            const deltaPx = ev.clientX - trimStartXRef.current;
            const deltaSec = deltaPx / pxPerSecond;

            // Don't allow trimming below the minimum visual width (60px)
            const minVisibleDuration = Math.max(2, 60 / pxPerSecond);
            const { trimStart: origTS, trimEnd: origTE } = trimStartValRef.current;

            if (trimDraggingRef.current === 'start') {
                const maxTrimStart = track.duration - origTE - minVisibleDuration;
                const newTrimStart = Math.max(0, Math.min(maxTrimStart, origTS + deltaSec));
                setTrackTrim(track.id, newTrimStart, origTE);
                // Visual gap = how much we've trimmed from start (in px)
                setTrimGapPx(Math.max(0, (newTrimStart - origTS) * pxPerSecond));
            } else {
                const maxTrimEnd = track.duration - origTS - minVisibleDuration;
                const newTrimEnd = Math.max(0, Math.min(maxTrimEnd, origTE - deltaSec));
                setTrackTrim(track.id, origTS, newTrimEnd);
            }
        };

        const onUp = () => {
            const wasTrimStart = trimDraggingRef.current === 'start';
            trimDraggingRef.current = null;
            lastTrimDragEndMs = Date.now();
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);

            // Snap-back animation for start-edge trim
            if (wasTrimStart) {
                setIsTrimSnapping(true);
                // Trigger reflow then animate to 0
                requestAnimationFrame(() => {
                    setTrimGapPx(0);
                    setTimeout(() => setIsTrimSnapping(false), 200);
                });
            }
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }, [track.id, track.trimStart, track.trimEnd, track.duration, pxPerSecond, setTrackTrim, isLocked]);

    const trimmedDuration = getEffectiveDuration(track);

    const accentHSL = `${hue}, ${sat}%, ${lig}%`;
    const bgGradient = `linear-gradient(180deg, hsla(${accentHSL}, 0.12) 0%, hsla(${accentHSL}, 0.03) 100%)`;

    // ── Tags tooltip content (grouped by category) ──
    const tagsTooltipContent = useMemo(() => {
        const sourceTrack = musicTracks.find(t => t.id === track.trackId);
        if (!sourceTrack || sourceTrack.tags.length === 0) return null;

        // Group tag IDs by category using allTags definitions
        const grouped = new Map<string, string[]>();
        for (const tagId of sourceTrack.tags) {
            const tagDef = allTags.find(t => t.id === tagId);
            const category = tagDef?.category || 'Other';
            const name = tagDef?.name || tagId;
            if (!grouped.has(category)) grouped.set(category, []);
            grouped.get(category)!.push(name);
        }

        // Sort categories by library settings order
        const sortedEntries = Array.from(grouped.entries()).sort(([a], [b]) => {
            const idxA = categoryOrder.indexOf(a);
            const idxB = categoryOrder.indexOf(b);
            // Unknown categories go to the end
            return (idxA === -1 ? Infinity : idxA) - (idxB === -1 ? Infinity : idxB);
        });

        return (
            <div className="flex flex-col gap-2 max-w-[240px]">
                {sortedEntries.map(([category, names]) => (
                    <div key={category}>
                        <div className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider mb-1">
                            {category}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {names.map(name => (
                                <span key={name} className="text-[9px] bg-white/10 px-2 py-0.5 rounded-full text-text-secondary">
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }, [musicTracks, allTags, categoryOrder, track.trackId]);

    // Gain line Y position: 0% = top (vol=1), 100% = bottom (vol=0)
    const gainLineY = `${(1 - localVolume) * 100}%`;

    return (
        <div
            ref={(node) => { setNodeRef(node); (trackRef as React.MutableRefObject<HTMLDivElement | null>).current = node; }}
            style={style}
            className={`relative flex-shrink-0 h-full group select-none
                       rounded-[3px] overflow-hidden
                       ${isSelected
                    ? 'shadow-[inset_0_0_0_1.5px_rgba(129,140,248,0.7)] ring-1 ring-indigo-400/40'
                    : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]'}
                       transition-shadow
                       ${hoverEdge && !isLocked ? 'cursor-col-resize' : isLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
            onMouseMove={handleTrimMouseMove}
            onMouseLeave={handleTrimMouseLeave}
            onClick={(e) => { e.stopPropagation(); onSelect?.(track.id); }}
            {...attributes}
            {...listeners}
        >
            {/* ── Flex column: waveform area + title bar ── */}
            <div className="flex flex-col h-full" style={{ filter: contentFilter }}>
                {/* Waveform area — takes remaining space above title */}
                <div className="relative flex-1 min-h-0 overflow-hidden">
                    {/* Background gradient */}
                    <div className="absolute inset-0" style={{ background: bgGradient }} />

                    {/* Waveform canvas — fills waveform area exactly */}
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
                </div>

                {/* Title bar — fixed height, opaque, separate from waveform */}
                <PortalTooltip
                    content={tagsTooltipContent}
                    enterDelay={1000}
                    disabled={!tagsTooltipContent}
                    side="top"
                    triggerClassName="w-full !justify-start"
                >
                    <div
                        className="flex-shrink-0 w-full px-1.5 flex items-center"
                        style={{
                            height: TITLE_BAR_H,
                            background: `hsl(${hue}, ${sat}%, ${Math.min(lig * 0.55, 35)}%)`,
                        }}
                    >
                        <div className="flex items-center justify-between gap-1 w-full">
                            <span className="text-[9px] font-medium text-white/60 group-hover:text-white truncate leading-tight transition-colors duration-300">
                                {track.title}
                            </span>
                            <span className="text-[8px] text-white/30 group-hover:text-white/70 flex-shrink-0 tabular-nums transition-colors duration-300">
                                {formatDuration(trimmedDuration)}
                            </span>
                        </div>
                    </div>
                </PortalTooltip>
            </div>

            {/* ── Gain line (draggable) ── */}
            <div
                className={`absolute left-0 right-0 h-[3px] -translate-y-1/2
                           pointer-events-auto cursor-ns-resize
                           ${showGainUI ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}
                           transition-opacity duration-300`}
                style={{
                    top: gainLineY,
                    backgroundColor: 'rgba(255,255,255,0.85)',
                    boxShadow: '0 0 6px rgba(255,255,255,0.25)',
                }}
                onPointerDown={handleGainPointerDown}
            >
                {/* Gain handle (center dot) */}
                <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                               w-2.5 h-2.5 rounded-full border border-white/50 bg-black/60 backdrop-blur-sm"
                />
                {/* dB label */}
                <span
                    className={`absolute right-1 text-[7px] tabular-nums whitespace-nowrap
                               ${showGainUI ? 'opacity-100' : 'opacity-0'}
                               text-white/70 transition-opacity`}
                    style={{ bottom: 6 }}
                >
                    {localVolume >= 0.01
                        ? `${(20 * Math.log10(localVolume)).toFixed(1)} dB`
                        : '-∞ dB'
                    }
                </span>
            </div>

            {/* Left accent edge / trim highlight — at root level to escape filter stacking context */}
            <div
                className={`absolute top-0 left-0 h-full pointer-events-none z-20 transition-all duration-150
                           ${hoverEdge === 'start' ? 'w-1 shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'w-[2px]'}`}
                style={{ backgroundColor: hoverEdge === 'start' ? 'rgba(255,255,255,0.7)' : `hsla(${accentHSL}, 0.50)` }}
            />

            {/* Right accent edge / trim highlight */}
            <div
                className={`absolute top-0 right-0 h-full pointer-events-none z-20 transition-all duration-150
                           ${hoverEdge === 'end' ? 'w-1 shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'w-px'}`}
                style={{ backgroundColor: hoverEdge === 'end' ? 'rgba(255,255,255,0.7)' : `hsla(${accentHSL}, 0.20)` }}
            />

            <div
                className="absolute top-1 left-1.5 flex rounded-full overflow-hidden
                           bg-black/30 backdrop-blur-sm border border-white/[0.08]
                           opacity-70 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <button
                    onClick={() => { if (track.variant !== 'vocal') toggleVariant(track.id, musicTracks); }}
                    className={`text-[8px] font-semibold uppercase tracking-wider px-1.5 py-px transition-all
                        ${track.variant === 'vocal'
                            ? 'bg-white/[0.18] text-white'
                            : 'text-white/35 hover:text-white/60'
                        }`}
                >
                    voc
                </button>
                <button
                    onClick={() => { if (track.variant !== 'instrumental') toggleVariant(track.id, musicTracks); }}
                    className={`text-[8px] font-semibold uppercase tracking-wider px-1.5 py-px transition-all
                        ${track.variant === 'instrumental'
                            ? 'bg-white/[0.18] text-white'
                            : 'text-white/35 hover:text-white/60'
                        }`}
                >
                    inst
                </button>
            </div>

            {/* Delete button (top-right, hover only) — hidden when locked */}
            {!isLocked && (
                <button
                    onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute top-1 right-1 p-0.5 rounded-full
                               bg-black/30 backdrop-blur-sm border border-white/[0.08]
                               text-white/30 hover:text-white hover:bg-red-500/40
                               opacity-0 group-hover:opacity-100 transition-all"
                >
                    <X size={9} />
                </button>
            )}

            {/* ── Trim edge hit zones (invisible, on top of everything) ── */}
            <div
                className="absolute top-0 left-0 h-full cursor-col-resize z-[30]"
                style={{ width: EDGE_ZONE }}
                onPointerDown={(e) => handleTrimPointerDown(e, 'start')}
                onClick={(e) => e.stopPropagation()}
            />
            <div
                className="absolute top-0 right-0 h-full cursor-col-resize z-[30]"
                style={{ width: EDGE_ZONE }}
                onPointerDown={(e) => handleTrimPointerDown(e, 'end')}
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );
};
