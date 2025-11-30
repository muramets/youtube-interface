import { useState, useEffect } from 'react';
import { type VideoDetails, type CoverVersion } from '../utils/youtubeApi';
import { useVideosStore } from '../stores/videosStore';
import { useAuthStore } from '../stores/authStore';
import { useChannelStore } from '../stores/channelStore';

export const useVideoForm = (initialData?: VideoDetails, isOpen?: boolean) => {
    const { fetchVideoHistory } = useVideosStore();
    const { user } = useAuthStore();
    const { currentChannel } = useChannelStore();

    // Form State
    const [title, setTitle] = useState(initialData?.title || '');
    const [viewCount, setViewCount] = useState(initialData?.viewCount || '');
    const [duration, setDuration] = useState(initialData?.duration || '');
    const [coverImage, setCoverImage] = useState<string | null>(initialData?.customImage || initialData?.thumbnail || null);

    // Versioning State
    const [currentVersion, setCurrentVersion] = useState(initialData?.customImageVersion || 1);
    const [highestVersion, setHighestVersion] = useState(initialData?.highestVersion || (initialData?.customImage ? 1 : 0));
    const [currentOriginalName, setCurrentOriginalName] = useState(initialData?.customImageName || 'Original Cover');
    const [fileVersionMap, setFileVersionMap] = useState<Record<string, number>>(initialData?.fileVersionMap || {});

    // History State
    const [coverHistory, setCoverHistory] = useState<CoverVersion[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [deletedHistoryIds, setDeletedHistoryIds] = useState<Set<number | string>>(new Set());

    const [isPublished, setIsPublished] = useState(!!initialData?.publishedVideoId);
    const [publishedUrl, setPublishedUrl] = useState(initialData?.publishedVideoId ? `https://www.youtube.com/watch?v=${initialData.publishedVideoId}` : '');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setTitle(initialData.title);
                setViewCount(initialData.viewCount || '');
                setDuration(initialData.duration || '');
                setCoverImage(initialData.customImage || initialData.thumbnail);
                setCurrentOriginalName(initialData.customImageName || 'Original Cover');
                setCoverHistory([]);

                if (initialData.publishedVideoId) {
                    setIsPublished(true);
                    setPublishedUrl(`https://www.youtube.com/watch?v=${initialData.publishedVideoId}`);
                } else {
                    setIsPublished(false);
                    setPublishedUrl('');
                }

                const savedCurrentVersion = initialData.customImageVersion || 1;
                const hasCustomImage = !!initialData.customImage;
                const savedHighestVersion = initialData.highestVersion || (hasCustomImage ? 1 : 0);
                const savedFileVersionMap = initialData.fileVersionMap || {};

                setCurrentVersion(savedCurrentVersion);
                setHighestVersion(savedHighestVersion);
                setFileVersionMap(savedFileVersionMap);

                // Load History
                const loadHistory = async () => {
                    setIsLoadingHistory(true);
                    try {
                        if (user && currentChannel) {
                            const history = await fetchVideoHistory(user.uid, currentChannel.id, initialData.id);
                            // Filter out current cover from history
                            const currentUrl = initialData.customImage || initialData.thumbnail;
                            const filteredHistory = history.filter(h => h.url !== currentUrl);
                            setCoverHistory(filteredHistory);
                        }
                    } catch (error) {
                        console.error("Failed to load history:", error);
                    } finally {
                        setIsLoadingHistory(false);
                    }
                };

                if (initialData.id) {
                    loadHistory();
                }

            } else {
                setTitle('');
                setViewCount('');
                setDuration('');
                setCoverImage(null);
                setCoverHistory([]);
                setDeletedHistoryIds(new Set());
                setCurrentOriginalName('Original Cover');
                setCurrentVersion(1);
                setHighestVersion(0);
                setFileVersionMap({});
                setIsPublished(false);
                setPublishedUrl('');
            }
        }
    }, [isOpen, initialData, fetchVideoHistory, user, currentChannel]);

    const isDirty = (() => {
        if (!initialData) return true; // Always dirty if creating new

        const currentCustomImage = coverImage;
        const initialCustomImage = initialData.customImage || initialData.thumbnail;

        // Check if image changed
        if (currentCustomImage !== initialCustomImage) return true;

        // Check if text fields changed
        if (title !== initialData.title) return true;
        if (viewCount !== (initialData.viewCount || '')) return true;
        if (duration !== (initialData.duration || '')) return true;

        // Check if published state changed
        // Note: This is a rough check. Ideally we extract ID properly.
        // But for dirty check, maybe just check if url changed if published is true.
        // Or simpler:
        if (!!initialData.publishedVideoId !== isPublished) return true;
        if (isPublished && initialData.publishedVideoId && !publishedUrl.includes(initialData.publishedVideoId)) return true;
        if (isPublished && !initialData.publishedVideoId && publishedUrl) return true;

        return false;
    })();

    const isValid = (() => {
        if (isPublished && !publishedUrl.trim()) return false;
        return true;
    })();

    return {
        title, setTitle,
        viewCount, setViewCount,
        duration, setDuration,
        coverImage, setCoverImage,
        currentVersion, setCurrentVersion,
        highestVersion, setHighestVersion,
        currentOriginalName, setCurrentOriginalName,
        fileVersionMap, setFileVersionMap,
        coverHistory, setCoverHistory,
        isLoadingHistory,
        deletedHistoryIds, setDeletedHistoryIds,
        isDirty,
        isPublished, setIsPublished,
        publishedUrl, setPublishedUrl,
        isValid
    };
};
