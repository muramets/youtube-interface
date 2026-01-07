import React, { useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { parseTrafficCsv } from '../../../../../core/utils/csvParser';
import type { TrafficSource } from '../../../../../core/types/traffic';
import { Button } from '../../../../../components/ui/atoms/Button';

interface TrafficUploaderProps {
    onUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<void>;
    isLoading?: boolean;
    isCompact?: boolean;
}

export const TrafficUploader: React.FC<TrafficUploaderProps> = ({
    onUpload,
    isLoading,
    isCompact = false
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const processFile = async (file: File) => {
        setError(null);
        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
            setError('Please upload a valid CSV file');
            return;
        }

        try {
            const { sources, totalRow } = await parseTrafficCsv(file);
            if (sources.length === 0 && !totalRow) {
                // No valid data found - open mapper modal for manual column mapping
                await onUpload([], undefined, file);
                return;
            }
            await onUpload(sources, totalRow, file);
        } catch (err) {
            console.error(err);
            // Parse error - open mapper modal
            await onUpload([], undefined, file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
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
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    variant="secondary"
                    size="sm"
                    leftIcon={isLoading ? <Loader2 className="animate-spin" /> : <Upload />}
                >
                    {isLoading ? 'Processing...' : 'Upload CSV'}
                </Button>
                {error && <div className="text-red-500 text-xs mt-1 absolute">{error}</div>}
            </div>
        );
    }

    // Full Mode (Drag & Drop Area)
    return (
        <div
            className={`
                relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
                ${isDragging ? 'border-accent-blue bg-accent-blue/5' : 'border-white/10 hover:border-white/20 bg-bg-secondary'}
                ${isLoading ? 'opacity-50 pointer-events-none' : ''}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
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
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-text-secondary">
                    {isLoading ? <Loader2 className="animate-spin" size={24} /> : <FileText size={24} />}
                </div>

                <div className="space-y-1">
                    <h3 className="text-sm font-medium text-text-primary">
                        {isLoading ? 'Processing CSV...' : 'Upload Suggested Traffic CSV'}
                    </h3>
                    <p className="text-xs text-text-secondary">
                        Drag and drop your file here, or{' '}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="text-accent-blue hover:underline font-medium"
                        >
                            browse
                        </button>
                    </p>
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg mt-2">
                        <AlertCircle size={14} />
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};
