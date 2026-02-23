export interface VideoDeltaStats {
    delta24h: number | null;
    delta7d: number | null;
    delta30d: number | null;
    /**
     * Latest view count from the Trend Snapshot — the same data source used for delta calculation.
     * 
     * WHY THIS EXISTS (instead of using video.viewCount):
     * `video.viewCount` in Firestore is updated only on manual/auto video sync.
     * Trend snapshots are updated independently (daily cron). This creates a desync:
     * the delta shows growth from the snapshot, but the base viewCount on the card
     * is stale from the last video sync.
     * 
     * By sourcing both the counter AND the delta from the same snapshot,
     * they are always mathematically consistent.
     */
    currentViews: number | null;
}
