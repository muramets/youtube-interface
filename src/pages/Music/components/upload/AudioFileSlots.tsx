// =============================================================================
// AUDIO FILE SLOTS: Vocal/Instrumental selectors with swap + preview
// =============================================================================

import React, { useRef, useState } from 'react';
import { Mic, Piano, Loader2, Play, Pause, X, ArrowLeftRight } from 'lucide-react';
import { PortalTooltip } from '../../../../components/ui/atoms/PortalTooltip';
import { EMPTY_FILE, type FileState } from '../../hooks/useTrackForm';

const ACCEPTED_AUDIO = '.mp3,.wav,.flac,.aac,.ogg,.m4a,.wma';

/** Inline text that shows PortalTooltip only when truncated, with 500ms delay */
const TruncatedText: React.FC<{ text: string; placeholder?: string }> = ({ text, placeholder = 'Select file...' }) => {
    const ref = useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    // Keep truncation state in sync via ResizeObserver
    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
        check();

        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [text]);

    return (
        <PortalTooltip
            content={<span className="whitespace-nowrap">{text}</span>}
            triggerClassName="flex-1 min-w-0 !justify-start"
            enterDelay={500}
            disabled={!isTruncated}
        >
            <span
                ref={ref}
                className="text-xs text-text-primary truncate block text-left"
            >
                {text || placeholder}
            </span>
        </PortalTooltip>
    );
};

interface AudioFileSlotsProps {
    isInstrumentalOnly: boolean;
    setIsInstrumentalOnly: (v: boolean) => void;
    vocalFile: FileState;
    instrumentalFile: FileState;
    setVocalFile: React.Dispatch<React.SetStateAction<FileState>>;
    setInstrumentalFile: React.Dispatch<React.SetStateAction<FileState>>;
    vocalInputRef: React.RefObject<HTMLInputElement | null>;
    instrumentalInputRef: React.RefObject<HTMLInputElement | null>;
    previewPlaying: 'vocal' | 'instrumental' | null;
    togglePreview: (variant: 'vocal' | 'instrumental') => void;
    onAudioSelect: (variant: 'vocal' | 'instrumental', file: File) => void;
    onSwap: () => void;
}

export const AudioFileSlots: React.FC<AudioFileSlotsProps> = ({
    isInstrumentalOnly,
    setIsInstrumentalOnly,
    vocalFile,
    instrumentalFile,
    setVocalFile,
    setInstrumentalFile,
    vocalInputRef,
    instrumentalInputRef,
    previewPlaying,
    togglePreview,
    onAudioSelect,
    onSwap,
}) => {
    const vocalLoaded = !!(vocalFile.file || vocalFile.name);
    const instrumentalLoaded = !!(instrumentalFile.file || instrumentalFile.name);

    return (
        <>
            {/* Instrumental-only toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                    onClick={(e) => {
                        e.preventDefault();
                        const goingInstrumental = !isInstrumentalOnly;
                        setIsInstrumentalOnly(goingInstrumental);
                        if (goingInstrumental && vocalFile.file && !instrumentalFile.file) {
                            setInstrumentalFile(vocalFile);
                            setVocalFile(EMPTY_FILE);
                        } else if (!goingInstrumental && instrumentalFile.file && !vocalFile.file) {
                            setVocalFile(instrumentalFile);
                            setInstrumentalFile(EMPTY_FILE);
                        }
                    }}
                    className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${isInstrumentalOnly ? 'bg-[var(--primary-button-bg)]' : 'bg-black/10 dark:bg-white/10'
                        }`}
                >
                    <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-200 ${isInstrumentalOnly ? 'translate-x-[16px]' : 'translate-x-[2px]'
                        }`} />
                </div>
                <span className="text-xs text-text-secondary">
                    Instrumental track <span className="text-text-tertiary">(no vocal version)</span>
                </span>
            </label>

            {/* Audio file selectors */}
            <div className={`grid gap-3 overflow-hidden ${isInstrumentalOnly ? 'grid-cols-1' : (vocalLoaded && instrumentalLoaded) ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-2'}`}>
                {/* Vocal — hidden in instrumental-only mode */}
                {!isInstrumentalOnly && (
                    <div className="min-w-0">
                        <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-1.5 block">
                            Vocal Version
                        </label>
                        <div
                            onClick={() => vocalInputRef.current?.click()}
                            className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${vocalLoaded
                                ? 'border-green-500/30 bg-green-500/5'
                                : 'border-border hover:border-text-secondary'
                                }`}
                        >
                            {vocalFile.uploading ? (
                                <Loader2 size={16} className="text-text-secondary animate-spin" />
                            ) : (
                                <Mic size={16} className={vocalLoaded ? 'text-green-500' : 'text-text-secondary'} />
                            )}
                            <TruncatedText text={vocalFile.name} />
                            {vocalLoaded && (
                                <>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            togglePreview('vocal');
                                        }}
                                        className="text-text-tertiary hover:text-text-primary transition-colors"
                                    >
                                        {previewPlaying === 'vocal'
                                            ? <Pause size={12} />
                                            : <Play size={12} />}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setVocalFile(EMPTY_FILE);
                                        }}
                                        className="text-text-tertiary hover:text-red-400"
                                    >
                                        <X size={12} />
                                    </button>
                                </>
                            )}
                        </div>
                        <input
                            ref={vocalInputRef}
                            type="file"
                            accept={ACCEPTED_AUDIO}
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) onAudioSelect('vocal', file);
                            }}
                        />
                    </div>
                )}

                {/* Swap button — visible when both slots have files */}
                {!isInstrumentalOnly && vocalLoaded && instrumentalLoaded && (
                    <div className="flex items-end pb-1">
                        <button
                            type="button"
                            onClick={onSwap}
                            className="p-2 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
                            title="Swap vocal ↔ instrumental"
                        >
                            <ArrowLeftRight size={14} />
                        </button>
                    </div>
                )}

                {/* Instrumental */}
                <div className="min-w-0">
                    <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-1.5 block">
                        Instrumental
                    </label>
                    <div
                        onClick={() => instrumentalInputRef.current?.click()}
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${instrumentalLoaded
                            ? 'border-green-500/30 bg-green-500/5'
                            : 'border-border hover:border-text-secondary'
                            }`}
                    >
                        {instrumentalFile.uploading ? (
                            <Loader2 size={16} className="text-text-secondary animate-spin" />
                        ) : (
                            <Piano size={16} className={instrumentalLoaded ? 'text-green-500' : 'text-text-secondary'} />
                        )}
                        <TruncatedText text={instrumentalFile.name} />
                        {instrumentalLoaded && (
                            <>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        togglePreview('instrumental');
                                    }}
                                    className="text-text-tertiary hover:text-text-primary transition-colors"
                                >
                                    {previewPlaying === 'instrumental'
                                        ? <Pause size={12} />
                                        : <Play size={12} />}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setInstrumentalFile(EMPTY_FILE);
                                    }}
                                    className="text-text-tertiary hover:text-red-400"
                                >
                                    <X size={12} />
                                </button>
                            </>
                        )}
                    </div>
                    <input
                        ref={instrumentalInputRef}
                        type="file"
                        accept={ACCEPTED_AUDIO}
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onAudioSelect('instrumental', file);
                        }}
                    />
                </div>
            </div>
        </>
    );
};
