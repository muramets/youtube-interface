import React from 'react';

/** Compact stats for browseChannelVideos expanded view. */
export const BrowseChannelStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const videos = result.videos as unknown[] | undefined;
    const totalOnYT = result.totalVideosOnYouTube as number | undefined;
    const cached = result.alreadyCached as number | undefined;
    const fetched = result.fetchedFromYouTube as number | undefined;
    const quotaUsed = result.quotaUsed as number | undefined;
    const sync = result.ownChannelSync as { inApp: number; onYouTube: number; notInApp: number } | undefined;

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="text-[10px] text-text-tertiary">
                {videos?.length ?? 0} videos returned
                {totalOnYT != null && ` (${totalOnYT} on YouTube)`}
                {cached != null && fetched != null && ` \u00b7 ${cached} cached, ${fetched} fetched`}
                {quotaUsed != null && quotaUsed > 0 && ` \u00b7 ${quotaUsed} quota units`}
            </span>
            {sync && (
                <span className="text-[10px] text-text-tertiary">
                    {sync.inApp} in app · {sync.onYouTube} on YouTube · {sync.notInApp} not imported
                </span>
            )}
        </div>
    );
};
