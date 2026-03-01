// =============================================================================
// Traffic Source CSV Parser
//
// Parses YouTube Analytics "Traffic Source" CSV exports into TrafficSourceMetric[].
// Uses shared csvUtils for line parsing and column detection.
//
// Key differences from Suggested Traffic parser (csvParser.ts):
// - 6 columns (no videoId, sourceType)
// - First column = source name (not video ID)
// - Total Row is always the FIRST data row (not last)
// - No enrichment needed — data is self-contained
// =============================================================================

import type { TrafficSourceMetric } from '../../../../../core/types/trafficSource';
import { parseCsvLine, detectColumnMapping, cleanCsvField, parseNumericField, parseIntField } from '../../../../../core/utils/csvUtils';
import { logger } from '../../../../../core/utils/logger';
import { debug } from '../../../../../core/utils/debug';

// Column mapping for Traffic Source CSV
export interface TrafficSourceCsvMapping {
    source: number;
    views: number;
    watchTime: number;
    avgDuration: number;
    impressions: number;
    ctr: number;
}

// Known header variants for auto-detection (EN + RU)
const KNOWN_HEADERS: Record<keyof TrafficSourceCsvMapping, string[]> = {
    source: ['Traffic source', 'Source', 'Источник трафика'],
    views: ['Views', 'Просмотры'],
    watchTime: ['Watch time (hours)', 'Watch time', 'Время просмотра'],
    avgDuration: ['Average view duration', 'Avg duration', 'Средняя длительность просмотра'],
    impressions: ['Impressions', 'Показы'],
    ctr: ['Impressions click-through rate', 'CTR', 'Показатель кликабельности показов'],
};

// Required columns — all are mandatory for valid import
const REQUIRED_KEYS: (keyof TrafficSourceCsvMapping)[] = [
    'source', 'views', 'watchTime', 'avgDuration', 'impressions', 'ctr'
];

/**
 * Parse a Traffic Source CSV file into structured metrics.
 *
 * @param file - CSV File object
 * @param userMapping - Optional manual column mapping (from Column Mapper modal)
 * @returns Object with `metrics` (data rows) and `totalRow` (aggregate row)
 * @throws Error("MAPPING_REQUIRED") if headers cannot be auto-detected
 * @throws Error("NO_DATA") if no valid data rows found
 */
export const parseTrafficSourceCsv = async (
    file: File,
    userMapping?: TrafficSourceCsvMapping
): Promise<{ metrics: TrafficSourceMetric[]; totalRow?: TrafficSourceMetric }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return resolve({ metrics: [] });

            try {
                const lines = text.split('\n');
                if (lines.length < 2) return resolve({ metrics: [] });

                // 1. Header Analysis
                const headerLine = lines[0].trim();
                const headers = parseCsvLine(headerLine).map(h =>
                    h.toLowerCase().replace(/['"]/g, '').trim()
                );

                let activeMapping = userMapping;

                if (!activeMapping) {
                    const detected = detectColumnMapping(headers, KNOWN_HEADERS);

                    debug.traffic('TrafficSource CSV auto-detect', { headers, detected });

                    // Validate: all required columns must be found
                    const missing = REQUIRED_KEYS.filter(key =>
                        !detected || detected[key] === -1
                    );

                    if (missing.length > 0) {
                        debug.traffic('TrafficSource CSV missing columns', { missing });
                        throw new Error('MAPPING_REQUIRED');
                    }

                    activeMapping = detected!;
                }

                // 2. Data Parsing
                const metrics: TrafficSourceMetric[] = [];
                let totalRow: TrafficSourceMetric | undefined;

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const cols = parseCsvLine(line);
                    if (cols.length < 2) continue;

                    const sourceName = cleanCsvField(cols[activeMapping.source]);
                    if (!sourceName) continue;

                    const metric: TrafficSourceMetric = {
                        source: sourceName,
                        views: parseIntField(cols[activeMapping.views]),
                        watchTimeHours: parseNumericField(cols[activeMapping.watchTime]),
                        avgViewDuration: cleanCsvField(cols[activeMapping.avgDuration]),
                        impressions: parseIntField(cols[activeMapping.impressions]),
                        ctr: parseNumericField(cols[activeMapping.ctr]),
                    };

                    // Total Row is always labeled "Total" (first data row in YouTube exports)
                    if (sourceName.toLowerCase() === 'total') {
                        totalRow = metric;
                        debug.traffic('TrafficSource Total row', {
                            views: metric.views,
                            impressions: metric.impressions,
                            ctr: metric.ctr,
                        });
                    } else {
                        metrics.push(metric);
                    }
                }

                // Validation: need at least one data row (beyond Total)
                if (metrics.length === 0) {
                    throw new Error('NO_DATA');
                }

                resolve({ metrics, totalRow });
            } catch (err) {
                logger.error('TrafficSource CSV parsing failed', {
                    component: 'trafficSourceParser',
                    error: err,
                    fileName: file?.name,
                    errorType: err instanceof Error ? err.message : 'Unknown',
                });
                reject(err);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
};
