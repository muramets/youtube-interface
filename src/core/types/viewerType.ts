export type ViewerType = 'bouncer' | 'trialist' | 'explorer' | 'interested' | 'core' | 'passive';

export interface ViewerTypeEdge {
    id: string; // Composite: `${snapshotId}_${sourceVideoId}`

    targetVideoId: string; // The video receiving traffic (MY video)
    sourceVideoId: string; // The video sending traffic (OTHER video)
    snapshotId: string;    // The snapshot this edge belongs to

    type: ViewerType;
    source?: 'manual' | 'smart_assistant';
    updatedAt: number;
}
