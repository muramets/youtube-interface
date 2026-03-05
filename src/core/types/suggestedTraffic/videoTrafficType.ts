export type TrafficType = 'autoplay' | 'user_click';

export interface TrafficTypeEdge {
    // Composite ID: `${snapshotId}_${sourceVideoId}`
    id: string;

    targetVideoId: string; // The video receiving traffic (MY video)
    sourceVideoId: string; // The video sending traffic (OTHER video)
    snapshotId: string;    // The snapshot this edge belongs to

    type: TrafficType;
    source?: 'manual' | 'smart_assistant';
    updatedAt: number;
}
