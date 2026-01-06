import { useState, useEffect, useRef } from 'react';
import { type VideoDetails, type CoverVersion, type PackagingVersion, type CTRRule, extractVideoId } from '../utils/youtubeApi';
import { useVideos } from './useVideos';

import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';

export const useVideoForm = (initialData?: VideoDetails, isOpen?: boolean) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { fetchVideoHistory, videos } = useVideos(user?.uid || '', currentChannel?.id || '');

    // Find the latest version of the video from the store to ensure we have up-to-date data
    // This fixes issues where initialData might be stale after a save operation
    const latestVideoData = initialData?.id ? videos.find(v => v.id === initialData.id) : undefined;
    const effectiveData = latestVideoData || initialData;

    // Form State
    const [title, setTitle] = useState(effectiveData?.title || '');
    const [description, setDescription] = useState(effectiveData?.description || '');
    const [tags, setTags] = useState<string[]>(effectiveData?.tags || []);
    const [viewCount, setViewCount] = useState(effectiveData?.viewCount || '');
    const [duration, setDuration] = useState(effectiveData?.duration || '');
    const [videoRender, setVideoRender] = useState(effectiveData?.videoRender || '');
    const [audioRender, setAudioRender] = useState(effectiveData?.audioRender || '');
    const [coverImage, setCoverImage] = useState<string | null>(effectiveData?.customImage || effectiveData?.thumbnail || null);

    // Versioning State
    const [currentVersion, setCurrentVersion] = useState(effectiveData?.customImageVersion || 1);
    const [highestVersion, setHighestVersion] = useState(effectiveData?.highestVersion || (effectiveData?.customImage ? 1 : 0));
    const [currentOriginalName, setCurrentOriginalName] = useState(effectiveData?.customImageName || 'Original Cover');
    const [fileVersionMap, setFileVersionMap] = useState<Record<string, number>>(effectiveData?.fileVersionMap || {});

    // Packaging Performance State
    const [currentPackagingVersion, setCurrentPackagingVersion] = useState(effectiveData?.currentPackagingVersion || 1);
    const [packagingHistory, setPackagingHistory] = useState<PackagingVersion[]>(
        effectiveData?.packagingHistory ? JSON.parse(JSON.stringify(effectiveData.packagingHistory)) : []
    );

    // History State
    const [coverHistory, setCoverHistory] = useState<CoverVersion[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [deletedHistoryIds, setDeletedHistoryIds] = useState<Set<number | string>>(new Set());

    const [isPublished, setIsPublished] = useState(!!effectiveData?.publishedVideoId);
    const [publishedUrl, setPublishedUrl] = useState(effectiveData?.publishedVideoId ? `https://www.youtube.com/watch?v=${effectiveData.publishedVideoId}` : '');

    // Track previous ID to prevent unnecessary resets
    const [prevId, setPrevId] = useState<string | undefined>(undefined);

    // Draft State
    const [isDraft, setIsDraft] = useState(effectiveData?.isDraft ?? (!effectiveData?.packagingHistory || effectiveData.packagingHistory.length === 0));

    // CTR Rules State
    const [ctrRules, setCtrRules] = useState<CTRRule[]>(effectiveData?.ctrRules || []);

    // Effect 1: Sync Form State
    useEffect(() => {
        if (isOpen) {
            if (effectiveData) {
                const isSameVideo = prevId === effectiveData.id;
                setPrevId(effectiveData.id);

                setTitle(effectiveData.title);
                setDescription(effectiveData.description || '');
                setTags(effectiveData.tags || []);
                setViewCount(effectiveData.viewCount || '');
                setDuration(effectiveData.duration || '');
                setVideoRender(effectiveData.videoRender || '');
                setAudioRender(effectiveData.audioRender || '');
                setCoverImage(effectiveData.customImage || effectiveData.thumbnail);
                setCurrentOriginalName(effectiveData.customImageName || 'Original Cover');
                setCtrRules(effectiveData.ctrRules || []);

                // Sync packaging version and history from fresh data
                setCurrentPackagingVersion(effectiveData.currentPackagingVersion || 1);
                setPackagingHistory(effectiveData.packagingHistory ? JSON.parse(JSON.stringify(effectiveData.packagingHistory)) : []);
                setIsDraft(effectiveData.isDraft ?? (!effectiveData.packagingHistory || effectiveData.packagingHistory.length === 0));

                if (!isSameVideo) {
                    setCoverHistory([]);
                }

                if (effectiveData.publishedVideoId) {
                    setIsPublished(true);
                    setPublishedUrl(`https://www.youtube.com/watch?v=${effectiveData.publishedVideoId}`);
                } else {
                    setIsPublished(false);
                    setPublishedUrl('');
                }

                const savedCurrentVersion = effectiveData.customImageVersion || 1;
                const hasCustomImage = !!effectiveData.customImage;
                const savedHighestVersion = effectiveData.highestVersion || (hasCustomImage ? 1 : 0);
                const savedFileVersionMap = effectiveData.fileVersionMap || {};

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
                setCtrRules([]);
                setCurrentPackagingVersion(1);
                setPackagingHistory([]);
                setIsDraft(true);
            }
        }
    }, [isOpen, effectiveData, prevId]);

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
    const [abTestTitles, setAbTestTitles] = useState<string[]>(initialData?.abTestTitles || []);

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

        return false;
    })();

    const isCtrRulesDirty = (() => {
        if (!initialData) return false;
        // Check CTR Rules
        const initialRules = initialData.ctrRules || [];
        if (ctrRules.length !== initialRules.length) return true;
        if (JSON.stringify(ctrRules) !== JSON.stringify(initialRules)) return true;
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

        // Check A/B Test Titles
        const initialTitles = initialData.abTestTitles || [];
        if (abTestTitles.length !== initialTitles.length) return true;
        const sortedCurrentTitles = [...abTestTitles].sort();
        const sortedInitialTitles = [...initialTitles].sort();
        if (JSON.stringify(sortedCurrentTitles) !== JSON.stringify(sortedInitialTitles)) return true;

        // Check Packaging History
        const initialHistory = initialData?.packagingHistory || [];
        if (JSON.stringify(packagingHistory) !== JSON.stringify(initialHistory)) return true;

        // Check Cover History (Drafts)
        const initialCoverHistory = initialData?.coverHistory || [];
        if (coverHistory.length !== initialCoverHistory.length) return true;

        // Deep compare cover history (ignoring potential undefined vs null differences if safe, but JSON stringify is easiest)
        // We only care about URL and version/timestamp mainly.
        // But since we modify the array directly, comparison is straightforward.
        if (JSON.stringify(coverHistory) !== JSON.stringify(initialCoverHistory)) return true;

        return false;
    })();

    const isDirty = isMetadataDirty || isPackagingDirty || isCtrRulesDirty;

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
        isCtrRulesDirty,
        isDraft, setIsDraft,
        isPublished, setIsPublished,
        publishedUrl, setPublishedUrl,
        isValid,
        // Localization exports
        activeLanguage,
        localizations,
        setLocalizations,
        addLanguage,
        removeLanguage,
        switchLanguage,
        defaultData, // Expose for comparison logic
        // A/B Testing State
        abTestVariants,
        setAbTestVariants,
        currentPackagingVersion,
        setCurrentPackagingVersion,
        packagingHistory,
        setPackagingHistory,
        // A/B Test Titles
        abTestTitles,
        setAbTestTitles,
        // CTR Rules
        ctrRules,
        setCtrRules,

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
                abTestTitles,
                ctrRules,
                // Metadata
                viewCount,
                duration,
                videoRender,
                audioRender,
                publishedVideoId: isPublished ? (extractVideoId(publishedUrl) || undefined) : '',
                // Explicitly clear publishedAt if we are unpublishing or if publishedVideoId is empty
                publishedAt: (isPublished && extractVideoId(publishedUrl)) ? undefined : '', // If valid, let it be (undefined, meaning don't overwrite). If invalid, clear it.
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
                abTestTitles: initialData?.abTestTitles || [],
                ctrRules,
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
