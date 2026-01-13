export type ViewerType = 'bouncer' | 'trialist' | 'explorer' | 'interested' | 'core' | 'passive';

export interface ViewerTypeEdge {
    id: string; // Composite: `${targetVideoId}_${sourceVideoId}`

    targetVideoId: string; // The video receiving traffic (MY video)
    sourceVideoId: string; // The video sending traffic (OTHER video)

    type: ViewerType;
    source?: 'manual' | 'smart_assistant';
    updatedAt: number;
}
