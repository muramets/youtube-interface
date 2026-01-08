import React from 'react';
import { TrafficUploader } from './TrafficUploader';
import type { TrafficSource } from '../../../../../core/types/traffic';

interface TrafficEmptyStateProps {
    onUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<void>;
    hasExistingSnapshot: boolean;
}

export const TrafficEmptyState: React.FC<TrafficEmptyStateProps> = ({
    onUpload,
    hasExistingSnapshot
}) => {
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
                        // Pass a prop to remove internal padding/borders if needed to blend perfectly, 
                        // or keep it as the content area.
                        // Since TrafficUploader has its own border, we might want to adjust it.
                        // For now, let's keep it simple and see how it looks nested.
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
