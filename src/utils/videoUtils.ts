import type { VideoDetails } from './youtubeApi';

/**
 * Sorts videos based on a provided order of IDs.
 * Videos not present in the order array are prepended to the list (newest first behavior).
 * 
 * @param videos The list of video objects to sort.
 * @param order The array of video IDs representing the desired order.
 * @returns A new array of sorted VideoDetails.
 */
export const sortVideosByOrder = (videos: VideoDetails[], order: string[] | undefined): VideoDetails[] => {
    if (!order || order.length === 0) {
        return videos;
    }

    const videoMap = new Map(videos.map(v => [v.id, v]));

    // 1. Get videos that are in the order list, in that order
    const orderedVideos = order
        .map(id => videoMap.get(id))
        .filter((v): v is VideoDetails => !!v);

    // 2. Get videos that are NOT in the order list (newly added/cloned)
    const orderedSet = new Set(order);
    const newVideos = videos.filter(v => !orderedSet.has(v.id));

    // 3. Combine: New videos first, then ordered videos
    // This matches the "Home Page" behavior where new items appear at the top/start
    return [...newVideos, ...orderedVideos];
};
