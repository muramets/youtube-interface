import React, { useRef, useState } from 'react';
import { Upload, AlertCircle, Loader2, Check } from 'lucide-react';
import { parseTrafficCsv } from '../utils/csvParser';
import type { TrafficSource } from '../../../../../core/types/traffic';
import { Button } from '../../../../../components/ui/atoms/Button/Button';
import { SplitButton } from '../../../../../components/ui/atoms/SplitButton/SplitButton';
import { Badge } from '../../../../../components/ui/atoms/Badge/Badge';
import { CsvDropZone } from '../../../../../components/ui/molecules/CsvDropZone';
import { formatPremiumPeriod } from '../utils/dateUtils';
import { useUIStore } from '../../../../../core/stores/uiStore';
import { UX_DELAYS } from '../utils/constants';
import { logger } from '../../../../../core/utils/logger';

export interface VersionOption {
    versionNumber: number;
    label: string;           // e.g. "v.3"
    isActive: boolean;
    periodStart?: number;    // timestamp — start of active period
    periodEnd?: number | null; // timestamp — end of active period (null = still active)
}

interface TrafficUploaderProps {
    onUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<void>;
    isLoading?: boolean;
    isCompact?: boolean;
    hasExistingSnapshot?: boolean; // If true, show "Update CSV" instead of "Upload CSV"
    /** Available packaging versions for version-targeted upload */
    availableVersions?: VersionOption[];
    /** Currently selected target version */
    targetVersion?: number;
    /** Callback when user changes target version */
    onTargetVersionChange?: (version: number) => void;
}

export const TrafficUploader: React.FC<TrafficUploaderProps> = ({
    onUpload,
    isLoading,
    isCompact = false,
    hasExistingSnapshot = false,
    availableVersions = [],
    targetVersion,
    onTargetVersionChange
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isInputProcessing, setIsInputProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useUIStore();

    const isBusy = isLoading || isInputProcessing;
    const hasSplitButton = availableVersions.length > 1 && onTargetVersionChange;

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
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error('Unknown error');
            logger.error('Failed to process CSV file', { component: 'TrafficUploader', error });

            // Handle specific validation errors
            if (error.message === 'NO_VIDEO_DATA') {
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

    const triggerFileInput = () => {
        if (!isBusy) fileInputRef.current?.click();
    };

    // Hidden file input (shared between compact and full modes)
    const fileInput = (
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
    );

    // Compact Mode
    if (isCompact) {
        const actionLabel = hasExistingSnapshot ? 'Update CSV' : 'Upload CSV';
        const versionLabel = targetVersion ? `${actionLabel} → v.${targetVersion}` : actionLabel;

        // Split button mode: version picker via chevron
        if (hasSplitButton) {
            return (
                <div>
                    {fileInput}
                    <SplitButton
                        label={versionLabel}
                        onClick={triggerFileInput}
                        disabled={isBusy}
                        isLoading={isBusy}
                        loadingLabel="Processing..."
                        leftIcon={<Upload size={14} />}
                        variant="secondary"
                        size="sm"
                    >
                        <div className="py-1">
                            {availableVersions.map(v => (
                                <button
                                    key={v.versionNumber}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onTargetVersionChange(v.versionNumber);
                                        // Auto-trigger file dialog after version selection
                                        setTimeout(() => triggerFileInput(), 100);
                                    }}
                                    className={`
                                        w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer
                                        flex items-center gap-1.5 border-none
                                        ${v.versionNumber === targetVersion
                                            ? 'text-text-primary font-medium bg-hover-bg'
                                            : 'text-text-secondary bg-transparent hover:text-text-primary hover:bg-hover-bg'
                                        }
                                    `}
                                >
                                    <span className="font-medium flex-shrink-0">{v.label}</span>
                                    {v.isActive && (
                                        <Badge variant="success" className="px-1.5 py-0 text-[9px]">Active</Badge>
                                    )}
                                    {!v.isActive && v.periodStart && (
                                        <Badge variant="warning" className="px-1.5 py-0 text-[9px]">
                                            {formatPremiumPeriod(v.periodStart, v.periodEnd ?? null)}
                                        </Badge>
                                    )}
                                    {v.versionNumber === targetVersion && (
                                        <Check size={12} className="text-text-primary flex-shrink-0 ml-auto" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </SplitButton>
                    {error && <div className="text-red-500 text-xs mt-1 absolute">{error}</div>}
                </div>
            );
        }

        // Fallback: simple button (1 version or no version picker)
        return (
            <div>
                {fileInput}
                <Button
                    onClick={triggerFileInput}
                    disabled={isBusy}
                    variant="secondary"
                    size="sm"
                    leftIcon={isBusy ? <Loader2 className="animate-spin" /> : <Upload />}
                >
                    {isBusy ? 'Processing...' : actionLabel}
                </Button>
                {error && <div className="text-red-500 text-xs mt-1 absolute">{error}</div>}
            </div>
        );
    }

    // Full Mode — shared CsvDropZone molecule
    return (
        <div>
            <CsvDropZone
                onFileSelect={processFile}
                isProcessing={isBusy}
                processingLabel={isInputProcessing ? 'Structuring Traffic Data...' : 'Saving to Database...'}
                title={hasExistingSnapshot ? 'Update Suggested Traffic CSV' : 'Upload Suggested Traffic CSV'}
                subtitle={targetVersion ? `→ v.${targetVersion}` : undefined}
            />
            {error && !isBusy && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg mt-2">
                    <AlertCircle size={14} />
                    {error}
                </div>
            )}
        </div>
    );
};
