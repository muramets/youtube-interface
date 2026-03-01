// =============================================================================
// Traffic Source Tab
//
// Main tab component for Traffic Sources — upload CSV, view snapshots,
// toggle cumulative/delta view. Layout mirrors Suggested Traffic tab.
// =============================================================================

import React, { useCallback, useState, useMemo, useRef } from 'react';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { TrafficSourceTable } from './components/TrafficSourceTable';
import { parseTrafficSourceCsv } from './utils/trafficSourceParser';
import type { TrafficSourceCsvMapping } from './utils/trafficSourceParser';
import { TrafficSourceColumnMapperModal } from './modals/TrafficSourceColumnMapperModal';
import { useTrafficSourceDataLoader } from './hooks/useTrafficSourceDataLoader';
import { CsvDropZone } from '../../../../components/ui/molecules/CsvDropZone';
import { SegmentedControl } from '../../../../components/ui/molecules/SegmentedControl';
import { FilterDropdown } from '../../../../components/ui/molecules/FilterDropdown';
import { Button } from '../../../../components/ui/atoms/Button/Button';
import type { TrafficSourceData, TrafficSourceMetric } from '../../../../core/types/trafficSource';

interface TrafficSourceTabProps {
    video: { id: string; publishedAt?: string };
    trafficSourceData: TrafficSourceData | null;
    isLoading: boolean;
    isSaving: boolean;
    selectedSnapshot: string | null;
    viewMode: 'cumulative' | 'delta';
    onViewModeChange: (mode: 'cumulative' | 'delta') => void;
    onSnapshotUploaded: (snapshotId: string) => void;
    handleCsvUpload: (
        metrics: TrafficSourceMetric[],
        totalRow: TrafficSourceMetric | undefined,
        file: File
    ) => Promise<string | null>;
}

const VIEW_MODE_OPTIONS = [
    { value: 'cumulative' as const, label: 'Total' },
    { value: 'delta' as const, label: 'New' },
];

export const TrafficSourceTab = React.memo<TrafficSourceTabProps>(({
    trafficSourceData,
    isLoading: isLoadingData,
    isSaving,
    selectedSnapshot,
    viewMode,
    onViewModeChange,
    onSnapshotUploaded,
    handleCsvUpload,
}) => {
    const [parseError, setParseError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Column Mapper modal state
    const [isMapperOpen, setIsMapperOpen] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    // Data loader (downloads CSV from Cloud Storage + delta calc)
    const {
        displayedMetrics,
        totalRow,
        isLoading: isLoadingSnapshot,
        error: loaderError,
        retry,
    } = useTrafficSourceDataLoader({
        trafficSourceData,
        selectedSnapshot,
        viewMode,
    });

    const hasSnapshots = (trafficSourceData?.snapshots?.length ?? 0) > 0;
    const isLoading = isLoadingData || isLoadingSnapshot;

    // Check if delta is possible (need at least 2 snapshots)
    const canDelta = useMemo(() => {
        if (!trafficSourceData || !selectedSnapshot) return false;
        const sorted = [...trafficSourceData.snapshots].sort((a, b) => a.timestamp - b.timestamp);
        const idx = sorted.findIndex(s => s.id === selectedSnapshot);
        return idx > 0;
    }, [trafficSourceData, selectedSnapshot]);

    // SegmentedControl options with disabled state
    const viewModeOptions = useMemo(() =>
        VIEW_MODE_OPTIONS.map(o => ({
            ...o,
            disabled: o.value === 'delta' && !canDelta,
        })),
        [canDelta]
    );

    // Handle file processing — auto-selects snapshot after upload
    const processFile = useCallback(async (file: File) => {
        setParseError(null);
        try {
            const { metrics, totalRow } = await parseTrafficSourceCsv(file);
            const snapshotId = await handleCsvUpload(metrics, totalRow, file);
            if (snapshotId) onSnapshotUploaded(snapshotId);
        } catch (err) {
            if (err instanceof Error) {
                if (err.message === 'MAPPING_REQUIRED') {
                    setPendingFile(file);
                    setIsMapperOpen(true);
                } else if (err.message === 'NO_DATA') {
                    setParseError('No valid data rows found in CSV.');
                } else {
                    setParseError(`Failed to parse CSV: ${err.message}`);
                }
            }
        }
    }, [handleCsvUpload, onSnapshotUploaded]);

    // Handle manual mapping from Column Mapper modal — auto-selects snapshot after upload
    const handleManualMapping = useCallback(async (mapping: TrafficSourceCsvMapping) => {
        if (!pendingFile) return;
        setIsMapperOpen(false);
        setParseError(null);

        try {
            const { metrics, totalRow } = await parseTrafficSourceCsv(pendingFile, mapping);
            const snapshotId = await handleCsvUpload(metrics, totalRow, pendingFile);
            if (snapshotId) onSnapshotUploaded(snapshotId);
        } catch (err) {
            if (err instanceof Error) {
                setParseError(`Failed to parse with manual mapping: ${err.message}`);
            }
        } finally {
            setPendingFile(null);
        }
    }, [pendingFile, handleCsvUpload, onSnapshotUploaded]);

    // ── Empty state (no snapshots) ──
    if (!hasSnapshots && !isLoadingData) {
        return (
            <>
                <div className="w-full h-full flex flex-col px-6 py-4">
                    <h2 className="text-xl font-medium text-text-primary mb-4">
                        No Traffic Sources Data Yet
                    </h2>

                    <div className="mb-8">
                        <p className="text-text-secondary text-sm leading-relaxed max-w-3xl">
                            Upload the <strong>"Traffic source"</strong> CSV export from YouTube Analytics.
                            Track how impressions, CTR, and views evolve across traffic sources over time by uploading periodic snapshots.
                        </p>
                    </div>

                    <div className="flex flex-col">
                        <div className="w-full max-w-3xl">
                            <CsvDropZone
                                onFileSelect={processFile}
                                title="Upload Traffic Source CSV"
                                subtitle="YouTube Analytics → Traffic Source → Export"
                                isProcessing={isSaving}
                                processingLabel="Saving snapshot..."
                            />
                        </div>
                    </div>

                    {parseError && (
                        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg mt-3 max-w-3xl">
                            <AlertCircle size={14} />
                            {parseError}
                        </div>
                    )}
                </div>

                <TrafficSourceColumnMapperModal
                    isOpen={isMapperOpen}
                    onClose={() => { setIsMapperOpen(false); setPendingFile(null); }}
                    file={pendingFile}
                    onConfirm={handleManualMapping}
                />
            </>
        );
    }

    // ── Main view — mirrors TrafficHeader layout ──
    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header — matches TrafficHeader: sticky, px-6 py-4, text-2xl, max-w-[1200px] */}
            <div className="sticky top-0 z-dropdown px-6 py-4 bg-video-edit-bg flex-shrink-0">
                <div className="flex items-center justify-between gap-4 max-w-[1200px]">
                    <div>
                        <h1 className="text-2xl font-medium text-text-primary">Traffic Sources</h1>
                    </div>

                    {/* Actions — Filter + Upload */}
                    <div className="flex gap-2">
                        {/* View Mode inside FilterDropdown (matches Suggested Traffic pattern) */}
                        <FilterDropdown align="right" width="220px">
                            {() => (
                                <div className="p-3">
                                    <div className="text-xs text-text-secondary uppercase tracking-wider mb-2 font-medium">
                                        View Mode
                                    </div>
                                    <SegmentedControl
                                        options={viewModeOptions}
                                        value={viewMode}
                                        onChange={onViewModeChange}
                                    />
                                </div>
                            )}
                        </FilterDropdown>

                        {/* Upload button — Button atom */}
                        {!isLoading && (
                            <>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={isSaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isSaving}
                                >
                                    Upload CSV
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) processFile(file);
                                        e.target.value = '';
                                    }}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Error banner */}
            {(parseError || loaderError) && (
                <div className="flex items-center gap-2 px-6 py-2 bg-red-400/5 text-red-400 text-xs border-b border-white/5">
                    <AlertCircle size={14} />
                    {parseError || loaderError}
                    {loaderError && (
                        <button
                            onClick={retry}
                            className="ml-2 px-2 py-0.5 rounded border border-current bg-transparent text-inherit text-xs cursor-pointer"
                        >
                            Retry
                        </button>
                    )}
                </div>
            )}

            {/* Content area — mirrors TrafficTab: padded, max-width constrained */}
            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
                <div className="max-w-[1200px]">
                    {/* Loading */}
                    {isLoading && (
                        <div className="flex items-center justify-center py-20 text-text-tertiary">
                            <Loader2 size={24} className="animate-spin" />
                        </div>
                    )}

                    {/* No snapshot selected */}
                    {!isLoading && !selectedSnapshot && hasSnapshots && (
                        <div className="flex items-center justify-center py-20 text-text-tertiary text-sm">
                            Select a snapshot from the sidebar
                        </div>
                    )}

                    {/* Table */}
                    {!isLoading && selectedSnapshot && (
                        <TrafficSourceTable
                            metrics={displayedMetrics}
                            totalRow={totalRow}
                            viewMode={viewMode}
                        />
                    )}
                </div>
            </div>

            {/* Column Mapper Modal */}
            <TrafficSourceColumnMapperModal
                isOpen={isMapperOpen}
                onClose={() => { setIsMapperOpen(false); setPendingFile(null); }}
                file={pendingFile}
                onConfirm={handleManualMapping}
            />
        </div>
    );
});

TrafficSourceTab.displayName = 'TrafficSourceTab';
