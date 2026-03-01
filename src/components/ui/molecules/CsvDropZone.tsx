// =============================================================================
// CSV Drop Zone — Shared Molecule
//
// Reusable drag-and-drop file upload area for CSV files.
// UI matches existing TrafficUploader full mode design.
//
// Consumers: TrafficUploader (Suggested Traffic), TrafficSourceTab (Traffic Sources)
// Backlog: AudioDropZone (Music) — separate PR
// =============================================================================

import React, { useRef, useState, useCallback } from 'react';
import { FileText, Loader2 } from 'lucide-react';

interface CsvDropZoneProps {
    /** Called when a file is selected (via drop or browse) */
    onFileSelect: (file: File) => void;
    /** Whether a long-running operation is in progress */
    isProcessing?: boolean;
    /** Label shown during processing */
    processingLabel?: string;
    /** Sub-label shown during processing */
    processingSubLabel?: string;
    /** Title shown in idle state */
    title?: string;
    /** Subtitle shown below the icon */
    subtitle?: string;
    /** File accept filter (e.g. ".csv") */
    accept?: string;
    /** Height of the drop zone */
    height?: string;
    /** Disabled state */
    disabled?: boolean;
}

export const CsvDropZone: React.FC<CsvDropZoneProps> = ({
    onFileSelect,
    isProcessing = false,
    processingLabel = 'Processing...',
    processingSubLabel = 'This may take a few seconds',
    title = 'Upload CSV',
    subtitle,
    accept = '.csv',
    height = '200px',
    disabled = false,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const isBusy = isProcessing || disabled;

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (isBusy) return;
        e.preventDefault();
        setIsDragging(true);
    }, [isBusy]);

    const handleDragLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        if (isBusy) return;
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFileSelect(file);
    }, [isBusy, onFileSelect]);

    const handleClick = useCallback(() => {
        if (!isBusy) fileInputRef.current?.click();
    }, [isBusy]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onFileSelect(file);
        e.target.value = ''; // Reset for re-upload
    }, [onFileSelect]);

    return (
        <div
            className={`
                relative flex flex-col items-center justify-center text-center transition-all duration-300
                border rounded-xl
                ${isBusy
                    ? 'border-transparent bg-bg-secondary/50 cursor-wait'
                    : `cursor-pointer border-dashed ${isDragging ? 'border-accent-blue bg-accent-blue/5' : 'border-white/10 hover:border-white bg-transparent'}`
                }
            `}
            style={{ height }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept={accept}
                onChange={handleInputChange}
            />

            <div className="flex flex-col items-center gap-3">
                {isBusy ? (
                    <>
                        <div className="w-12 h-12 rounded-full bg-accent-blue/10 flex items-center justify-center text-accent-blue mb-1">
                            <Loader2 className="animate-spin" size={24} />
                        </div>
                        <div className="space-y-1 animate-pulse">
                            <h3 className="text-sm font-medium text-text-primary">
                                {processingLabel}
                            </h3>
                            <p className="text-xs text-text-secondary">
                                {processingSubLabel}
                            </p>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-text-secondary transition-colors group-hover:bg-white/10">
                            <FileText size={24} />
                        </div>

                        <div className="space-y-1">
                            <h3 className="text-sm font-medium text-text-primary">
                                {title}
                            </h3>
                            <p className="text-xs text-text-secondary">
                                Drag and drop your file here, or{' '}
                                <span className="text-accent-blue hover:underline font-medium">
                                    browse
                                </span>
                            </p>
                            {subtitle && (
                                <p className="text-[10px] text-text-tertiary mt-1">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
