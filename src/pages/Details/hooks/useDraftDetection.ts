import { useMemo } from 'react';
import type { VideoDetails, PackagingVersion } from '../../../core/utils/youtubeApi';
import { VersionService } from '../services/VersionService';

/**
 * Хук для определения draft состояния.
 * 
 * Draft существует когда текущие данные видео отличаются от последней сохраненной версии.
 * 
 * @param video - Текущие данные видео
 * @param packagingHistory - История версий packaging
 * @returns { hasDraft } - true если есть несохраненные изменения
 */
export const useDraftDetection = (
    video: VideoDetails,
    packagingHistory: PackagingVersion[]
) => {
    const hasDraft = useMemo(() => {
        return VersionService.computeDraftState(video, packagingHistory);
    }, [video, packagingHistory]);

    return { hasDraft };
};
