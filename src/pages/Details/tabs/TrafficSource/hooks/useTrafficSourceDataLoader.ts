// =============================================================================
// useTrafficSourceDataLoader
//
// Loads a selected snapshot's CSV from Cloud Storage and parses it.
// Delta calculation delegated to pure function trafficSourceDelta.ts.
//
// Responsibilities:
// - I/O: download + parse CSV snapshots
// - Orchestration: wire loader output → delta calculator
// =============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { TrafficSourceData, TrafficSourceMetric } from '../../../../../core/types/trafficSource';
import { loadTrafficSourceSnapshot } from '../utils/trafficSourceSnapshotLoader';
import { calculateDelta, calculateTotalDelta } from '../utils/trafficSourceDelta';
import type { TrafficSourceDeltaMetric } from '../utils/trafficSourceDelta';

// Re-export for consumers
export type { TrafficSourceDeltaMetric };

interface UseTrafficSourceDataLoaderProps {
    trafficSourceData: TrafficSourceData | null;
    selectedSnapshot: string | null;
    viewMode: 'cumulative' | 'delta';
}

interface LoaderResult {
    displayedMetrics: TrafficSourceDeltaMetric[];
    totalRow: TrafficSourceDeltaMetric | undefined;
    isLoading: boolean;
    error: string | null;
    retry: () => void;
}

export const useTrafficSourceDataLoader = ({
    trafficSourceData,
    selectedSnapshot,
    viewMode,
}: UseTrafficSourceDataLoaderProps): LoaderResult => {
    const [currentData, setCurrentData] = useState<{
        metrics: TrafficSourceMetric[];
        totalRow?: TrafficSourceMetric;
    } | null>(null);

    const [prevData, setPrevData] = useState<{
        metrics: TrafficSourceMetric[];
        totalRow?: TrafficSourceMetric;
    } | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Find current and previous snapshots (by timestamp order)
    const { currentSnap, prevSnap } = useMemo(() => {
        if (!trafficSourceData || !selectedSnapshot) return { currentSnap: undefined, prevSnap: undefined };

        const sorted = [...trafficSourceData.snapshots].sort((a, b) => a.timestamp - b.timestamp);
        const currentIdx = sorted.findIndex(s => s.id === selectedSnapshot);
        const current = sorted[currentIdx];
        const prev = currentIdx > 0 ? sorted[currentIdx - 1] : undefined;

        return { currentSnap: current, prevSnap: prev };
    }, [trafficSourceData, selectedSnapshot]);

    // I/O: Load CSVs from Cloud Storage
    const loadData = useCallback(async () => {
        if (!currentSnap) {
            setCurrentData(null);
            setPrevData(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const result = await loadTrafficSourceSnapshot(currentSnap);
            setCurrentData(result);

            if (prevSnap) {
                const prevResult = await loadTrafficSourceSnapshot(prevSnap);
                setPrevData(prevResult);
            } else {
                setPrevData(null);
            }
        } catch (err) {
            console.error('[useTrafficSourceDataLoader] Load failed:', err);
            setError('Failed to load snapshot data');
        } finally {
            setIsLoading(false);
        }
    }, [currentSnap, prevSnap]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Computation: delegate to pure calculator
    const { displayedMetrics, totalRow } = useMemo(() => {
        if (!currentData) return { displayedMetrics: [], totalRow: undefined };

        // Cumulative mode or no previous data → return raw
        if (viewMode === 'cumulative' || !prevData) {
            return {
                displayedMetrics: currentData.metrics,
                totalRow: currentData.totalRow,
            };
        }

        // Delta mode → pure function
        const deltaMetrics = calculateDelta(currentData.metrics, prevData.metrics);

        const deltaTotalRow = (currentData.totalRow && prevData.totalRow)
            ? calculateTotalDelta(currentData.totalRow, prevData.totalRow)
            : currentData.totalRow;

        return { displayedMetrics: deltaMetrics, totalRow: deltaTotalRow };
    }, [currentData, prevData, viewMode]);

    return {
        displayedMetrics,
        totalRow,
        isLoading,
        error,
        retry: loadData,
    };
};
