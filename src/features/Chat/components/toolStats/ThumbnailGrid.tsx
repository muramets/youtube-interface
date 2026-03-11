import React from 'react';
import type { ToolCallGroup } from '../../utils/toolCallGrouping';

/** Compact thumbnail grid for viewThumbnails expanded view. */
export const ThumbnailGrid: React.FC<{ group: ToolCallGroup }> = ({ group }) => {
    type ThumbnailEntry = { videoId: string; title: string; thumbnailUrl: string };
    const videos: ThumbnailEntry[] = [];
    for (const record of group.records) {
        const list = record.result?.videos as ThumbnailEntry[] | undefined;
        if (list) {
            for (const v of list) {
                if (!videos.find(x => x.videoId === v.videoId)) videos.push(v);
            }
        }
    }
    if (videos.length === 0) return null;
    return (
        <div className="mt-1.5 grid grid-cols-4 gap-1">
            {videos.map(v => (
                <div key={v.videoId} className="flex flex-col gap-0.5 min-w-0">
                    <img
                        src={v.thumbnailUrl}
                        alt=""
                        className="w-full aspect-video object-cover rounded"
                        loading="lazy"
                    />
                    <span className="text-[10px] text-text-tertiary truncate leading-tight">{v.title}</span>
                </div>
            ))}
        </div>
    );
};
