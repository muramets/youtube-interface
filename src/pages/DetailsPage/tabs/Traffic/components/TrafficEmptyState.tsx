import React from 'react';
import { TrafficUploader } from './TrafficUploader';
import type { TrafficSource } from '../../../../../core/types/traffic';

interface TrafficEmptyStateProps {
    onUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<void>;
    hasExistingSnapshot: boolean;
    mode: 'no-data' | 'no-new-data' | 'no-matches';
}

export const TrafficEmptyState: React.FC<TrafficEmptyStateProps> = ({
    onUpload,
    hasExistingSnapshot,
    mode = 'no-data'
}) => {
    // Mode: no-matches - shown when filters exclude all results
    if (mode === 'no-matches') {
        return (
            <div className="w-full h-[40px] flex items-center justify-center">
                <span className="text-xs text-text-secondary">
                    Oops! No results match your filters. Try being less specific.
                </span>
            </div>
        );
    }

    // Mode: no-new-data - shown when delta/New mode has filtered out all rows
    if (mode === 'no-new-data') {
        return (
            <div className="w-full h-full flex items-center justify-center py-16">
                <div className="text-center max-w-md">
                    <div className="mb-4">
                        <svg className="w-16 h-16 mx-auto text-text-tertiary opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-text-primary mb-2">
                        No New Data
                    </h3>
                    <p className="text-text-secondary text-sm leading-relaxed">
                        All traffic sources in this CSV are identical to the previous CSV.
                        Switch to <strong>Total</strong> view to see all data.
                    </p>
                </div>
            </div>
        );
    }

    // Mode: no-data - shown when no CSV has been uploaded yet
    return (
        <div className="w-full h-full flex flex-col">
            <div className="w-full">
                {/* Subheader */}
                <h2 className="text-xl font-medium text-text-primary mb-4">
                    No Traffic Data Yet
                </h2>

                {/* Description Text */}
                <div className="mb-8">
                    <p className="text-text-secondary text-sm leading-relaxed max-w-3xl">
                        Upload the <strong>"Traffic source: Suggested video"</strong> CSV export from YouTube Analytics.
                        This allows you to visualize exactly which videos are driving views to your content and track performance over time.
                    </p>
                </div>

                {/* Section Container matching Packaging Input style */}
                <div className="flex flex-col">
                    {/* Uploader Container */}
                    <div className="w-full max-w-3xl">
                        <TrafficUploader
                            onUpload={onUpload}
                            hasExistingSnapshot={hasExistingSnapshot}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
