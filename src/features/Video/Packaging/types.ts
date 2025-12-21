export interface MetricCheckin {
    id: string;
    date: number;
    type: 'creation' | 'update' | 'final';
    metrics: {
        impressions?: number;
        ctr?: number;
        views?: number;
        avdSeconds?: number;
    };
    badge?: {
        text: string;
        color: string;
    };
}

export interface PackagingSnapshot {
    title: string;
    description: string;
    tags: string[];
    coverImage: string | null;
    abTestVariants?: string[];
}

export interface PackagingVersion {
    versionNumber: number;
    checkins: MetricCheckin[];
    snapshot?: PackagingSnapshot;
}

export interface CTRRule {
    id: string;
    operator: '<' | '>' | '<=' | '>=' | 'between';
    value: number;
    maxValue?: number; // For 'between' operator
    color: string;
}
