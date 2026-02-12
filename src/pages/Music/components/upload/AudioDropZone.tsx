// =============================================================================
// AUDIO DROP ZONE: Cover art + audio file drag-and-drop area
// =============================================================================

import React from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import type { FileState } from '../../hooks/useTrackForm';

interface AudioDropZoneProps {
    // Cover
    coverPreview: string;
    coverInputRef: React.RefObject<HTMLInputElement | null>;
    onCoverSelect: (file: File) => void;
    // Audio drop
    isDragOver: boolean;
    setIsDragOver: (v: boolean) => void;
    onDrop: (e: React.DragEvent) => void;
    // Slot state
    vocalFile: FileState;
    instrumentalFile: FileState;
    isInstrumentalOnly: boolean;
}

export const AudioDropZone: React.FC<AudioDropZoneProps> = ({
    coverPreview,
    coverInputRef,
    onCoverSelect,
    isDragOver,
    setIsDragOver,
    onDrop,
    vocalFile,
    instrumentalFile,
    isInstrumentalOnly,
}) => {
    const vocalLoaded = !!(vocalFile.file || vocalFile.name);
    const instrumentalLoaded = !!(instrumentalFile.file || instrumentalFile.name);
    const allSlotsFilled = isInstrumentalOnly
        ? instrumentalLoaded
        : (vocalLoaded && instrumentalLoaded);

    return (
        <div className="grid grid-cols-[120px_1fr] gap-3">
            {/* Cover Art — square zone */}
            <div
                onClick={() => coverInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
                    if (file) onCoverSelect(file);
                }}
                className={`rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center overflow-hidden ${coverPreview
                    ? 'border-transparent'
                    : 'border-border hover:border-text-secondary'
                    }`}
            >
                {coverPreview ? (
                    <div className="relative w-full h-full group">
                        <img src={coverPreview} alt="cover" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ImageIcon size={20} className="text-white/80" />
                        </div>
                    </div>
                ) : (
                    <>
                        <ImageIcon size={28} className="mb-2 text-text-secondary" />
                        <p className="text-sm text-text-primary font-medium">
                            Cover
                        </p>
                        <p className="text-[10px] text-text-tertiary mt-1">
                            JPG, JPEG, PNG, PSD
                        </p>
                    </>
                )}
            </div>
            <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onCoverSelect(file);
                }}
            />

            {/* Audio Drop Zone */}
            <div
                onDragOver={(e) => { if (allSlotsFilled) return; e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={allSlotsFilled ? undefined : onDrop}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all duration-200 ${allSlotsFilled
                    ? 'border-border opacity-40 cursor-default'
                    : isDragOver
                        ? 'border-[var(--primary-button-bg)] bg-[var(--primary-button-bg)]/5'
                        : 'border-border hover:border-text-secondary'
                    }`}
            >
                <Upload size={28} className="mb-2 text-text-secondary" />
                <p className="text-sm text-text-primary font-medium">
                    {allSlotsFilled ? 'All slots filled' : 'Drop audio files here'}
                </p>
                <p className="text-xs text-text-tertiary mt-1">
                    MP3, WAV, FLAC, AAC, OGG
                </p>
            </div>
        </div>
    );
};
