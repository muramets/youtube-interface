import type { PackagingVersion } from './types';

export const MOCK_HISTORY: PackagingVersion[] = [
    {
        versionNumber: 1,
        snapshot: {
            title: "My Amazing Video Title v1",
            description: "This is the description for the first version of the video. It contains keywords and explains the content.",
            tags: ["gaming", "review", "2025"],
            coverImage: "https://picsum.photos/seed/v1/320/180",
            abTestVariants: ["https://picsum.photos/seed/v1-ab/320/180"]
        },
        checkins: [
            {
                id: 'v1-c1',
                date: Date.now() - 86400000 * 3, // 3 days ago
                type: 'creation',
                metrics: {
                    impressions: 1250,
                    ctr: 4.8,
                    views: 60,
                    avdSeconds: 195,
                    avdPercentage: 38
                },
                badge: {
                    text: 'First Check',
                    color: '#3B82F6'
                }
            },
            {
                id: 'v1-c2',
                date: Date.now() - 86400000 * 2, // 2 days ago
                type: 'update',
                metrics: { impressions: 1500, ctr: 5.0, views: 750, avdSeconds: 65, avdPercentage: 42 }
            },
            {
                id: 'v1-final',
                date: Date.now() - 86400000 * 1, // 1 day ago
                type: 'final',
                metrics: { impressions: 2000, ctr: 4.8, views: 900, avdSeconds: 70, avdPercentage: 45 }
            }
        ]
    },
    {
        versionNumber: 2,
        snapshot: {
            title: "My Amazing Video Title v2 - UPDATED",
            description: "Updated description for better SEO and click-through rate.",
            tags: ["gaming", "review", "2025", "updated"],
            coverImage: "https://picsum.photos/seed/v2/320/180",
            abTestVariants: []
        },
        checkins: [
            {
                id: 'v2-c1',
                date: Date.now(),
                type: 'creation',
                metrics: {} // Empty for new version
            }
        ]
    }
];
