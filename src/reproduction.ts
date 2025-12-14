
// Simulate the logic from TimelineCanvas.tsx

const MIN_THUMBNAIL_SIZE = 40;
const BASE_THUMBNAIL_SIZE = 200;

function runSimulation() {
    // 1. Simulate video data (114 videos in June 2024)
    const videos = [];
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

    // 3. Generate Month Regions
    const regions = [];
    const dateRange = stats.maxDate - stats.minDate;

    let current = new Date(stats.minDate);
    current.setDate(1);
    const endDate = new Date(stats.maxDate);

    console.log('Start loop with current:', current.toISOString());

    let loopCount = 0;
    while (current <= endDate) {
        loopCount++;
        if (loopCount > 20) break; // Safety break

        const monthStart = current.getTime();
        const nextMonth = new Date(current);
        nextMonth.setMonth(current.getMonth() + 1);
        const monthEnd = nextMonth.getTime();

        const visibleStart = Math.max(stats.minDate, monthStart);
        const visibleEnd = Math.min(stats.maxDate, monthEnd);

        if (visibleStart < visibleEnd) {
            const startX = (visibleStart - stats.minDate) / dateRange;
            const endX = (visibleEnd - stats.minDate) / dateRange;

            regions.push({
                month: current.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                year: current.getFullYear(),
                startX,
                endX,
                visibleStart: new Date(visibleStart).toISOString(),
                visibleEnd: new Date(visibleEnd).toISOString()
            });
        }
        current.setMonth(current.getMonth() + 1);
    }

    console.log('Regions:', regions);
}

runSimulation();
