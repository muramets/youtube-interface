import React, { useState, useCallback, useRef } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import type { TrafficSource } from '../../../../../core/types/traffic';

/**
 * BUSINESS LOGIC: CSV Upload Modal
 * 
 * This modal is shown when:
 * 1. Creating a new version (closes previous version)
 * 2. Restoring a version (closes currently active version)
 * 
 * The modal:
 * - Explains WHY we need the CSV (to close the current version)
 * - Shows which version will be closed
 * - Allows cancellation (version will still be created with last known snapshot)
 * - Validates CSV format before accepting
 * - Provides premium drag & drop UX
 */

interface CsvUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpload: (sources: TrafficSource[], totalRow?: TrafficSource) => void;
    onSkip: () => void;
    title: string;
    description: string;
    closingVersion: number | 'draft';
}

export const CsvUploadModal: React.FC<CsvUploadModalProps> = ({
    isOpen,
    onClose,
    onUpload,
    onSkip,
    title,
    description,
    closingVersion
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewData, setPreviewData] = useState<{ sources: TrafficSource[]; totalRow?: TrafficSource } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * BUSINESS LOGIC: CSV Parsing
     * 
     * Parses the uploaded CSV file and validates the format.
     * Expected columns: Source Type, Source Title, Video ID, Impressions, CTR, Views, etc.
     * 
     * Returns parsed TrafficSource array or throws error if invalid format.
     */
    const parseCSV = useCallback(async (file: File): Promise<{ sources: TrafficSource[]; totalRow?: TrafficSource }> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const text = e.target?.result as string;
                    const lines = text.split('\n').filter(line => line.trim());

                    if (lines.length < 2) {
                        reject(new Error('CSV file is empty or has no data rows'));
                        return;
                    }

                    // Parse header
                    const headers = lines[0].split(',').map(h => h.trim());

                    // Validate required columns
                    const requiredColumns = ['Source Type', 'Source Title', 'Impressions', 'CTR', 'Views'];
                    const missingColumns = requiredColumns.filter(col => !headers.includes(col));

                    if (missingColumns.length > 0) {
                        reject(new Error(`Missing required columns: ${missingColumns.join(', ')}`));
                        return;
                    }

                    // Parse data rows
                    const sources: TrafficSource[] = [];
                    let totalRow: TrafficSource | undefined;

                    for (let i = 1; i < lines.length; i++) {
                        const values = lines[i].split(',').map(v => v.trim());
                        const row: any = {};

                        headers.forEach((header, index) => {
                            row[header] = values[index] || '';
                        });

                        // Extract video ID from Source Title if present
                        const videoIdMatch = row['Source Title']?.match(/videoId=([^&\s]+)/);
                        const videoId = videoIdMatch ? videoIdMatch[1] : null;

                        const source: TrafficSource = {
                            sourceType: row['Source Type'] || '',
                            sourceTitle: row['Source Title'] || '',
                            videoId,
                            impressions: parseInt(row['Impressions']?.replace(/,/g, '') || '0'),
                            ctr: parseFloat(row['CTR']?.replace('%', '') || '0'),
                            views: parseInt(row['Views']?.replace(/,/g, '') || '0'),
                            avgViewDuration: row['Avg View Duration'] || '00:00:00',
                            watchTimeHours: parseFloat(row['Watch Time (hours)']?.replace(/,/g, '') || '0')
                        };

                        // Check if this is the total row
                        if (source.sourceType.toLowerCase().includes('total')) {
                            totalRow = source;
                        } else {
                            sources.push(source);
                        }
                    }

                    resolve({ sources, totalRow });
                } catch (err) {
                    reject(new Error(`Failed to parse CSV: ${err instanceof Error ? err.message : 'Unknown error'}`));
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }, []);

    /**
     * Handle file selection (from input or drag & drop)
     */
    const handleFileSelect = useCallback(async (selectedFile: File) => {
        setError(null);
        setFile(selectedFile);
        setIsProcessing(true);

        try {
            const parsed = await parseCSV(selectedFile);
            setPreviewData(parsed);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to parse CSV');
            setPreviewData(null);
        } finally {
            setIsProcessing(false);
        }
    }, [parseCSV]);

    /**
     * Drag & Drop handlers
     */
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.type === 'text/csv') {
            handleFileSelect(droppedFile);
        } else {
            setError('Please upload a CSV file');
        }
    }, [handleFileSelect]);

    /**
     * Handle file input change
     */
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            handleFileSelect(selectedFile);
        }
    }, [handleFileSelect]);

    /**
     * Handle upload confirmation
     */
    const handleConfirmUpload = useCallback(() => {
        if (previewData) {
            onUpload(previewData.sources, previewData.totalRow);
            onClose();
        }
    }, [previewData, onUpload, onClose]);

    /**
     * Handle skip
     */
    const handleSkip = useCallback(() => {
        onSkip();
        onClose();
    }, [onSkip, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-bg-primary border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <div className="flex-1">
                        <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
                        <p className="text-sm text-text-secondary mt-1">{description}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-bg-secondary"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Info Alert */}
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
                        <div className="flex gap-3">
                            <AlertCircle size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm text-text-primary font-medium mb-1">
                                    Why do we need this CSV?
                                </p>
                                <p className="text-sm text-text-secondary">
                                    This CSV will capture the traffic data for <span className="font-medium text-text-primary">v.{closingVersion}</span> at
                                    the moment it's being replaced. This allows you to see how many views each version received.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Upload Area */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`
                            border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer
                            ${isDragging
                                ? 'border-accent bg-accent/5'
                                : 'border-border hover:border-accent/50 hover:bg-bg-secondary'
                            }
                            ${error ? 'border-red-500/50' : ''}
                        `}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleInputChange}
                            className="hidden"
                        />

                        <div className="flex flex-col items-center gap-4">
                            {isProcessing ? (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center animate-pulse">
                                        <FileText size={24} className="text-accent" />
                                    </div>
                                    <p className="text-sm text-text-secondary">Processing CSV...</p>
                                </>
                            ) : previewData ? (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                                        <CheckCircle size={24} className="text-green-400" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-text-primary">{file?.name}</p>
                                        <p className="text-xs text-text-secondary mt-1">
                                            {previewData.sources.length} traffic sources found
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-bg-secondary flex items-center justify-center">
                                        <Upload size={24} className="text-text-secondary" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-text-primary">
                                            Drop CSV file here or click to browse
                                        </p>
                                        <p className="text-xs text-text-secondary mt-1">
                                            Supports YouTube Analytics traffic source CSV exports
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                            <div className="flex gap-3">
                                <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm text-red-400 font-medium">Error</p>
                                    <p className="text-sm text-text-secondary mt-1">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Preview */}
                    {previewData && !error && (
                        <div className="mt-4 bg-bg-secondary rounded-lg p-4">
                            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
                                Preview
                            </p>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-text-secondary">Traffic Sources:</span>
                                    <span className="text-text-primary font-medium">{previewData.sources.length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-text-secondary">Total Views:</span>
                                    <span className="text-text-primary font-medium">
                                        {previewData.totalRow?.views.toLocaleString() || 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-text-secondary">Total Impressions:</span>
                                    <span className="text-text-primary font-medium">
                                        {previewData.totalRow?.impressions.toLocaleString() || 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-6 border-t border-border bg-bg-secondary">
                    <button
                        onClick={handleSkip}
                        className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                    >
                        Skip (use last known data)
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-text-primary bg-bg-primary border border-border rounded-lg hover:bg-bg-secondary transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmUpload}
                            disabled={!previewData || !!error}
                            className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Upload & Continue
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
