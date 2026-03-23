import React from 'react';
import { ColumnMapperModal } from '../modals/ColumnMapperModal';
import { EnrichmentModal } from '../modals/EnrichmentModal';
import { parseTrafficCsv } from '../utils/csvParser';
import type { TrafficSource } from '../../../../../core/types/suggestedTraffic/traffic';
import type { CsvMapping } from '../utils/csvParser';
import { useUIStore } from '../../../../../core/stores/uiStore';

interface TrafficModalsProps {
    // Column Mapper Modal
    isMapperOpen: boolean;
    failedFile: File | null;
    onMapperClose: () => void;
    onCsvUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<string | null>;

    // Enrichment Modal
    isEnrichmentOpen: boolean;
    missingCount: number;
    unenrichedCount: number;
    estimatedQuota: number;
    onEnrichmentConfirm: () => void;
    onEnrichmentClose: () => void;
    isEnriching: boolean;
}

/**
 * Groups all Traffic Tab modal windows into a single component.
 */
export const TrafficModals: React.FC<TrafficModalsProps> = ({
    isMapperOpen,
    failedFile,
    onMapperClose,
    onCsvUpload,

    isEnrichmentOpen,
    missingCount,
    unenrichedCount,
    estimatedQuota,
    onEnrichmentConfirm,
    onEnrichmentClose,
    isEnriching,
}) => {
    const { showToast } = useUIStore();

    const handleMapperConfirm = async (mapping: CsvMapping) => {
        if (!failedFile) return;

        try {
            const { sources, totalRow } = await parseTrafficCsv(failedFile, mapping);
            await onCsvUpload(sources, totalRow, failedFile);
            onMapperClose();
        } catch {
            showToast('Mapping failed to produce valid data.', 'error');
        }
    };

    return (
        <>
            <ColumnMapperModal
                isOpen={isMapperOpen}
                onClose={onMapperClose}
                file={failedFile}
                onConfirm={handleMapperConfirm}
            />

            <EnrichmentModal
                isOpen={isEnrichmentOpen}
                missingCount={missingCount}
                unenrichedCount={unenrichedCount}
                estimatedQuota={estimatedQuota}
                onConfirm={onEnrichmentConfirm}
                onClose={onEnrichmentClose}
                isEnriching={isEnriching}
            />
        </>
    );
};
