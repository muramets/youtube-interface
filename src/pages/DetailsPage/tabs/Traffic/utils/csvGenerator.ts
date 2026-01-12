import type { TrafficSource } from '../../../../../core/types/traffic';

export const generateTrafficCsv = (sources: TrafficSource[], totalRow?: TrafficSource): string => {
    // 1. Headers (Standard YouTube Format)
    const headers = [
        "Traffic source",
        "Source type",
        "Source title",
        "Impressions",
        "Impressions click-through rate (%)",
        "Views",
        "Average view duration",
        "Watch time (hours)"
    ];

    const rows = [];
    rows.push(headers.join(','));

    // 2. Add Total Row if exists
    if (totalRow) {
        rows.push([
            "Total",
            "",
            "",
            totalRow.impressions,
            totalRow.ctr,
            totalRow.views,
            totalRow.avgViewDuration,
            totalRow.watchTimeHours
        ].join(','));
    }

    // 3. Add Sources
    sources.forEach(source => {
        // Format ID: if it has videoId, it's YT_RELATED + videoId, otherwise maybe it's something else?
        // In this app, we filtered for YT_RELATED only.
        const sourceId = source.videoId ? `YT_RELATED.${source.videoId}` : '';

        // Escape quotes in title
        const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;

        const row = [
            sourceId,
            source.sourceType || 'Content',
            escape(source.sourceTitle || ''),
            source.impressions,
            source.ctr,
            source.views,
            source.avgViewDuration || '0:00:00',
            source.watchTimeHours
        ];
        rows.push(row.join(','));
    });

    return rows.join('\n');
};
