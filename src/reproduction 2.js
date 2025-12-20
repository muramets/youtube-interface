
// Simulate the logic from TimelineCanvas.tsx

const MIN_THUMBNAIL_SIZE = 40;
const BASE_THUMBNAIL_SIZE = 200;

function runSimulation() {
    // 1. Simulate video data (114 videos in June 2024)
    const videos = [];
    // One video in Dec 2023
    videos.push({
        id: 'v_old',
        publishedAtTimestamp: new Date('2023-12-15T12:00:00Z').getTime()
    });

    const baseTime = new Date('2024-06-01T12:00:00Z').getTime();

    for (let i = 0; i < 114; i++) {
        videos.push({
            id: `v${i}`,
            publishedAtTimestamp: baseTime + i * (1000 * 60 * 60 * 2) // Each 2 hours apart
        });
    }

    // 2. Calculate Stats
    const dates = videos.map(v => v.publishedAtTimestamp);
    const buffer = 1000 * 60 * 60 * 12;
    const stats = {
        minDate: Math.min(...dates) - buffer,
        maxDate: Math.max(...dates) + buffer
    };

    console.log('Stats:', {
        minDate: new Date(stats.minDate).toISOString(),
        maxDate: new Date(stats.maxDate).toISOString(),
        minTs: stats.minDate,
        maxTs: stats.maxDate
    });

    // 3. Generate Month Regions (Density-based)
    const counts = new Map();
    videos.forEach(v => {
        const d = new Date(v.publishedAtTimestamp);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    });

    const layouts = [];
    let current = new Date(stats.minDate);
    current.setDate(1);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(stats.maxDate);
    const safeEndDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);

    const rawWidths = [];
    // Constants matching implementation
    const BASE_MONTH_WEIGHT = 1;
    const ITEM_WEIGHT = 0.05;

    while (current < safeEndDate) {
        const year = current.getFullYear();
        const month = current.getMonth();
        const key = `${year}-${month}`;
        const count = counts.get(key) || 0;

        const weight = BASE_MONTH_WEIGHT + (count * ITEM_WEIGHT);
        rawWidths.push(weight);

        const nextMonth = new Date(current);
        nextMonth.setMonth(current.getMonth() + 1);

        layouts.push({
            label: current.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
            year: current.getFullYear(),
            weight,
            count
        });
        current = nextMonth;
    }

    // Normalize
    const totalWeight = rawWidths.reduce((sum, w) => sum + w, 0);
    let currentX = 0;
    const finalRegions = layouts.map((l, i) => {
        const w = rawWidths[i] / totalWeight;
        const region = {
            ...l,
            startX: currentX,
            endX: currentX + w,
            width: w
        };
        currentX += w;
        return region;
    });

    console.log('Final Density-Based Regions:', finalRegions);
}

runSimulation();
