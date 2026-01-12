import React from 'react';
import { ColumnMapperModal } from '../modals/ColumnMapperModal';
import { MissingTitlesModal } from '../modals/MissingTitlesModal';
import { parseTrafficCsv } from '../utils/csvParser';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { CsvMapping } from '../utils/csvParser';

interface TrafficModalsProps {
    // Column Mapper Modal
    isMapperOpen: boolean;
    failedFile: File | null;
    onMapperClose: () => void;
    onCsvUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<string | null>;

    // Missing Titles Modal
    isMissingTitlesOpen: boolean;
    missingTitlesCount: number;
    estimatedQuota: number;
    onMissingTitlesConfirm: () => void;
    onMissingTitlesClose: () => void;
    isRestoringTitles: boolean;
    missingTitlesVariant?: 'sync' | 'assistant';
}

/**
 * Группирует все модальные окна Traffic Tab в одном компоненте.
 * Упрощает управление состоянием модалок в основном компоненте.
 */
export const TrafficModals: React.FC<TrafficModalsProps> = ({
    isMapperOpen,
    failedFile,
    onMapperClose,
    onCsvUpload,

    // Missing Titles Props
    isMissingTitlesOpen,
    missingTitlesCount,
    estimatedQuota,
    onMissingTitlesConfirm,
    onMissingTitlesClose,
    isRestoringTitles,
    missingTitlesVariant = 'sync'
}) => {
    const handleMapperConfirm = async (mapping: CsvMapping) => {
        if (!failedFile) return;

        try {
            const { sources, totalRow } = await parseTrafficCsv(failedFile, mapping);
            await onCsvUpload(sources, totalRow, failedFile);
            onMapperClose();
        } catch (e) {
            alert("Mapping failed to produce valid data.");
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

            <MissingTitlesModal
                isOpen={isMissingTitlesOpen}
                missingCount={missingTitlesCount}
                estimatedQuota={estimatedQuota}
                onConfirm={onMissingTitlesConfirm}
                onClose={onMissingTitlesClose}
                isRestoring={isRestoringTitles}
                variant={missingTitlesVariant}
            />
        </>
    );
};
