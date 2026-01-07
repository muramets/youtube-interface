import type { TrafficSource } from '../types/traffic';

export interface CsvMapping {
    sourceId: number;
    sourceType: number;
    sourceTitle: number;
    impressions: number;
    ctr: number;
    views: number;
    avgDuration: number;
    watchTime: number;
}

export const DEFAULT_MAPPING: CsvMapping = {
    sourceId: 0,
    sourceType: 1,
    sourceTitle: 2,
    impressions: 3,
    ctr: 4,
    views: 5,
    avgDuration: 6,
    watchTime: 7
};

export const parseTrafficCsv = async (
    file: File,
    mapping: CsvMapping = DEFAULT_MAPPING
): Promise<{ sources: TrafficSource[], totalRow?: TrafficSource }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return resolve({ sources: [] });

            try {
                const lines = text.split('\n');
                const sources: TrafficSource[] = [];
                let totalRow: TrafficSource | undefined;

                // Helper to parse CSV line respecting quotes
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

                // Helper to clean quotes
                const clean = (s: string) => s?.replace(/^"|"$/g, '').trim();

                // Skip header (line 0)
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const cols = parseLine(line);

                    // Basic validation: ensure we have enough columns for the critical fields
                    const maxIndex = Math.max(...Object.values(mapping));
                    if (cols.length <= maxIndex) continue;

                    const sourceId = clean(cols[mapping.sourceId]);

                    const source: TrafficSource = {
                        sourceType: clean(cols[mapping.sourceType]),
                        sourceTitle: clean(cols[mapping.sourceTitle]),
                        videoId: null,
                        impressions: parseInt(clean(cols[mapping.impressions]) || '0'),
                        ctr: parseFloat(clean(cols[mapping.ctr]) || '0'),
                        views: parseInt(clean(cols[mapping.views]) || '0'),
                        avgViewDuration: clean(cols[mapping.avgDuration]),
                        watchTimeHours: parseFloat(clean(cols[mapping.watchTime]) || '0')
                    };

                    if (sourceId === 'Total') {
                        totalRow = source;
                    } else {
                        // Extract Video ID if it's a YT_RELATED source
                        if (sourceId.startsWith('YT_RELATED.')) {
                            source.videoId = sourceId.replace('YT_RELATED.', '');
                        }
                        sources.push(source);
                    }
                }

                resolve({ sources, totalRow });

            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
    });
};
