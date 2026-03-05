export type TrafficNicheProperty = 'unrelated' | 'adjacent' | 'targeted' | 'desired';

export interface SuggestedTrafficNiche {
    id: string;
    channelId: string;
    name: string;
    color: string;
    property?: TrafficNicheProperty;
    createdAt: number;
}

export interface TrafficNicheAssignment {
    videoId: string;
    nicheId: string;
    addedAt: number;
}
