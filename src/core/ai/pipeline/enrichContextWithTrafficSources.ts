// =============================================================================
// enrichContextWithTrafficSources — Enrichment middleware
//
// Post-processing step that adds Traffic Sources summary to VideoCardContext
// items that have includeTrafficSources toggle enabled.
//
// Pipeline:
//   1. Filter video items with includeTrafficSources === true
//   2. For each: fetch TrafficSourceData from Firestore
//   3. Download + parse CSV snapshots from Cloud Storage
//   4. Format into compact baseline + delta text
//   5. Inject as trafficSourcesSummary
//
// Called imperatively from chatStore.sendMessage().
// =============================================================================

import type { AppContextItem, VideoCardContext } from '../../types/appContext';
import { TrafficSourceService } from '../../services/TrafficSourceService';
import { loadTrafficSourceSnapshot } from '../../utils/trafficSource/snapshotLoader';
import type { SnapshotWithMetrics } from '../../types/trafficSource';
import { formatTrafficSourcesCompact } from '../utils/formatTrafficSources';
import { useChannelStore } from '../../stores/channelStore';
import { debug } from '../../utils/debug';

/**
 * Enrich VideoCardContext items that have the traffic sources toggle enabled.
 * Items without the toggle or without snapshot data are returned unchanged.
 *
 * @param items - Context items (already enriched with deltas)
 * @param userId - Firebase user ID
 * @returns Enriched copy of items (never mutates originals)
 */
export async function enrichContextWithTrafficSources(
    items: AppContextItem[],
    userId: string,
): Promise<AppContextItem[]> {
    // Filter videos that opted in for traffic sources context
    const eligibleVideos = items.filter(
        (i): i is VideoCardContext =>
            i.type === 'video-card' && i.includeTrafficSources === true,
    );

    if (eligibleVideos.length === 0) return items;

    const channelId = useChannelStore.getState().currentChannel?.id;
    if (!channelId) {
        debug.context('[enrichTrafficSources] No channel — skipping');
        return items;
    }

    // Fetch + format for each eligible video (in parallel)
    const summaryMap = new Map<string, string>();

    await Promise.all(
        eligibleVideos.map(async (video) => {
            try {
                // 1. Fetch metadata from Firestore
                const data = await TrafficSourceService.fetch(userId, channelId, video.videoId);
                if (!data || data.snapshots.length === 0) return;

                // 2. Sort snapshots oldest → newest
                const sorted = [...data.snapshots].sort((a, b) => a.timestamp - b.timestamp);

                // 3. Download + parse each CSV
                const snapshotsWithMetrics: SnapshotWithMetrics[] = [];
                for (const snap of sorted) {
                    try {
                        const { metrics } = await loadTrafficSourceSnapshot(snap);
                        if (metrics.length > 0) {
                            snapshotsWithMetrics.push({ snapshot: snap, metrics });
                        }
                    } catch {
                        // Skip broken snapshots silently
                    }
                }

                if (snapshotsWithMetrics.length === 0) return;

                // 4. Format compact summary
                const summary = formatTrafficSourcesCompact(snapshotsWithMetrics);
                if (summary) {
                    summaryMap.set(video.videoId, summary);
                }
            } catch (err) {
                console.warn(`[enrichTrafficSources] Failed for video ${video.videoId}:`, err);
            }
        }),
    );

    if (summaryMap.size === 0) return items;

    debug.context(`[enrichTrafficSources] Enriched ${summaryMap.size}/${eligibleVideos.length} videos with traffic sources`);

    // Return enriched copy
    return items.map(item => {
        if (item.type !== 'video-card') return item;
        const summary = summaryMap.get(item.videoId);
        if (!summary) return item;
        return { ...item, trafficSourcesSummary: summary };
    });
}
