import React from 'react';
import { ImageIcon, SplitSquareHorizontal } from 'lucide-react';

interface PackagingData {
    title: string;
    description: string;
    tags: string[];
    coverImage?: string;
    abTestTitles?: string[];
    abTestThumbnails?: string[];
    abTestResults?: {
        titles?: Array<{ variant: string; ctr: number; impressions: number }>;
        thumbnails?: Array<{ variant: string; ctr: number; impressions: number }>;
    };
    localizations?: Record<string, any>;
}

interface PackagingSnapshotTooltipProps {
    version: number;
    data: PackagingData;
}

/**
 * Tooltip content displaying preserved packaging data for deleted versions.
 */
export const PackagingSnapshotTooltip: React.FC<PackagingSnapshotTooltipProps> = ({ version, data }) => {
    return (
        <div className="flex flex-col gap-3 min-w-[300px] max-w-[400px]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-primary pb-2">
                <span className="font-medium text-text-primary">Deleted Packaging v.{version}</span>
            </div>

            {/* Title & Description */}
            <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-text-secondary uppercase tracking-wider">Title</div>
                <div className="text-sm text-text-primary line-clamp-2">{data.title}</div>
            </div>

            {data.description && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs font-medium text-text-secondary uppercase tracking-wider">Description</div>
                    <div className="text-xs text-text-secondary line-clamp-3">{data.description}</div>
                </div>
            )}

            {/* Thumbnail Info */}
            <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-text-secondary uppercase tracking-wider">Thumbnail</div>
                {data.coverImage ? (
                    <div className="flex items-center gap-2 text-sm text-text-primary">
                        <ImageIcon size={14} className="text-text-secondary" />
                        <span>Has Custom Thumbnail</span>
                    </div>
                ) : (
                    <div className="text-sm text-text-secondary italic">No custom thumbnail</div>
                )}
            </div>

            {/* A/B Test Info */}
            {(data.abTestTitles || data.abTestThumbnails) && (
                <div className="flex flex-col gap-2 p-2 bg-bg-secondary rounded-md border border-border-primary">
                    <div className="flex items-center gap-2 text-blue-400">
                        <SplitSquareHorizontal size={14} />
                        <span className="text-xs font-medium uppercase">A/B Tests Run</span>
                    </div>

                    {data.abTestTitles && (
                        <div className="text-xs text-text-secondary">
                            • {data.abTestTitles.length} Titles Tested
                        </div>
                    )}
                    {data.abTestThumbnails && (
                        <div className="text-xs text-text-secondary">
                            • {data.abTestThumbnails.length} Thumbnails Tested
                        </div>
                    )}

                    {/* Results Summary */}
                    {data.abTestResults && (
                        <div className="mt-1 pt-1 border-t border-border-secondary">
                            <div className="text-xs font-medium text-text-primary mb-1">Results:</div>
                            {data.abTestResults.titles && (
                                <div className="text-xs text-text-secondary mb-1">
                                    Title Winner: {data.abTestResults.titles[0]?.variant}
                                </div>
                            )}
                            {data.abTestResults.thumbnails && (
                                <div className="text-xs text-text-secondary">
                                    Thumbnail Winner: {data.abTestResults.thumbnails[0]?.variant}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Tags */}
            {data.tags && data.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                    {data.tags.slice(0, 5).map((tag, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 bg-bg-secondary text-text-secondary rounded-full border border-border-primary">
                            #{tag}
                        </span>
                    ))}
                    {data.tags.length > 5 && (
                        <span className="text-[10px] px-1.5 py-0.5 text-text-tertiary">
                            +{data.tags.length - 5} more
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};
