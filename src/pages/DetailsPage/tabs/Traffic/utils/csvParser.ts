import type { TrafficSource } from '../../../../../core/types/traffic';
import { logger } from '../../../../../core/utils/logger';

export interface CsvMapping {
    sourceId: number;
    sourceType: number;
    sourceTitle: number;
    impressions: number;
    ctr: number;
    views: number;
    avgDuration: number;
    watchTime: number;
    channelId?: number; // Optional, added for Smart Assistant enrichment persistence
}

// Default mapping based on standard YouTube Analytics export
// Columns: "Traffic source", "Source type", "Source title", "Impressions", "Impressions click-through rate (%)", "Views", "Average view duration", "Watch time (hours)"
export const DEFAULT_MAPPING: CsvMapping = {
    sourceId: 0,       // "Traffic source"
    sourceType: 1,     // "Source type"
    sourceTitle: 2,    // "Source title"
    impressions: 3,    // "Impressions"
    ctr: 4,            // "Impressions click-through rate (%)"
    views: 5,          // "Views"
    avgDuration: 6,    // "Average view duration"
    watchTime: 7,      // "Watch time (hours)"
    channelId: 8       // "Channel ID" (Custom enriched column)
};

// Known headers for auto-detection
const HEADER_KEYWORDS: Record<keyof CsvMapping, string[]> = {
    sourceId: ['Traffic source', 'Source'],
    sourceType: ['Source type', 'Type'],
    sourceTitle: ['Source title', 'Title'],
    impressions: ['Impressions'],
    ctr: ['Impressions click-through rate', 'CTR'],
    views: ['Views'],
    avgDuration: ['Average view duration', 'Duration'],
    watchTime: ['Watch time (hours)', 'Watch time', 'Hours'],
    channelId: ['Channel ID', 'Channel Id', 'channel_id']
};

/**
 * Smart CSV Parser
 * 
 * Business Logic:
 * 1. Reads the first line to identify headers.
 * 2. If valid headers are found, generates a dynamic mapping tailored to this specific file.
 *    This handles cases where the user has customized columns or if YouTube changes the export format.
 * 3. Fallback: If headers are missing or unrecognizable, attempts to use the DEFAULT_MAPPING or the user-provided mapping.
 * 4. Critical Logic: Validates that essential columns (Views, Traffic source) are mapped. If not, parsing fails 
 *    so the UI can prompt the user to map columns manually.
 */
export const parseTrafficCsv = async (
    file: File,
    userMapping?: CsvMapping
): Promise<{ sources: TrafficSource[], totalRow?: TrafficSource }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return resolve({ sources: [] });

            try {
                const lines = text.split('\n');
                if (lines.length < 2) return resolve({ sources: [] }); // Empty or single line file

                // 1. Header Analysis
                const headerLine = lines[0].trim();
                const headers = parseLine(headerLine).map(h => h.toLowerCase().replace(/['"]/g, '').trim());

                let activeMapping = userMapping;

                // If no user mapping is provided, try to auto-detect from headers
                if (!activeMapping) {
                    const detectedMapping = detectMapping(headers);

                    // DEBUG: Log detected mapping in detail
                    logger.debug('CSV parsing auto-detect', {
                        component: 'csvParser',
                        headers,
                        detectedMapping
                    });

                    // Check if detection was successful for ALL required columns
                    // We require all columns to be present to safely import.
                    const requiredKeys: (keyof CsvMapping)[] = [
                        'sourceId', 'sourceType', 'sourceTitle',
                        'impressions', 'ctr', 'views',
                        'avgDuration', 'watchTime'
                    ];

                    const missingColumns = requiredKeys.filter(key =>
                        !detectedMapping || detectedMapping[key] === -1
                    );

                    if (missingColumns.length > 0) {
                        // Logic Step 1: Headers missing or not recognized
                        // We do NOT partial match or fallback to default. Strict mode.
                        throw new Error("MAPPING_REQUIRED");
                    }

                    activeMapping = detectedMapping!;
                    logger.debug('CSV columns auto-detected', {
                        component: 'csvParser',
                        mapping: activeMapping,
                        sourceIdCol: activeMapping.sourceId,
                        viewsCol: activeMapping.views
                    });
                }

                // 2. Data Parsing
                const sources: TrafficSource[] = [];
                let totalRow: TrafficSource | undefined;

                const clean = (s: string) => s?.replace(/^"|"$/g, '').trim();

                // Start from line 1 (skip header)
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const cols = parseLine(line);

                    // Skip simple incomplete lines
                    if (cols.length < 2) continue;

                    // Safe extraction using mapping is handled inline below

                    // Extract ID directly using the activeMapping
                    const rawId = cols[activeMapping!.sourceId];
                    const sourceId = clean(rawId);

                    // Skip invalid rows (e.g. malformed CSV tail)
                    if (!sourceId && cols.every(c => !c.trim())) continue;

                    let channelId = null;
                    if (activeMapping.channelId !== undefined && activeMapping.channelId !== -1) {
                        channelId = clean(cols[activeMapping.channelId] || '');
                    }

                    const source: TrafficSource = {
                        sourceType: clean(cols[activeMapping!.sourceType] || ''),
                        sourceTitle: clean(cols[activeMapping!.sourceTitle] || ''),
                        videoId: null,
                        impressions: parseInt(clean(cols[activeMapping!.impressions] || '0').replace(/[^0-9]/g, '') || '0'),
                        ctr: parseFloat(clean(cols[activeMapping!.ctr] || '0').replace('%', '') || '0'),
                        views: parseInt(clean(cols[activeMapping!.views] || '0').replace(/[^0-9]/g, '') || '0'),
                        avgViewDuration: clean(cols[activeMapping!.avgDuration] || ''),
                        watchTimeHours: parseFloat(clean(cols[activeMapping!.watchTime] || '0').replace(/[^0-9.]/g, '') || '0'),
                        channelId: channelId || undefined
                    };

                    // 3. Row Classification / Strict Validation
                    // We ONLY accept two types of rows:
                    // 1. Total row (sourceId === 'Total')
                    // 2. Video row (sourceId must start with 'YT_RELATED.')
                    // Everything else is considered garbage and ignored.

                    const isTotalRow = sourceId?.toLowerCase().includes('total');

                    if (isTotalRow) {
                        totalRow = source;
                        logger.debug('CSV Total row identified', {
                            component: 'csvParser',
                            sourceId,
                            impressions: source.impressions,
                            views: source.views
                        });
                    } else if (sourceId?.startsWith('YT_RELATED.')) {
                        source.videoId = sourceId.replace('YT_RELATED.', '');
                        // Double check: it must have valid data
                        if (source.views >= 0) { // Accept 0 views if it's a valid YT_RELATED row
                            sources.push(source);
                        }
                    }
                    // Note: Rows not matching above conditions are silently dropped (garbage collection)
                }

                // Logic Step 2: Data Validation
                // If headers matched but we found NO valid video rows -> Invalid Data
                if (sources.length === 0) {
                    // We throw explicit error even if totalRow exists, because we need video data
                    throw new Error("NO_VIDEO_DATA");
                }

                resolve({ sources, totalRow });

            } catch (err) {
                logger.error('CSV parsing failed', {
                    component: 'csvParser',
                    error: err,
                    fileName: file?.name,
                    errorType: err instanceof Error ? err.message : 'Unknown'
                });
                reject(err);
            }
        };

        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
    });
};

// Helper: Parse CSV line respecting quotes
const parseLine = (str: string) => {
    const result = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '"') {
            inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
};

// Helper: Detect mapping from header names
const detectMapping = (headers: string[]): CsvMapping | null => {
    // Initialize with all required keys set to -1
    const mapping: Record<keyof CsvMapping, number> = {
        sourceId: -1,
        sourceType: -1,
        sourceTitle: -1,
        impressions: -1,
        ctr: -1,
        views: -1,
        avgDuration: -1,
        watchTime: -1,
        channelId: -1,
    };
    let foundCount = 0;

    // Iterate over required keys and find matching index in headers
    (Object.keys(HEADER_KEYWORDS) as Array<keyof CsvMapping>).forEach(key => {
        const keywords = HEADER_KEYWORDS[key];
        const index = headers.findIndex(h => keywords.some(k => h.includes(k.toLowerCase())));
        mapping[key] = index;
        if (index !== -1) foundCount++;
    });

    if (foundCount === 0) return null;

    return mapping as CsvMapping;
};
