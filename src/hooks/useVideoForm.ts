import { useState, useEffect, useRef } from 'react';
import { type VideoDetails, type CoverVersion, type PackagingVersion, extractVideoId } from '../utils/youtubeApi';
import { useVideos } from './useVideos';

import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';

export const useVideoForm = (initialData?: VideoDetails, isOpen?: boolean) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { fetchVideoHistory } = useVideos(user?.uid || '', currentChannel?.id || '');

    // Form State
    const [title, setTitle] = useState(initialData?.title || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [tags, setTags] = useState<string[]>(initialData?.tags || []);
    const [viewCount, setViewCount] = useState(initialData?.viewCount || '');
    const [duration, setDuration] = useState(initialData?.duration || '');
    const [videoRender, setVideoRender] = useState(initialData?.videoRender || '');
    const [audioRender, setAudioRender] = useState(initialData?.audioRender || '');
    const [coverImage, setCoverImage] = useState<string | null>(initialData?.customImage || initialData?.thumbnail || null);

    // Versioning State
    const [currentVersion, setCurrentVersion] = useState(initialData?.customImageVersion || 1);
    const [highestVersion, setHighestVersion] = useState(initialData?.highestVersion || (initialData?.customImage ? 1 : 0));
    const [currentOriginalName, setCurrentOriginalName] = useState(initialData?.customImageName || 'Original Cover');
    const [fileVersionMap, setFileVersionMap] = useState<Record<string, number>>(initialData?.fileVersionMap || {});

    // Packaging Performance State
    const [currentPackagingVersion, setCurrentPackagingVersion] = useState(initialData?.currentPackagingVersion || 1);
    const [packagingHistory, setPackagingHistory] = useState<PackagingVersion[]>(initialData?.packagingHistory || []);

    // History State
    const [coverHistory, setCoverHistory] = useState<CoverVersion[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [deletedHistoryIds, setDeletedHistoryIds] = useState<Set<number | string>>(new Set());

    const [isPublished, setIsPublished] = useState(!!initialData?.publishedVideoId);
    const [publishedUrl, setPublishedUrl] = useState(initialData?.publishedVideoId ? `https://www.youtube.com/watch?v=${initialData.publishedVideoId}` : '');

    // Track previous ID to prevent unnecessary resets
    const [prevId, setPrevId] = useState<string | undefined>(undefined);

    // Draft State
    const [isDraft, setIsDraft] = useState(initialData?.isDraft ?? (!initialData?.packagingHistory || initialData.packagingHistory.length === 0));

    // Effect 1: Sync Form State
    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                const isSameVideo = prevId === initialData.id;
                setPrevId(initialData.id);

                setTitle(initialData.title);
                setDescription(initialData.description || '');
                setTags(initialData.tags || []);
                setViewCount(initialData.viewCount || '');
                setDuration(initialData.duration || '');
                setVideoRender(initialData.videoRender || '');
                setAudioRender(initialData.audioRender || '');
                setCoverImage(initialData.customImage || initialData.thumbnail);
                setCurrentOriginalName(initialData.customImageName || 'Original Cover');

                if (!isSameVideo) {
                    setCoverHistory([]);
                }

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

            } else {
                setTitle('');
                setDescription('');
                setTags([]);
                setViewCount('');
                setDuration('');
                setVideoRender('');
                setAudioRender('');
                setCoverImage(null);
                setCoverHistory([]);
                setDeletedHistoryIds(new Set());
                setCurrentOriginalName('Original Cover');
                setCurrentVersion(1);
                setHighestVersion(0);
                setFileVersionMap({});
                setIsPublished(false);
                setPublishedUrl('');
                setPrevId(undefined);
            }
        }
    }, [isOpen, initialData, prevId]);

    // Effect 2: Load History
    const lastLoadedIdRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (isOpen && initialData && initialData.id) {
            const loadHistory = async () => {
                // Only show loading if we haven't loaded this ID yet
                if (lastLoadedIdRef.current !== initialData.id) {
                    setIsLoadingHistory(true);
                }

                try {
                    if (user && currentChannel) {
                        const history = await fetchVideoHistory(initialData.id);
                        // Filter out current cover from history
                        const currentUrl = initialData.customImage || initialData.thumbnail;
                        const filteredHistory = history.filter((h: CoverVersion) => h.url !== currentUrl);
                        setCoverHistory(filteredHistory);
                        lastLoadedIdRef.current = initialData.id;
                    }
                } catch (error) {
                    console.error("Failed to load history:", error);
                } finally {
                    setIsLoadingHistory(false);
                }
            };

            // Only load if ID changed or we haven't loaded yet
            if (lastLoadedIdRef.current !== initialData.id) {
                loadHistory();
            }
        } else if (!isOpen) {
            lastLoadedIdRef.current = undefined;
        }
    }, [isOpen, initialData, fetchVideoHistory, user, currentChannel]);

    // Localization State
    const [localizations, setLocalizations] = useState<Record<string, { languageCode: string; title: string; description: string; tags: string[] }>>(
        initialData?.localizations || {}
    );
    const [activeLanguage, setActiveLanguage] = useState<string>('default');

    // A/B Testing State
    const [abTestVariants, setAbTestVariants] = useState<string[]>(initialData?.abTestVariants || []);

    const [defaultData, setDefaultData] = useState({
        title: initialData?.title || '',
        description: initialData?.description || '',
        tags: initialData?.tags || []
    });

    const switchLanguage = (newLang: string) => {
        if (newLang === activeLanguage) return;

        // Save current values
        if (activeLanguage === 'default') {
            setDefaultData({ title, description, tags });
        } else {
            setLocalizations(prev => ({
                ...prev,
                [activeLanguage]: { languageCode: activeLanguage, title, description, tags }
            }));
        }

        // Load new values
        if (newLang === 'default') {
            setTitle(defaultData.title);
            setDescription(defaultData.description);
            setTags(defaultData.tags);
        } else {
            const loc = localizations[newLang];
            if (loc) {
                setTitle(loc.title);
                setDescription(loc.description);
                setTags(loc.tags);
            } else {
                // New language: Copy from default (as per plan)
                // But wait, if we are switching from 'ru' to 'es', we should copy from default or current?
                // Plan said "Copy Primary".
                // So we need the up-to-date default data.
                // If we were on default, `title` is up-to-date.
                // If we were on 'ru', `defaultData` is up-to-date.
                const source = activeLanguage === 'default' ? { title, description, tags } : defaultData;
                setTitle(source.title);
                setDescription(source.description);
                setTags(source.tags);
            }
        }
        setActiveLanguage(newLang);
    };

    const addLanguage = (code: string, customName?: string, customFlag?: string) => {
        if (localizations[code]) return;

        // Copy content from currently active language (or default)
        const sourceTitle = title;
        const sourceDescription = description;
        const sourceTags = tags;

        setLocalizations(prev => ({
            ...prev,
            [code]: {
                languageCode: code,
                displayName: customName,
                flag: customFlag,
                title: sourceTitle,
                description: sourceDescription,
                tags: sourceTags
            }
        }));

        // Switch to the new language immediately
        switchLanguage(code);
    };

    const removeLanguage = (code: string) => {
        if (activeLanguage === code) {
            // Switch to default without saving current (deleted) language
            setTitle(defaultData.title);
            setDescription(defaultData.description);
            setTags(defaultData.tags);
            setActiveLanguage('default');
        }

        setLocalizations(prev => {
            const newLocs = { ...prev };
            delete newLocs[code];
            return newLocs;
        });
    };

    // Split isDirty into Metadata and Packaging
    const isMetadataDirty = (() => {
        if (!initialData) return true;

        if (viewCount !== (initialData.viewCount || '')) return true;
        if (duration !== (initialData.duration || '')) return true;
        if (videoRender !== (initialData.videoRender || '')) return true;
        if (audioRender !== (initialData.audioRender || '')) return true;

        if (!!initialData.publishedVideoId !== isPublished) return true;
        if (isPublished && initialData.publishedVideoId && !publishedUrl.includes(initialData.publishedVideoId)) return true;
        if (isPublished && !initialData.publishedVideoId && publishedUrl) return true;

        return false;
    })();

    const isPackagingDirty = (() => {
        if (!initialData) return true;

        const currentCustomImage = coverImage;
        const initialCustomImage = initialData.customImage || initialData.thumbnail;

        if (currentCustomImage !== initialCustomImage) return true;

        const effectiveDefault = activeLanguage === 'default' ? { title, description, tags } : defaultData;

        if (effectiveDefault.title !== initialData.title) return true;
        if (effectiveDefault.description !== (initialData.description || '')) return true;
        if (JSON.stringify(effectiveDefault.tags) !== JSON.stringify(initialData.tags || [])) return true;

        // Check localizations
        const effectiveLocalizations = { ...localizations };
        if (activeLanguage !== 'default') {
            effectiveLocalizations[activeLanguage] = { languageCode: activeLanguage, title, description, tags };
        }

        const initialLocs = initialData.localizations || {};
        const allKeys = new Set([...Object.keys(effectiveLocalizations), ...Object.keys(initialLocs)]);

        for (const key of allKeys) {
            const a = effectiveLocalizations[key];
            const b = initialLocs[key];
            if (!a || !b) return true; // Added or removed
            if (a.title !== b.title) return true;
            if (a.description !== b.description) return true;
            if (JSON.stringify(a.tags) !== JSON.stringify(b.tags)) return true;
        }

        // Check A/B Test Variants
        const initialVariants = initialData.abTestVariants || [];
        if (abTestVariants.length !== initialVariants.length) return true;
        const sortedCurrent = [...abTestVariants].sort();
        const sortedInitial = [...initialVariants].sort();
        if (JSON.stringify(sortedCurrent) !== JSON.stringify(sortedInitial)) return true;

        return false;
    })();

    const isDirty = isMetadataDirty || isPackagingDirty;

    const isValid = (() => {
        if (isPublished && !publishedUrl.trim()) return false;
        return true;
    })();

    // Need to sync defaultData when initialData changes (e.g. reset)
    useEffect(() => {
        if (isOpen && initialData) {
            setLocalizations(initialData.localizations || {});
            setDefaultData({
                title: initialData.title,
                description: initialData.description || '',
                tags: initialData.tags || []
            });
            setActiveLanguage('default');
        }
    }, [isOpen, initialData]);


    return {
        title, setTitle,
        description, setDescription,
        tags, setTags,
        viewCount, setViewCount,
        duration, setDuration,
        videoRender, setVideoRender,
        audioRender, setAudioRender,
        coverImage, setCoverImage,
        currentVersion, setCurrentVersion,
        highestVersion, setHighestVersion,
        currentOriginalName, setCurrentOriginalName,
        fileVersionMap, setFileVersionMap,
        coverHistory, setCoverHistory,
        isLoadingHistory,
        deletedHistoryIds, setDeletedHistoryIds,
        isDirty,
        isMetadataDirty,
        isPackagingDirty,
        isDraft, setIsDraft,
        isPublished, setIsPublished,
        publishedUrl, setPublishedUrl,
        isValid,
        // Localization exports
        activeLanguage,
        localizations,
        addLanguage,
        removeLanguage,
        switchLanguage,
        // A/B Testing State
        abTestVariants,
        setAbTestVariants,
        currentPackagingVersion,
        setCurrentPackagingVersion,
        packagingHistory,
        setPackagingHistory,

        // We need to expose a way to get the FINAL object for saving
        getFullPayload: () => {
            const effectiveDefault = activeLanguage === 'default' ? { title, description, tags } : defaultData;
            const effectiveLocalizations = { ...localizations };
            if (activeLanguage !== 'default') {
                effectiveLocalizations[activeLanguage] = { languageCode: activeLanguage, title, description, tags };
            }

            return {
                ...effectiveDefault,
                localizations: effectiveLocalizations,
                abTestVariants,
                // Metadata
                viewCount,
                duration,
                videoRender,
                audioRender,
                publishedVideoId: isPublished ? (extractVideoId(publishedUrl) || undefined) : '',
            };
        },
        getMetadataOnlyPayload: () => {
            // Returns original packaging data + new metadata
            return {
                title: initialData?.title || '',
                description: initialData?.description || '',
                tags: initialData?.tags || [],
                localizations: initialData?.localizations || {},
                abTestVariants: initialData?.abTestVariants || [],
                // New Metadata
                viewCount,
                duration,
                videoRender,
                audioRender,
                publishedVideoId: isPublished ? (extractVideoId(publishedUrl) || undefined) : '',
            };
        }
    };
};
