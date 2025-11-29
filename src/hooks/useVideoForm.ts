import { useState, useEffect } from 'react';
import { type VideoDetails, type CoverVersion } from '../utils/youtubeApi';
import { useVideoActions } from '../context/VideoActionsContext';

export const useVideoForm = (initialData?: VideoDetails, isOpen?: boolean) => {
    const { fetchVideoHistory } = useVideoActions();

    // Form State
    const [title, setTitle] = useState('');
    const [viewCount, setViewCount] = useState('');
    const [duration, setDuration] = useState('');
    const [coverImage, setCoverImage] = useState<string | null>(null);

    // Versioning State
    const [currentVersion, setCurrentVersion] = useState(1);
    const [highestVersion, setHighestVersion] = useState(0);
    const [currentOriginalName, setCurrentOriginalName] = useState('Original Cover');
    const [fileVersionMap, setFileVersionMap] = useState<Record<string, number>>({});

    // History State
    const [coverHistory, setCoverHistory] = useState<CoverVersion[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [deletedHistoryIds, setDeletedHistoryIds] = useState<Set<number | string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setTitle(initialData.title);
                setViewCount(initialData.viewCount || '');
                setDuration(initialData.duration || '');
                setCoverImage(initialData.customImage || initialData.thumbnail);
                setCurrentOriginalName(initialData.customImageName || 'Original Cover');
                setCoverHistory([]);

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
                        const history = await fetchVideoHistory(initialData.id);
                        // Filter out current cover from history
                        const currentUrl = initialData.customImage || initialData.thumbnail;
                        const filteredHistory = history.filter(h => h.url !== currentUrl);
                        setCoverHistory(filteredHistory);
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
            }
        }
    }, [isOpen, initialData]); // fetchVideoHistory is stable

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
        deletedHistoryIds, setDeletedHistoryIds
    };
};
