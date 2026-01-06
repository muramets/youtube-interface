import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import { useSettings } from '../../../../../core/hooks/useSettings';
import { useVideos } from '../../../../../core/hooks/useVideos';
import { useVideoForm } from '../../../../../core/hooks/useVideoForm';
import { uploadImageToStorage, uploadBase64ToStorage } from '../../../../../core/services/storageService';
import { resizeImageToBlob } from '../../../../../core/utils/imageUtils';
import {
    type VideoDetails,
    type CoverVersion,
    type PackagingVersion,
    type HistoryItem,
    fetchVideoDetails,
    extractVideoId
} from '../../../../../core/utils/youtubeApi';
import { useABTesting, type ABTestingSaveData } from '../../../../../components/Shared/ABTesting';

export interface UseAddCustomVideoProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (videoData: Omit<VideoDetails, 'id'>, shouldClose?: boolean) => Promise<string | void>;
    onClone?: (originalVideo: VideoDetails, version: CoverVersion) => Promise<void>;
    initialData?: VideoDetails;
    initialTab?: 'details' | 'traffic';
}

export function useAddCustomVideo({
    isOpen,
    onClose,
    onSave,
    onClone,
    initialData,
    initialTab = 'details'
}: UseAddCustomVideoProps) {
    const { user } = useAuth();
    const { currentChannel, updateChannel } = useChannelStore();
    const { generalSettings } = useSettings();
    const { saveVideoHistory, deleteVideoHistoryItem } = useVideos(user?.uid || '', currentChannel?.id || '');

    const modalRef = useRef<HTMLDivElement>(null);
    const lastUploadTimeRef = useRef<number>(0);
    const activeUploadPromiseRef = useRef<Promise<string | void> | null>(null);

    // Draft State
    const [draftId] = useState(() => initialData?.id || `custom-${Date.now()}`);

    // UI State
    const [activeTab, setActiveTab] = useState<'details' | 'traffic'>(initialTab || 'details');
    const [isStatsExpanded, setIsStatsExpanded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [cloningVersion, setCloningVersion] = useState<number | null>(null);

    // Delete Confirmation
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; versionNumber: number | null }>({
        isOpen: false,
        versionNumber: null
    });

    // Toast State
    const [toastMessage, setToastMessage] = useState('');
    const [showToast, setShowToast] = useState(false);
    const [toastType, setToastType] = useState<'success' | 'error'>('success');
    const [toastPosition, setToastPosition] = useState<'top' | 'bottom'>('bottom');

    // Form State (from useVideoForm)
    const videoForm = useVideoForm(initialData, isOpen);
    const {
        title,
        description,
        tags,
        viewCount,
        duration, setDuration,
        coverImage, setCoverImage,
        currentVersion, setCurrentVersion,
        highestVersion, setHighestVersion,
        currentOriginalName, setCurrentOriginalName,
        fileVersionMap, setFileVersionMap,
        coverHistory, setCoverHistory,
        deletedHistoryIds, setDeletedHistoryIds,
        isPackagingDirty,
        isDraft, setIsDraft,
        isPublished,
        publishedUrl,
        activeLanguage,
        localizations,
        addLanguage,
        defaultData,
        getFullPayload,
        abTestVariants,
        setAbTestVariants,
        abTestTitles,
        setAbTestTitles,
        currentPackagingVersion,
        setCurrentPackagingVersion,
        packagingHistory,
        setPackagingHistory
    } = videoForm;

    // A/B Testing
    const {
        isOpen: isABModalOpen,
        openModal: openABModal,
        closeModal: closeABModal,
        handleSave: handleABTestSaveInternal,
        activeMode: activeABTab
    } = useABTesting({
        mode: 'both', // Initial dummy mode
        titles: abTestTitles,
        thumbnails: abTestVariants,
        currentTitle: title, // Use form title as base
        currentThumbnail: coverImage || '',
        onSave: (data) => {
            // Update local state
            setAbTestTitles(data.titles);
            setAbTestVariants(data.thumbnails);
        },
        onResultsSave: async () => {
            // No-op for now in creation flow
        }
    });

    const handleOpenTitleABTest = () => {
        openABModal('title');
    };

    const handleOpenThumbnailABTest = () => {
        openABModal('thumbnail');
    };

    const handleABTestSave = (data: ABTestingSaveData) => {
        handleABTestSaveInternal(data);
        closeABModal();
    };

    // Derived dirty state for SaveMenu
    const isEffectivePackagingDirty = isPackagingDirty && isDraft;

    // Reset state on initialTab change
    useEffect(() => {
        // Logic from original component if needed, formerly empty
    }, [initialTab]);

    // Pending Restore Effect (Removed)

    // Sole Survivor Logic
    useEffect(() => {
        if (abTestVariants.length === 1) {
            setCoverImage(abTestVariants[0]);
            setAbTestVariants([]);
        }
    }, [abTestVariants]);

    // Auto-sync Duration
    useEffect(() => {
        if (!isPublished) return;
        const videoId = extractVideoId(publishedUrl);
        if (videoId && generalSettings.apiKey) {
            fetchVideoDetails(videoId, generalSettings.apiKey).then(details => {
                if (details && details.duration) setDuration(details.duration);
            }).catch(console.error);
        }
    }, [publishedUrl, isPublished, generalSettings.apiKey]);

    // Strict Sync Logic (Simplified - removed tab switching)
    useEffect(() => {
        if (!isOpen) return;

        if (packagingHistory.length === 0) {
            if (!isDraft) setIsDraft(true);
            return;
        }

        const maxVersion = Math.max(...packagingHistory.map(v => v.versionNumber));
        const latestVersion = packagingHistory.find(v => v.versionNumber === maxVersion);

        if (!latestVersion) return;

        const snapshot = latestVersion.configurationSnapshot;

        let effectiveDefaultTitle = title;
        let effectiveDefaultDescription = description;
        let effectiveDefaultTags = tags;
        let effectiveLocalizations = { ...localizations };

        if (activeLanguage !== 'default') {
            effectiveDefaultTitle = defaultData.title;
            effectiveDefaultDescription = defaultData.description;
            effectiveDefaultTags = defaultData.tags;
            effectiveLocalizations[activeLanguage] = {
                languageCode: activeLanguage,
                title: title,
                description: description,
                tags: tags
            };
        }

        const isContentIdentical = (() => {
            if (effectiveDefaultTitle !== snapshot.title) return false;
            if ((effectiveDefaultDescription || '') !== (snapshot.description || '')) return false;
            if (JSON.stringify(effectiveDefaultTags || []) !== JSON.stringify(snapshot.tags || [])) return false;
            if ((coverImage || '') !== (snapshot.coverImage || '')) return false;
            if (JSON.stringify(abTestVariants || []) !== JSON.stringify(snapshot.abTestVariants || [])) return false;

            const snapLocs = snapshot.localizations || {};
            const allLocKeys = new Set([...Object.keys(effectiveLocalizations), ...Object.keys(snapLocs)]);
            for (const key of allLocKeys) {
                const currentLoc = effectiveLocalizations[key];
                const snapLoc = snapLocs[key];
                if (!currentLoc || !snapLoc) return false;
                if (currentLoc.title !== snapLoc.title ||
                    currentLoc.description !== snapLoc.description ||
                    JSON.stringify(currentLoc.tags) !== JSON.stringify(snapLoc.tags)) return false;
            }
            return true;
        })();

        if (isContentIdentical) {
            if (isDraft) setIsDraft(false);
        } else {
            if (!isDraft) setIsDraft(true);
        }
    }, [
        isOpen, packagingHistory, title, description, tags, coverImage,
        abTestVariants, localizations, isDraft, activeLanguage, defaultData
    ]);

    // Body Overflow Effect
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Handlers
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
            handleClose();
        }
    };

    const handleAddLanguage = async (code: string, customName?: string, customFlag?: string) => {
        addLanguage(code, customName, customFlag);
        if (customName && customFlag && currentChannel && user) {
            const existingLanguages = currentChannel.customLanguages || [];
            const exists = existingLanguages.some(l => l.code === code);
            if (!exists) {
                const newLang = { code, name: customName, flag: customFlag };
                try {
                    await updateChannel(user.uid, currentChannel.id, {
                        customLanguages: [...existingLanguages, newLang]
                    });
                } catch (error) {
                    console.error('Failed to save custom language to channel:', error);
                }
            }
        }
    };

    const handleDeleteCustomLanguage = async (code: string) => {
        if (currentChannel && user) {
            const existingLanguages = currentChannel.customLanguages || [];
            const updatedLanguages = existingLanguages.filter(l => l.code !== code);
            try {
                await updateChannel(user.uid, currentChannel.id, {
                    customLanguages: updatedLanguages
                });
            } catch (error) {
                console.error('Failed to remove custom language from channel:', error);
            }
        }
    };

    const handleImageUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            throw new Error('Invalid file type');
        }

        const currentUploadTime = Date.now();
        lastUploadTimeRef.current = currentUploadTime;

        const performUpload = async () => {
            try {
                const userId = user?.uid || 'anonymous';
                const videoId = initialData?.id || draftId;

                const fileKey = `${file.name.replace(/\./g, '_')} -${file.size} `;
                let newVersion: number;
                if (fileVersionMap[fileKey]) {
                    newVersion = fileVersionMap[fileKey];
                } else {
                    newVersion = highestVersion + 1;
                    setFileVersionMap(prev => ({ ...prev, [fileKey]: newVersion }));
                    setHighestVersion(newVersion);
                }
                setCurrentVersion(newVersion);
                setCurrentOriginalName(file.name);

                setToastMessage('Uploading image...');
                setToastType('success');
                setShowToast(true);

                const blob = await resizeImageToBlob(file, 1280, 0.7);
                const timestamp = Date.now();
                const path = `users/${userId}/channels/${currentChannel?.id}/videos/${videoId}/${timestamp}_${file.name}`;
                const downloadURL = await uploadImageToStorage(blob, path);

                if (lastUploadTimeRef.current === currentUploadTime) {
                    setCoverImage(downloadURL);
                    setToastType('success');
                    setToastMessage('Image uploaded successfully!');
                    setTimeout(() => setShowToast(false), 2000);
                }
                return downloadURL;
            } catch (error) {
                console.error('Error uploading image:', error);
                setToastMessage('Failed to upload image');
                setToastType('error');
                setShowToast(true);
                throw error;
            } finally {
                if (lastUploadTimeRef.current === currentUploadTime) {
                    activeUploadPromiseRef.current = null;
                }
            }
        };

        const uploadPromise = performUpload();
        activeUploadPromiseRef.current = uploadPromise;
        return uploadPromise as Promise<string>;
    };

    const handleDeleteHistoryItem = async (timestamp: number) => {
        setCoverHistory(prev => prev.filter(h => h.timestamp !== timestamp));
        setDeletedHistoryIds(prev => new Set(prev).add(timestamp));
    };

    const handleSave = async (shouldClose = true, overrideIsDraft?: boolean, overrides?: { overridePackagingVersion?: number, overridePackagingHistory?: PackagingVersion[] }): Promise<string | undefined> => {
        if (!coverImage) {
            alert("Please upload a cover image");
            return undefined;
        }

        let effectiveCoverImage = coverImage;

        if (activeUploadPromiseRef.current) {
            setIsSaving(true);
            try {
                const uploadedUrl = await activeUploadPromiseRef.current;
                if (uploadedUrl && typeof uploadedUrl === 'string') {
                    effectiveCoverImage = uploadedUrl;
                }
            } catch (e) {
                setIsSaving(false);
                return undefined;
            }
        } else if (coverImage.startsWith('blob:')) {
            setToastMessage("Please wait for image upload to complete");
            setToastType('error');
            setShowToast(true);
            return undefined;
        } else if (coverImage.startsWith('data:image')) {
            try {
                const userId = user?.uid || 'anonymous';
                const uploadedUrl = await uploadBase64ToStorage(coverImage, userId);
                effectiveCoverImage = uploadedUrl;
                setCoverImage(uploadedUrl);
            } catch (e) {
                console.error("Failed to upload base64 cover image:", e);
                setToastMessage("Failed to save cover image.");
                setToastType('error');
                setShowToast(true);
                setIsSaving(false);
                return undefined;
            }
        }

        setIsSaving(true);

        try {
            // 1. Migrate Legacy Base64 Images in History
            let updatedCoverHistory = [...coverHistory];
            let hasHistoryUpdates = false;

            const coverHistoryPromises = updatedCoverHistory.map(async (item, index) => {
                if (item.url.startsWith('data:image')) {
                    const newUrl = await uploadBase64ToStorage(item.url, user?.uid || 'anonymous');
                    updatedCoverHistory[index] = { ...item, url: newUrl };
                    hasHistoryUpdates = true;
                }
            });
            await Promise.all(coverHistoryPromises);
            if (hasHistoryUpdates) setCoverHistory(updatedCoverHistory);

            // 2. Migrate Legacy Base64 Images in Packaging History & Upload new A/B variants
            let effectivePackagingHistory = overrides?.overridePackagingHistory ?? packagingHistory;
            const effectiveOverriddenHistory = overrides?.overridePackagingHistory; // Keep ref to verify if used
            let hasPackagingUpdates = false;
            effectivePackagingHistory = JSON.parse(JSON.stringify(effectivePackagingHistory));

            const packagingPromises = effectivePackagingHistory.map(async (version, index) => {
                // Upload cover image if base64
                if (version.configurationSnapshot.coverImage?.startsWith('data:image')) {
                    const newUrl = await uploadBase64ToStorage(version.configurationSnapshot.coverImage, user?.uid || 'anonymous');
                    effectivePackagingHistory[index].configurationSnapshot.coverImage = newUrl;
                    hasPackagingUpdates = true;
                }

                // Upload A/B test variants (blob: or data:image)
                if (version.configurationSnapshot.abTestVariants?.some(v => v.startsWith('blob:') || v.startsWith('data:image'))) {
                    const variantPromises = (version.configurationSnapshot.abTestVariants || []).map(async (variant) => {
                        if (variant) {
                            if (variant.startsWith('blob:')) {
                                try {
                                    const blob = await fetch(variant).then(r => r.blob());
                                    const timestamp = Date.now();
                                    const randomId = Math.random().toString(36).substring(7);
                                    const path = `covers/${user?.uid || 'anonymous'}/abtest_${timestamp}_${randomId}.jpg`;
                                    return await uploadImageToStorage(blob, path);
                                } catch (e) {
                                    console.error('Failed to upload blob variant:', e);
                                    return variant; // Fallback? Or fail? Best to return variant and let error handling upstream deal with it, or empty string.
                                }
                            } else if (variant.startsWith('data:image')) {
                                return await uploadBase64ToStorage(variant, user?.uid || 'anonymous');
                            }
                        }
                        return variant;
                    });
                    const newVariants = await Promise.all(variantPromises);
                    effectivePackagingHistory[index].configurationSnapshot.abTestVariants = newVariants;
                    hasPackagingUpdates = true;
                }
            });
            await Promise.all(packagingPromises);

            if (hasPackagingUpdates && !effectiveOverriddenHistory) {
                setPackagingHistory(effectivePackagingHistory);
            }

            // 3. Upload current A/B test variants (blob: or data:image)
            let effectiveAbTestVariants = [...abTestVariants];
            if (effectiveAbTestVariants.some(v => v.startsWith('blob:') || v.startsWith('data:image'))) {
                const variantPromises = effectiveAbTestVariants.map(async (variant) => {
                    if (variant) {
                        if (variant.startsWith('blob:')) {
                            try {
                                const blob = await fetch(variant).then(r => r.blob());
                                const timestamp = Date.now();
                                const randomId = Math.random().toString(36).substring(7);
                                const path = `covers/${user?.uid || 'anonymous'}/abtest_${timestamp}_${randomId}.jpg`;
                                return await uploadImageToStorage(blob, path);
                            } catch (e) {
                                console.error('Failed to upload blob variant:', e);
                                return variant;
                            }
                        } else if (variant.startsWith('data:image')) {
                            return await uploadBase64ToStorage(variant, user?.uid || 'anonymous');
                        }
                    }
                    return variant;
                });
                effectiveAbTestVariants = await Promise.all(variantPromises);
                setAbTestVariants(effectiveAbTestVariants);
            }

            const finalData = getFullPayload();
            const finalTitle = finalData.title.trim() || "Your Next Viral Music Playlist";
            const effectivePackagingVersion = overrides?.overridePackagingVersion ?? currentPackagingVersion;

            const videoData: Omit<VideoDetails, 'id'> & { id?: string } = {
                id: initialData?.id,
                title: finalTitle.trim(),
                thumbnail: effectiveCoverImage,
                channelId: currentChannel?.id || '',
                channelTitle: currentChannel?.name || 'My Channel',
                channelAvatar: currentChannel?.avatar || '',
                publishedAt: (initialData && initialData.publishedAt) ? initialData.publishedAt : new Date().toISOString(),
                viewCount: finalData.viewCount,
                duration: finalData.duration || '1:02:11',
                isCustom: true,
                customImage: effectiveCoverImage,
                createdAt: initialData?.createdAt,
                coverHistory: updatedCoverHistory,
                customImageName: currentOriginalName || undefined,
                customImageVersion: currentVersion,
                highestVersion: highestVersion,
                fileVersionMap: fileVersionMap,
                historyCount: updatedCoverHistory.length,
                publishedVideoId: finalData.publishedVideoId,
                videoRender: finalData.videoRender,
                audioRender: finalData.audioRender,
                isDraft: overrideIsDraft !== undefined ? overrideIsDraft : (shouldClose ? isDraft : true),
                currentPackagingVersion: effectivePackagingVersion,
                packagingHistory: effectivePackagingHistory,
                abTestTitles: abTestTitles,
                abTestThumbnails: effectiveAbTestVariants,
                abTestResults: { titles: [], thumbnails: [] } // Initialize empty results for new tests
            };

            const newId = await onSave(videoData, shouldClose);
            const targetId = (typeof newId === 'string' ? newId : initialData?.id);

            if (targetId && user && currentChannel) {
                const deletePromises = Array.from(deletedHistoryIds).map(timestamp =>
                    deleteVideoHistoryItem({ videoId: targetId, historyId: timestamp.toString() })
                );
                await Promise.all(deletePromises);
                const savePromises = updatedCoverHistory.map(item => saveVideoHistory({ videoId: targetId, historyItem: item as unknown as HistoryItem }));
                await Promise.all(savePromises);
            }

            if (shouldClose) {
                onClose();
            } else {
                setIsDraft(true);
            }
            return targetId;
        } catch (error: any) {
            console.error("Failed to save video:", error);
            if (error.message && error.message.includes('exceeds the maximum allowed size')) {
                setToastMessage("File too large! The cover image is too big for the database. Please try a smaller image.");
            } else {
                setToastMessage("Failed to save video.");
            }
            setToastType('error');
            setShowToast(true);
            return undefined;
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = async () => {
        onClose();
    };

    const handleCloneWithSave = async (version: CoverVersion) => {
        if (!onClone) return;
        setCloningVersion(version.version);
        try {
            const savedId = await handleSave(false);
            if (!savedId) {
                console.error("Failed to save video before cloning");
                return;
            }
            const videoToClone: VideoDetails = initialData ? { ...initialData, id: savedId } : {
                id: savedId,
                title: title,
                description: description,
                tags: tags,
                publishedAt: new Date().toISOString(),
                createdAt: Date.now(),
                channelId: currentChannel?.id || '',
                channelTitle: currentChannel?.name || '',
                channelAvatar: currentChannel?.avatar || '',
                viewCount: viewCount,
                duration: duration,
                isCustom: true,
                thumbnail: coverImage || '',
                customImage: coverImage || '',
                customImageVersion: currentVersion,
                historyCount: coverHistory.length,
                coverHistory: coverHistory
            };
            await onClone(videoToClone, version);
            onClose();
        } finally {
            setCloningVersion(null);
        }
    };

    const handleSaveAsVersion = () => {
        let snapshotTitle = title;
        let snapshotDescription = description;
        let snapshotTags = tags;
        if (activeLanguage !== 'default') {
            snapshotTitle = defaultData.title;
            snapshotDescription = defaultData.description;
            snapshotTags = defaultData.tags;
        }

        const newHistoryItem: PackagingVersion = {
            versionNumber: currentPackagingVersion,
            startDate: Date.now(),
            checkins: [],
            configurationSnapshot: {
                title: snapshotTitle,
                description: snapshotDescription,
                tags: snapshotTags,
                coverImage: coverImage || '',
                abTestVariants: abTestVariants,
                localizations: localizations
            }
        };

        const newHistory = [...packagingHistory, newHistoryItem];
        const newVersion = currentPackagingVersion + 1;

        setPackagingHistory(newHistory);
        setCurrentPackagingVersion(newVersion);
        setIsDraft(false);

        handleSave(true, false, {
            overridePackagingVersion: newVersion,
            overridePackagingHistory: newHistory
        });
    };

    return {
        // State
        modalRef,
        activeTab, setActiveTab,
        isStatsExpanded, setIsStatsExpanded,
        isSaving,
        cloningVersion,
        deleteConfirmation,
        toastMessage, showToast, setShowToast, toastType, toastPosition,
        draftId,
        isEffectivePackagingDirty,
        currentChannel, // Exported for language list

        // Form State & Setters (Spread from useVideoForm)
        ...videoForm,

        // Handlers
        handleBackdropClick,
        handleClose,
        handleSave,
        handleImageUpload,
        handleDeleteHistoryItem,
        handleCloneWithSave,
        handleSaveAsVersion,
        setToastMessage, setToastType, setToastPosition,
        setDeleteConfirmation, // Used by confirmation modal state if needed, though simpler now

        // A/B Test Exports
        abTestVariants,
        abTestTitles,
        isABModalOpen,
        handleCloseABModal: closeABModal,
        handleOpenTitleABTest,
        handleOpenThumbnailABTest,
        handleABTestSave,
        activeABTab,
        abTestResults: undefined, // Or pass from initialData if available for edit mode

        // Custom Language Handlers
        handleAddLanguage,
        handleDeleteCustomLanguage
    };
}
