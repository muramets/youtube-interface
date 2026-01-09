import React, { useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { parseTrafficCsv } from '../utils/csvParser';
import type { TrafficSource } from '../../../../../core/types/traffic';
import { Button } from '../../../../../components/ui/atoms/Button';
import { useUIStore } from '../../../../../core/stores/uiStore';
import { UX_DELAYS } from '../utils/constants';

interface TrafficUploaderProps {
    onUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<void>;
    isLoading?: boolean;
    isCompact?: boolean;
    hasExistingSnapshot?: boolean; // If true, show "Update CSV" instead of "Upload CSV"
}

export const TrafficUploader: React.FC<TrafficUploaderProps> = ({
    onUpload,
    isLoading,
    isCompact = false,
    hasExistingSnapshot = false
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isInputProcessing, setIsInputProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useUIStore();

    const isBusy = isLoading || isInputProcessing;

    const processFile = async (file: File) => {
        setError(null);
        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
            setError('Please upload a valid CSV file');
            return;
        }

        setIsInputProcessing(true);
        try {
            // Artificial delay for better UX (so loader doesn't flash too fast)
            await new Promise(resolve => setTimeout(resolve, UX_DELAYS.CSV_PROCESSING_MIN));

            const { sources, totalRow } = await parseTrafficCsv(file);

            if (sources.length === 0 && !totalRow) {
                // No valid data found - open mapper modal for manual column mapping
                await onUpload([], undefined, file);
                return;
            }
            await onUpload(sources, totalRow, file);
        } catch (err: any) {
            console.error(err);

            // Handle specific validation errors
            if (err.message === 'NO_VIDEO_DATA') {
                showToast("No video data found in CSV", "error");
                return; // Stop here, do not open mapper
            }

            // If headers are missing/unrecognized, OR general parse error -> Open Mapper
            // This covers 'MAPPING_REQUIRED' and unexpected errors
            await onUpload([], undefined, file);
        } finally {
            setIsInputProcessing(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (isBusy) return;
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        if (isBusy) return;
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) await processFile(file);
    };

    // Compact Mode (Button only)
    if (isCompact) {
        return (
            <div>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".csv"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) processFile(file);
                        // Reset value so same file can be selected again
                        e.target.value = '';
                    }}
                />
                <Button
                    onClick={() => !isBusy && fileInputRef.current?.click()}
                    disabled={isBusy}
                    variant="secondary"
                    size="sm"
                    leftIcon={isBusy ? <Loader2 className="animate-spin" /> : <Upload />}
                >
                    {isBusy ? 'Processing...' : (hasExistingSnapshot ? 'Update CSV' : 'Upload CSV')}
                </Button>
                {error && <div className="text-red-500 text-xs mt-1 absolute">{error}</div>}
            </div>
        );
    }

    // Full Mode (Drag & Drop Area)
    return (
        <div
            className={`
                relative h-[200px] flex flex-col items-center justify-center text-center transition-all duration-300
                border-2 rounded-xl
                ${isBusy
                    ? 'border-transparent bg-bg-secondary/50 cursor-wait'
                    : `cursor-pointer border-dashed ${isDragging ? 'border-accent-blue bg-accent-blue/5' : 'border-white/10 hover:border-white bg-transparent'}`
                }
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isBusy && fileInputRef.current?.click()}
        >
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processFile(file);
                }}
            />

            <div className="flex flex-col items-center gap-3">
                {isBusy ? (
                    <>
                        <div className="w-12 h-12 rounded-full bg-accent-blue/10 flex items-center justify-center text-accent-blue mb-1">
                            <Loader2 className="animate-spin" size={24} />
                        </div>
                        <div className="space-y-1 animate-pulse">
                            <h3 className="text-sm font-medium text-text-primary">
                                {isInputProcessing ? 'Structuring Traffic Data...' : 'Saving to Database...'}
                            </h3>
                            <p className="text-xs text-text-secondary">
                                This may take a few seconds
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
                                {hasExistingSnapshot ? 'Update Suggested Traffic CSV' : 'Upload Suggested Traffic CSV'}
                            </h3>
                            <p className="text-xs text-text-secondary">
                                Drag and drop your file here, or{' '}
                                <span
                                    className="text-accent-blue hover:underline font-medium"
                                >
                                    browse
                                </span>
                            </p>
                        </div>
                    </>
                )}

                {error && !isBusy && (
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg mt-2 absolute bottom-4">
                        <AlertCircle size={14} />
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};
