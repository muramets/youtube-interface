export type TrafficType = 'autoplay' | 'user_click';

export interface TrafficTypeEdge {
    // Composite ID is not strictly needed if we query by target+source, 
    // but useful for cache keys: `${targetVideoId}_${sourceVideoId}`
    id: string;

    targetVideoId: string; // The video receiving traffic (MY video)
    sourceVideoId: string; // The video sending traffic (OTHER video)

    type: TrafficType;
    source?: 'manual' | 'smart_assistant';
    updatedAt: number;
}
