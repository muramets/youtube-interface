import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { type VideoDetails, type CoverVersion, type PackagingMetrics, type PackagingVersion, type HistoryItem, type PackagingCheckin, fetchVideoDetails, extractVideoId } from '../../utils/youtubeApi';

import { useVideos } from '../../hooks/useVideos';

import { useChannelStore } from '../../stores/channelStore';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';

import { Toast } from '../Shared/Toast';
import { useVideoForm } from '../../hooks/useVideoForm';

import { VersionHistory } from './Modal/VersionHistory';
import { ImageUploader } from './Modal/ImageUploader';
import { VideoForm } from './Modal/VideoForm';
import { PackagingTable } from './Packaging';
import { SortableVariant } from './Modal/SortableVariant';
import { MetricsModal } from './Modal/MetricsModal';
import { SaveMenu } from './Modal/SaveMenu';

import { SuggestedTrafficTab } from './Modal/SuggestedTraffic/SuggestedTrafficTab';
import { uploadImageToStorage, uploadBase64ToStorage } from '../../services/storageService';
import { resizeImageToBlob } from '../../utils/imageUtils';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import { SubTabs } from '../Shared/SubTabs';

interface CustomVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (videoData: Omit<VideoDetails, 'id'>, shouldClose?: boolean) => Promise<string | void>;
    onClone?: (originalVideo: VideoDetails, version: CoverVersion) => Promise<void>;

    initialData?: VideoDetails;
    initialTab?: 'details' | 'packaging' | 'traffic';
}

export const CustomVideoModal: React.FC<CustomVideoModalProps> = ({
    isOpen,
    onClose,
    onSave,
    onClone,

    initialData,
    initialTab = 'details'
}) => {
    const { user } = useAuth();
    const { currentChannel, updateChannel } = useChannelStore();
    const { packagingSettings, generalSettings } = useSettings();


    const { saveVideoHistory, deleteVideoHistoryItem } = useVideos(user?.uid || '', currentChannel?.id || '');
    const modalRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);


    const [draftId] = useState(() => initialData?.id || `custom-${Date.now()}`);

    const [activeTab, setActiveTab] = useState<'details' | 'packaging' | 'traffic'>(initialTab);

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    // Debug: Log current check-ins when modal opens


    // Initialize activeVersionTab based on draft status
    // Initialize activeVersionTab based on draft status
    const [activeVersionTab, setActiveVersionTab] = useState<string>('current');



    const [isStatsExpanded, setIsStatsExpanded] = useState(false);
    const [cloningVersion, setCloningVersion] = useState<number | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );
    const [isSaving, setIsSaving] = useState(false);



    // Metrics Modal State
    const [showMetricsModal, setShowMetricsModal] = useState(false);

    const [checkinTargetVersion, setCheckinTargetVersion] = useState<number | null>(null);

    // Delete Confirmation State
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; versionNumber: number | null }>({
        isOpen: false,
        versionNumber: null
    });
    const [deleteCheckinConfirmation, setDeleteCheckinConfirmation] = useState<{ isOpen: boolean; versionNumber: number | null; checkinId: string | null }>({ isOpen: false, versionNumber: null, checkinId: null });

    const handleSaveAsVersion = () => {
        // If this is the first version (no history), automatically finalize it with null metrics
        if (packagingHistory.length === 0) {
            const nullMetrics: PackagingMetrics = {
                impressions: null,
                ctr: null,
                views: null,
                avdSeconds: null,
                avdPercentage: null
            };
            confirmSaveVersion(nullMetrics);
            return;
        }
        setCheckinTargetVersion(null); // Reset target version (null means creating NEW version)
        setShowMetricsModal(true);
    };

    const confirmSaveVersion = async (metricsData: PackagingMetrics) => {
        if (checkinTargetVersion !== null) {
            // Adding a check-in to an existing version
            const newCheckin = {
                id: crypto.randomUUID(),
                date: Date.now(),
                metrics: metricsData
            };

            setPackagingHistory(prev => prev.map(v => {
                if (v.versionNumber === checkinTargetVersion) {
                    return {
                        ...v,
                        checkins: [...v.checkins, newCheckin]
                    };
                }
                return v;
            }));

            setShowMetricsModal(false);
            setCheckinTargetVersion(null);
            return;
        }

        // Creating a NEW version

        const newHistoryItem: PackagingVersion = {
            versionNumber: currentPackagingVersion,
            startDate: Date.now(),
            checkins: [],
            configurationSnapshot: {
                title: title,
                description: description,
                tags: tags,
                coverImage: coverImage || '',
                abTestVariants: abTestVariants,
                localizations: localizations
            }
        };

        // Update state locally first
        const newHistory = [...packagingHistory, newHistoryItem];
        const newVersion = currentPackagingVersion + 1;

        setPackagingHistory(newHistory);
        setCurrentPackagingVersion(newVersion);
        setShowMetricsModal(false);
        setIsDraft(false); // Version finalized, no longer a draft

        // Proceed with normal save, explicitly setting isDraft to false
        // IMPORTANT: We must pass the NEW values explicitly because state updates are async
        // and handleSave reads from state which might be stale in this closure?
        // Actually handleSave reads from state variables which are closed over.
        // But `confirmSaveVersion` is a closure.
        // If we call `handleSave` immediately, it will see the OLD state values because re-render hasn't happened yet.
        // THIS IS THE BUG!

        await handleSave(true, false, {
            overridePackagingVersion: newVersion,
            overridePackagingHistory: newHistory
        });
    };


    // Toast State
    const [toastMessage, setToastMessage] = useState('');
    const [showToast, setShowToast] = useState(false);
    const lastUploadTimeRef = useRef<number>(0);
    const activeUploadPromiseRef = useRef<Promise<string | void> | null>(null);
    const [toastType, setToastType] = useState<'success' | 'error'>('success');
    const [toastPosition, setToastPosition] = useState<'top' | 'bottom'>('bottom');

    const {
        title, setTitle,
        description, setDescription,
        tags, setTags,
        viewCount, setViewCount,
        duration, setDuration,
        coverImage, setCoverImage,
        currentVersion, setCurrentVersion,
        highestVersion, setHighestVersion,
        currentOriginalName, setCurrentOriginalName,
        fileVersionMap, setFileVersionMap,
        videoRender, setVideoRender,
        audioRender, setAudioRender,
        coverHistory, setCoverHistory,
        deletedHistoryIds, setDeletedHistoryIds,
        isMetadataDirty,
        isPackagingDirty,
        isCtrRulesDirty,
        isDraft, setIsDraft,
        isPublished, setIsPublished,
        publishedUrl, setPublishedUrl,
        // Localization
        activeLanguage,
        localizations,
        addLanguage,
        removeLanguage,
        switchLanguage,
        getFullPayload,
        getMetadataOnlyPayload,
        // A/B Testing
        abTestVariants,
        setAbTestVariants,
        currentPackagingVersion,
        setCurrentPackagingVersion,
        packagingHistory,
        setPackagingHistory,
        ctrRules,
        setCtrRules
    } = useVideoForm(initialData, isOpen);

    // Initialize activeVersionTab based on draft status

    // Auto-Checkin Logic
    // Helper to calculate checkin count for dependency stability
    const checkinCount = packagingHistory.reduce((acc, v) => acc + v?.checkins?.length || 0, 0);
    const hasRules = packagingSettings?.checkinRules?.length > 0;

    // Auto-Checkin Logic
    useEffect(() => {
        if (!isOpen || !initialData?.publishedAt || !hasRules || !isPublished || !initialData?.publishedVideoId) return;

        // Use a flag to prevent multiple checks per render cycle (though useEffect handles this, strict mode might double invoke)
        // Also we want to avoid checking if we just updated history.

        const publishTime = new Date(initialData.publishedAt).getTime();
        const now = Date.now();
        let hasUpdates = false;

        // Perform check
        // Find the active version (or latest)
        // We use packagingHistory from PROPS/STATE.
        if (packagingHistory.length === 0) return;

        // Deep clone history to avoid direct mutation
        // We only modify if we find something to add.
        const historyCopy = JSON.parse(JSON.stringify(packagingHistory)) as PackagingVersion[];

        // Sort to find latest
        historyCopy.sort((a, b) => b.versionNumber - a.versionNumber);
        const latestVersion = historyCopy[0];

        // Check rules against latest version
        packagingSettings.checkinRules.forEach(rule => {
            const targetTime = publishTime + (rule.hoursAfterPublish * 60 * 60 * 1000);

            if (now >= targetTime) {
                const existingCheckin = latestVersion.checkins.find(c => c.ruleId === rule.id);
                if (!existingCheckin) {
                    // Add checkin
                    const newCheckin: PackagingCheckin = {
                        id: crypto.randomUUID(),
                        date: targetTime,
                        metrics: {
                            impressions: null,
                            ctr: null,
                            views: null,
                            avdSeconds: null,
                            avdPercentage: null
                        },
                        ruleId: rule.id
                    };
                    latestVersion.checkins.push(newCheckin);
                    hasUpdates = true;
                    // Notification removed: The global scheduler handles reminders. 
                    // When the modal is open, we just show the new checkin in the UI.
                }
            }
        });

        if (hasUpdates) {
            // Sort checkins
            latestVersion.checkins.sort((a, b) => a.date - b.date);

            // Update state
            // Re-construct history array with updated latest version
            const newHistory = packagingHistory.map(v => v.versionNumber === latestVersion.versionNumber ? latestVersion : v);

            // Only update if actually different to prevent loops?
            // React state update is already optimized, but if objects are new references it will trigger re-render.
            // We rely on the fact that if we add a checkin, next time `!existingCheckin` will be false.
            setPackagingHistory(newHistory);
        }
    }, [isOpen, initialData?.publishedAt, hasRules, isPublished, packagingHistory.length, checkinCount]); // Minimized dependencies

    // Auto-sync Duration when Published URL changes
    useEffect(() => {
        if (!isPublished) return;

        const videoId = extractVideoId(publishedUrl);
        if (videoId && generalSettings.apiKey) {
            fetchVideoDetails(videoId, generalSettings.apiKey).then(details => {
                // Update duration if found (overwriting manual entry as per user request)
                if (details && details.duration) {
                    setDuration(details.duration);
                }
            }).catch(console.error);
        }
    }, [publishedUrl, isPublished, generalSettings.apiKey]);

    // Update activeVersionTab when modal opens or data changes
    useEffect(() => {
        if (isOpen) {
            if (initialData?.isDraft === false && packagingHistory.length > 0) {
                // If not a draft, default to the latest version
                const maxVersion = Math.max(...packagingHistory.map(v => v.versionNumber));
                setActiveVersionTab(maxVersion.toString());
            } else {
                setActiveVersionTab('current');
            }
        }
    }, [isOpen, initialData, packagingHistory]);

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

    if (!isOpen) return null;

    const handleImageUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) return;

        const currentUploadTime = Date.now();
        lastUploadTimeRef.current = currentUploadTime;

        const performUpload = async () => {
            try {
                // Optimistic UI: Show preview immediately
                const objectUrl = URL.createObjectURL(file);

                // Push current cover to history before updating (if exists)
                if (coverImage) {
                    const historyVersion: CoverVersion = {
                        url: coverImage,
                        version: currentVersion,
                        timestamp: Date.now(),
                        originalName: currentOriginalName
                    };
                    setCoverHistory(prev => [historyVersion, ...prev]);
                }

                // Set new cover immediately (optimistic)
                setCoverImage(objectUrl);
                setCurrentOriginalName(file.name);

                // Calculate new version
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

                setToastMessage('Uploading image...');
                setToastType('success');
                setShowToast(true);

                // Compress and resize image directly to Blob
                const blob = await resizeImageToBlob(file, 1280, 0.7);

                // Upload to Firebase Storage
                const timestamp = Date.now();
                // users/{userId}/channels/{channelId}/videos/{videoId}/{timestamp}_{filename}
                const path = `users/${user?.uid}/channels/${currentChannel?.id}/videos/${draftId}/${timestamp}_${file.name}`;
                const downloadURL = await uploadImageToStorage(blob, path);

                // Update history items that might have the blob URL
                setCoverHistory(prev => prev.map(item => {
                    if (item.url === objectUrl) {
                        return { ...item, url: downloadURL };
                    }
                    return item;
                }));

                // Only update current cover image if this is still the latest upload
                if (lastUploadTimeRef.current === currentUploadTime) {
                    setCoverImage(downloadURL);
                    setToastType('success'); // Ensure toast is green
                    setToastMessage('Image uploaded successfully!');
                    setTimeout(() => setShowToast(false), 2000);
                }

                // Revoke object URL to free memory
                URL.revokeObjectURL(objectUrl);

                return downloadURL;

            } catch (error) {
                console.error('Error uploading image:', error);
                setToastMessage('Failed to upload image');
                setToastType('error');
                setShowToast(true);
                // Revert on failure? For now, keep it simple.
                throw error; // Re-throw to fail the promise
            } finally {
                // We can't easily check against the promise itself here because of scoping,
                // but we can check if the time matches.
                if (lastUploadTimeRef.current === currentUploadTime) {
                    activeUploadPromiseRef.current = null;
                }
            }
        };

        const uploadPromise = performUpload();
        activeUploadPromiseRef.current = uploadPromise;
        await uploadPromise;
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleImageUpload(e.dataTransfer.files[0]);
        }
    };

    const handleDeleteCurrentVersion = (e: React.MouseEvent) => {
        e.stopPropagation();

        if (coverHistory.length > 0) {
            // Promote the most recent history item to current
            const [nextCover, ...remainingHistory] = coverHistory;
            setCoverImage(nextCover.url);
            setCurrentVersion(nextCover.version);
            setCurrentOriginalName(nextCover.originalName || 'Restored Version');
            setCoverHistory(remainingHistory);

            // Mark the promoted item as "deleted" from history (since it's now current)
            // This ensures it doesn't get duplicated if we save
            setDeletedHistoryIds(prev => new Set(prev).add(nextCover.timestamp));
        } else {
            // No history, just clear the current cover
            setCoverImage('');
            setCurrentVersion(0);
            setCurrentOriginalName('');
        }
    };

    const handleDeleteHistoryItem = async (e: React.MouseEvent, timestamp: number, immediate: boolean = false) => {
        e.stopPropagation();

        if (immediate) {
            // Immediate delete for broken files (no confirmation, auto-save)
            setCoverHistory(prev => prev.filter(h => h.timestamp !== timestamp));

            // Perform actual backend deletion immediately
            if (initialData?.id) {
                try {
                    await deleteVideoHistoryItem({ videoId: initialData.id, historyId: timestamp.toString() });
                    setToastMessage('Broken version deleted');
                    setToastType('success');
                    setShowToast(true);
                } catch (error) {
                    console.error("Failed to delete history item:", error);
                    setToastMessage('Failed to delete version');
                    setToastType('error');
                    setShowToast(true);
                }
            }
            return;
        }

        if (window.confirm('Are you sure you want to delete this version?')) {
            setCoverHistory(prev => prev.filter(h => h.timestamp !== timestamp));
            setDeletedHistoryIds(prev => new Set(prev).add(timestamp));
        }
    };

    const handleDeleteCheckin = (versionNumber: number, checkinId: string) => {
        setDeleteCheckinConfirmation({
            isOpen: true,
            versionNumber,
            checkinId
        });
    };

    const confirmDeleteCheckin = async () => {
        const { versionNumber, checkinId } = deleteCheckinConfirmation;
        if (versionNumber !== null && checkinId !== null) {
            const newHistory = packagingHistory.map(v => {
                if (v.versionNumber === versionNumber) {
                    return {
                        ...v,
                        checkins: v.checkins.filter(c => c.id !== checkinId)
                    };
                }
                return v;
            });

            setPackagingHistory(newHistory);

            // Persist changes
            await handleSave(false, undefined, {
                overridePackagingHistory: newHistory
            });

            setToastMessage('Check-in deleted');
            setToastType('success');
            setShowToast(true);
        }
        setDeleteCheckinConfirmation({ isOpen: false, versionNumber: null, checkinId: null });
    };

    const handleSave = async (shouldClose = true, overrideIsDraft?: boolean, overrides?: { overridePackagingVersion?: number, overridePackagingHistory?: PackagingVersion[] }) => {
        if (!coverImage) {
            alert("Please upload a cover image");
            return;
        }

        let effectiveCoverImage = coverImage;

        if (activeUploadPromiseRef.current) {
            setIsSaving(true); // Show loading spinner
            try {
                const uploadedUrl = await activeUploadPromiseRef.current;
                if (uploadedUrl && typeof uploadedUrl === 'string') {
                    effectiveCoverImage = uploadedUrl;
                }
            } catch (e) {
                setIsSaving(false);
                return; // Stop save if upload failed
            }
        } else if (coverImage.startsWith('blob:')) {
            // Fallback for edge case where promise is gone but blob remains (shouldn't happen with new logic)
            setToastMessage("Please wait for image upload to complete");
            setToastType('error');
            setShowToast(true);
            return;
        }

        setIsSaving(true);

        try {
            // 1. Migrate Legacy Base64 Images in History
            // This prevents "Document too large" errors by moving old base64 images to Storage
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

            if (hasHistoryUpdates) {
                setCoverHistory(updatedCoverHistory);
            }

            // 2. Migrate Legacy Base64 Images in Packaging History
            let effectivePackagingHistory = overrides?.overridePackagingHistory ?? packagingHistory;
            let hasPackagingUpdates = false;

            // Deep copy to avoid mutating state directly if it came from state
            effectivePackagingHistory = JSON.parse(JSON.stringify(effectivePackagingHistory));

            const packagingPromises = effectivePackagingHistory.map(async (version, index) => {
                if (version.configurationSnapshot.coverImage?.startsWith('data:image')) {
                    const newUrl = await uploadBase64ToStorage(version.configurationSnapshot.coverImage, user?.uid || 'anonymous');
                    effectivePackagingHistory[index].configurationSnapshot.coverImage = newUrl;
                    hasPackagingUpdates = true;
                }
            });
            await Promise.all(packagingPromises);

            if (hasPackagingUpdates && !overrides?.overridePackagingHistory) {
                // Only update state if we are NOT using overrides (because overrides are already "future" state)
                // But wait, if overrides had base64, we want to update them too.
                // If we are using overrides, we don't update state immediately because overrides might be from `confirmSaveVersion` which calls `setPackagingHistory` itself.
                // Actually, `confirmSaveVersion` sets state, then calls `handleSave`.
                // So `packagingHistory` state might already be the new one? No, state update is async.
                // That's why we have overrides.
                // If we fix overrides, we should probably just use the fixed version for saving.
                // We can optionally update state if it matches.
                if (!overrides) {
                    setPackagingHistory(effectivePackagingHistory);
                }
            }

            const finalData = getFullPayload();

            // Default title if empty
            const finalTitle = finalData.title.trim() || "Your Next Viral Music Playlist";

            // Use overrides if provided (to handle async state updates during version finalization)
            const effectivePackagingVersion = overrides?.overridePackagingVersion ?? currentPackagingVersion;

            const videoData: Omit<VideoDetails, 'id'> & { id?: string } = {
                ...finalData,
                id: draftId,
                title: finalTitle,
                thumbnail: effectiveCoverImage,
                channelId: currentChannel?.id || '',
                channelTitle: currentChannel?.name || 'My Channel',
                channelAvatar: currentChannel?.avatar || '',
                publishedAt: (initialData && initialData.publishedAt) ? initialData.publishedAt : new Date().toISOString(),
                // Metadata is already in finalData, but we need to ensure structure matches
                viewCount: finalData.viewCount || '1M',
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
                isDraft: overrideIsDraft !== undefined ? overrideIsDraft : (shouldClose ? isDraft : true), // Use override if provided, otherwise auto-save preserves state, Manual save sets to Draft

                // Packaging Data
                currentPackagingVersion: effectivePackagingVersion,
                packagingHistory: effectivePackagingHistory
            };

            const newId = await onSave(videoData, shouldClose);
            const targetId = initialData?.id || (typeof newId === 'string' ? newId : undefined);

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
                // If manual save (not close), mark as draft
                setIsDraft(true);
            }
        } catch (error: any) {
            console.error("Failed to save video:", error);

            if (error.message && error.message.includes('exceeds the maximum allowed size')) {
                setToastMessage("File too large! The cover image is too big for the database. Please try a smaller image.");
            } else {
                setToastMessage("Failed to save video.");
            }

            setToastType('error');
            setShowToast(true);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = async () => {
        // Auto-save Metadata ONLY if it's an existing video
        if (isMetadataDirty && initialData) {
            const metadataPayload = getMetadataOnlyPayload();
            // We need to construct the full object but with original packaging data
            const videoData: Omit<VideoDetails, 'id'> = {
                ...metadataPayload,
                thumbnail: initialData.thumbnail || '',
                channelId: currentChannel?.id || '',
                channelTitle: currentChannel?.name || 'My Channel',
                channelAvatar: currentChannel?.avatar || '',
                publishedAt: initialData.publishedAt,
                isCustom: true,
                customImage: initialData.customImage || '', // Ensure not undefined
                createdAt: initialData.createdAt,
                coverHistory: coverHistory, // History shouldn't change if we revert
                customImageName: initialData.customImageName,
                customImageVersion: initialData.customImageVersion || 1,
                highestVersion: initialData.highestVersion || 0,
                fileVersionMap: initialData.fileVersionMap || {},
                historyCount: coverHistory.length,
            };

            try {
                await onSave(videoData, false); // Silent save
            } catch (error) {
                console.error("Failed to auto-save metadata:", error);
            }
        }
        onClose();
    };

    const handleCloneWithSave = async (version: CoverVersion) => {
        if (!onClone || !initialData) return;
        setCloningVersion(version.version);
        try {
            await handleSave(false);
            await onClone(initialData, version);
        } finally {
            setCloningVersion(null);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
            handleClose();
        }
    };



    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setAbTestVariants((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over.id as string);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleAddToAbTest = (url: string) => {
        if (abTestVariants.includes(url)) {
            setAbTestVariants(prev => prev.filter(v => v !== url));
        } else if (abTestVariants.length < 3) {
            setAbTestVariants(prev => [...prev, url]);
        } else {
            setToastMessage('A/B test limit reached (max 3)');
            setToastType('error');
            setShowToast(true);
        }
    };

    const handleDeletePackagingVersion = (versionNumber: number) => {
        setDeleteConfirmation({
            isOpen: true,
            versionNumber
        });
    };

    const confirmDeleteVersion = async () => {
        if (deleteConfirmation.versionNumber !== null) {
            const versionToDelete = deleteConfirmation.versionNumber;
            const newHistory = packagingHistory.filter(v => v.versionNumber !== versionToDelete);

            if (newHistory.length === 0) {
                // Case 1: No other versions. Data becomes draft.
                setPackagingHistory([]);
                // Reset version counter to 1 so next save is v.1
                setCurrentPackagingVersion(1);
                setIsDraft(true);
                setActiveVersionTab('current');

                await handleSave(false, true, {
                    overridePackagingHistory: [],
                    overridePackagingVersion: 1
                });
                setToastMessage(`Version ${versionToDelete} deleted. Content saved as Draft.`);
            } else {
                // Case 2: Other versions exist.
                setPackagingHistory(newHistory);

                // Recalculate next version number
                const maxVersion = Math.max(...newHistory.map(v => v.versionNumber));
                const newCurrentVersion = maxVersion + 1;
                setCurrentPackagingVersion(newCurrentVersion);

                // Check if we need to switch tabs
                if (activeVersionTab === versionToDelete.toString()) {
                    // If we deleted the active version, switch to the new latest
                    setActiveVersionTab(maxVersion.toString());

                    // Also load the data of the new active version?
                    // If we switch tabs, the form updates automatically based on activeVersionTab in render.
                    // BUT, the form state (title, description etc) is controlled.
                    // We need to update the form state to match the new active version.
                    const newActiveVersion = newHistory.find(v => v.versionNumber === maxVersion);
                    if (newActiveVersion) {
                        const snapshot = newActiveVersion.configurationSnapshot;
                        setTitle(snapshot.title);
                        setDescription(snapshot.description);
                        setTags(snapshot.tags);
                        setCoverImage(snapshot.coverImage || '');
                        if (snapshot.abTestVariants) setAbTestVariants(snapshot.abTestVariants);
                    }
                }

                await handleSave(false, undefined, {
                    overridePackagingHistory: newHistory,
                    overridePackagingVersion: newCurrentVersion
                });
                setToastMessage(`Version ${versionToDelete} deleted`);
            }

            setToastType('error');
            setToastPosition('top');
            setShowToast(true);
        }
        setDeleteConfirmation({ isOpen: false, versionNumber: null });
    };

    const restorePackagingVersion = (versionNumber: string) => {
        const version = packagingHistory.find(v => v.versionNumber.toString() === versionNumber);
        if (!version) return;

        // Use custom confirmation modal or native confirm for now
        if (confirm(`Are you sure you want to restore version ${versionNumber}? Current changes will be overwritten.`)) {
            const snapshot = version.configurationSnapshot;
            setTitle(snapshot.title);
            setDescription(snapshot.description);
            setTags(snapshot.tags);
            setCoverImage(snapshot.coverImage || '');
            // Restore A/B tests if present in snapshot (need to check type definition, assuming it might be there or default to empty)
            if (snapshot.abTestVariants) {
                setAbTestVariants(snapshot.abTestVariants);
            }

            setActiveVersionTab('current');
            setToastMessage(`Restored version ${versionNumber}`);
            setToastType('success');
            setShowToast(true);
        }
    };

    return createPortal(
        <>
            {/* Metrics Input Modal */}
            {showMetricsModal && (
                <MetricsModal
                    isOpen={showMetricsModal}
                    onClose={() => setShowMetricsModal(false)}
                    onConfirm={confirmSaveVersion}
                    checkinTargetVersion={checkinTargetVersion}
                    currentPackagingVersion={currentPackagingVersion}
                />
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={deleteConfirmation.isOpen}
                onClose={() => setDeleteConfirmation({ isOpen: false, versionNumber: null })}
                onConfirm={confirmDeleteVersion}
                title="Delete Version"
                message={`Are you sure you want to delete version ${deleteConfirmation.versionNumber}? This action cannot be undone.`}
                confirmLabel="Delete"
                cancelLabel="Cancel"
            />

            <ConfirmationModal
                isOpen={deleteCheckinConfirmation.isOpen}
                onClose={() => setDeleteCheckinConfirmation({ isOpen: false, versionNumber: null, checkinId: null })}
                onConfirm={confirmDeleteCheckin}
                title="Delete Check-in"
                message="Are you sure you want to delete this check-in? This action cannot be undone."
                confirmLabel="Delete"
                cancelLabel="Cancel"
            />

            <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-modal-overlay backdrop-blur-sm animate-fade-in" onMouseDown={handleBackdropClick}>
                <div
                    ref={modalRef}
                    className="bg-bg-secondary w-full max-w-[960px] h-[740px] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
                    onMouseDown={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    onKeyDown={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-4 border-b border-border bg-bg-secondary">
                        <h2 className="text-xl font-semibold text-text-primary m-0">
                            {initialData ? 'Edit Video' : 'Create Video'}
                        </h2>
                        <div className="flex items-center gap-3">
                            {activeTab === 'details' ? (
                                <SaveMenu
                                    isSaving={isSaving}
                                    isPackagingDirty={isPackagingDirty}
                                    isDraft={isDraft}
                                    hasCoverImage={!!coverImage}
                                    currentPackagingVersion={currentPackagingVersion}
                                    onSaveDraft={() => handleSave(true, true)}
                                    onSaveVersion={handleSaveAsVersion}
                                />
                            ) : (
                                <button
                                    onClick={() => handleSave(true)}
                                    disabled={(!isPackagingDirty && !isMetadataDirty && !isCtrRulesDirty) || isSaving}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${(isPackagingDirty || isMetadataDirty || isCtrRulesDirty) && !isSaving
                                        ? 'bg-white text-black hover:bg-gray-200 cursor-pointer shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                                        : 'bg-[#424242] text-[#717171] cursor-default'
                                        }`}
                                >
                                    {isSaving ? (
                                        <Loader2 size={16} className="animate-spin text-white" />
                                    ) : (
                                        "Save"
                                    )}
                                </button>
                            )}

                            <button
                                onClick={handleClose}
                                className="p-2 rounded-full hover:bg-hover-bg text-text-primary transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-2 px-6 pt-4 border-b border-white/5 flex-shrink-0">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={`px-4 pb-3 text-sm font-medium transition-all relative ${activeTab === 'details' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            Packaging
                            {activeTab === 'details' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-text-primary rounded-t-full" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('packaging')}
                            className={`px-4 pb-3 text-sm font-medium transition-all relative ${activeTab === 'packaging' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            Performance Tracking
                            {activeTab === 'packaging' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-text-primary rounded-t-full" />}
                        </button>
                        {initialData?.id && (
                            <button
                                onClick={() => setActiveTab('traffic')}
                                className={`px-4 pb-3 text-sm font-medium transition-all relative ${activeTab === 'traffic' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
                            >
                                Suggested Traffic
                                {activeTab === 'traffic' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-text-primary rounded-t-full" />}
                            </button>
                        )}
                    </div>

                    {/* Version Sub-tabs (Only visible in Details tab) */}
                    {activeTab === 'details' && (
                        <div className="bg-bg-secondary pl-6 pr-6 flex-shrink-0 border-b border-white/5">
                            <SubTabs
                                activeTabId={activeVersionTab}
                                onTabChange={setActiveVersionTab}
                                tabs={[
                                    ...(isDraft ? [{ id: 'current', label: 'Current Draft' }] : []),
                                    ...packagingHistory.map(v => ({
                                        id: v.versionNumber.toString(),
                                        label: `v.${v.versionNumber}`,
                                        onDelete: () => handleDeletePackagingVersion(v.versionNumber)
                                    }))
                                ]}
                            />
                        </div>
                    )}

                    {/* Content */}
                    <div
                        className={`flex-1 custom-scrollbar ${activeTab === 'traffic' ? 'overflow-hidden' : 'overflow-y-auto'}`}
                        style={{ scrollbarGutter: 'stable' }}
                    >
                        <div key={activeTab} className="h-full animate-fade-in">
                            {activeTab === 'details' && (
                                <div className="grid grid-cols-[1fr_352px] gap-8 items-start p-6">
                                    {/* Left Column: Inputs */}
                                    <div className="flex flex-col gap-6">
                                        {/* Banner for Past Versions (Read Only) */}
                                        {activeVersionTab !== 'current' &&
                                            !(packagingHistory.length > 0 && activeVersionTab === Math.max(...packagingHistory.map(v => v.versionNumber)).toString() && !isDraft) && (
                                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                                                            v.{activeVersionTab}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium text-blue-400">Viewing Past Version</span>
                                                            <span className="text-xs text-text-secondary">This version is read-only. Restore it to make changes.</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => restorePackagingVersion(activeVersionTab)}
                                                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer border-none"
                                                    >
                                                        Restore Version
                                                    </button>
                                                </div>
                                            )}

                                        <VideoForm
                                            title={
                                                (activeVersionTab === 'current' || (packagingHistory.length > 0 && activeVersionTab === Math.max(...packagingHistory.map(v => v.versionNumber)).toString() && !isDraft))
                                                    ? title
                                                    : (packagingHistory.find(v => v.versionNumber.toString() === activeVersionTab)?.configurationSnapshot.title || '')
                                            }
                                            setTitle={setTitle}
                                            description={
                                                (activeVersionTab === 'current' || (packagingHistory.length > 0 && activeVersionTab === Math.max(...packagingHistory.map(v => v.versionNumber)).toString() && !isDraft))
                                                    ? description
                                                    : (packagingHistory.find(v => v.versionNumber.toString() === activeVersionTab)?.configurationSnapshot.description || '')
                                            }
                                            setDescription={setDescription}
                                            tags={
                                                (activeVersionTab === 'current' || (packagingHistory.length > 0 && activeVersionTab === Math.max(...packagingHistory.map(v => v.versionNumber)).toString() && !isDraft))
                                                    ? tags
                                                    : (packagingHistory.find(v => v.versionNumber.toString() === activeVersionTab)?.configurationSnapshot.tags || [])
                                            }
                                            setTags={setTags}
                                            activeLanguage={activeLanguage}
                                            localizations={localizations}
                                            onSwitchLanguage={switchLanguage}
                                            onAddLanguage={async (code, customName, customFlag) => {
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
                                                            // Optional: Show toast
                                                        }
                                                    }
                                                }
                                            }}
                                            onRemoveLanguage={removeLanguage}
                                            savedCustomLanguages={currentChannel?.customLanguages}
                                            onDeleteCustomLanguage={async (code) => {
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
                                            }}
                                            isPublished={isPublished}
                                            setIsPublished={setIsPublished}
                                            publishedUrl={publishedUrl}
                                            setPublishedUrl={setPublishedUrl}
                                            isStatsExpanded={isStatsExpanded}
                                            setIsStatsExpanded={setIsStatsExpanded}
                                            viewCount={viewCount}
                                            setViewCount={setViewCount}
                                            duration={duration}
                                            setDuration={setDuration}
                                            videoRender={videoRender}
                                            setVideoRender={setVideoRender}
                                            audioRender={audioRender}
                                            setAudioRender={setAudioRender}
                                            onShowToast={(msg, type) => {
                                                setToastMessage(msg);
                                                setToastType(type);
                                                setShowToast(true);
                                            }}
                                            readOnly={
                                                activeVersionTab !== 'current' &&
                                                !(packagingHistory.length > 0 && activeVersionTab === Math.max(...packagingHistory.map(v => v.versionNumber)).toString() && !isDraft)
                                            }
                                        />
                                    </div>

                                    {/* Right Column: Packaging Preview */}
                                    <div className="w-[352px] mt-[4px]">
                                        <div className="bg-modal-surface rounded-xl shadow-lg overflow-hidden">
                                            <ImageUploader
                                                coverImage={
                                                    (activeVersionTab === 'current' || (packagingHistory.length > 0 && activeVersionTab === Math.max(...packagingHistory.map(v => v.versionNumber)).toString() && !isDraft))
                                                        ? coverImage
                                                        : (packagingHistory.find(v => v.versionNumber.toString() === activeVersionTab)?.configurationSnapshot.coverImage || '')
                                                }
                                                onUpload={handleImageUpload}
                                                onDrop={handleDrop}
                                                fileInputRef={fileInputRef}
                                                onTriggerUpload={() => fileInputRef.current?.click()}
                                                currentVersion={currentVersion}
                                                currentOriginalName={currentOriginalName}
                                                onDelete={handleDeleteCurrentVersion}
                                                abTestVariants={abTestVariants}
                                                onAddToAbTest={handleAddToAbTest}
                                                readOnly={
                                                    activeVersionTab !== 'current' &&
                                                    !(packagingHistory.length > 0 && activeVersionTab === Math.max(...packagingHistory.map(v => v.versionNumber)).toString() && !isDraft)
                                                }
                                            />
                                        </div>

                                        {/* A/B Test Variants */}
                                        {abTestVariants.length > 0 && (
                                            <div className="bg-modal-surface p-3 rounded-lg mt-2">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-xs font-medium text-text-primary uppercase tracking-wider">A/B Test Variants</h3>
                                                    <span className="text-[10px] text-text-secondary">{abTestVariants.length}/3</span>
                                                </div>
                                                <DndContext
                                                    sensors={sensors}
                                                    collisionDetection={closestCenter}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    <SortableContext
                                                        items={abTestVariants}
                                                        strategy={horizontalListSortingStrategy}
                                                    >
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {abTestVariants.map((variantUrl, index) => (
                                                                <SortableVariant
                                                                    key={variantUrl}
                                                                    id={variantUrl}
                                                                    url={variantUrl}
                                                                    index={index}
                                                                    onRemove={() => setAbTestVariants(prev => prev.filter((_, i) => i !== index))}
                                                                />
                                                            ))}
                                                        </div>
                                                    </SortableContext>
                                                </DndContext>
                                            </div>
                                        )}

                                        {/* Version History */}
                                        {coverHistory.length > 0 && (
                                            <div className="bg-modal-surface p-3 rounded-lg mt-2">
                                                <VersionHistory
                                                    history={coverHistory}
                                                    isLoading={false}
                                                    onRestore={(versionToRestore) => {
                                                        // 1. Capture current state as a history item
                                                        if (coverImage) {
                                                            const currentAsHistory: CoverVersion = {
                                                                url: coverImage,
                                                                version: currentVersion,
                                                                timestamp: Date.now(),
                                                                originalName: currentOriginalName
                                                            };

                                                            // 2. Remove restored version from history AND add current version to history
                                                            setCoverHistory(prev => {
                                                                const filtered = prev.filter(h => h.timestamp !== versionToRestore.timestamp);
                                                                return [currentAsHistory, ...filtered];
                                                            });
                                                        } else {
                                                            // If no current image (rare), just remove from history
                                                            setCoverHistory(prev => prev.filter(h => h.timestamp !== versionToRestore.timestamp));
                                                        }

                                                        // 3. Set restored version as current
                                                        setCoverImage(versionToRestore.url);
                                                        setCurrentVersion(versionToRestore.version);
                                                        setCurrentOriginalName(versionToRestore.originalName || '');
                                                    }}
                                                    onDelete={handleDeleteHistoryItem}
                                                    onClone={handleCloneWithSave}
                                                    initialData={initialData}
                                                    cloningVersion={cloningVersion}
                                                    currentVersion={currentVersion}
                                                    abTestVariants={abTestVariants}
                                                    onAddToAbTest={handleAddToAbTest}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'packaging' && (
                                <div className="animate-fade-in px-6 pt-6">
                                    <div className="rounded-xl overflow-hidden">
                                        <div className="rounded-xl overflow-hidden">
                                            <PackagingTable
                                                history={packagingHistory}
                                                onUpdateHistory={setPackagingHistory}
                                                onAddCheckin={(versionNumber) => {
                                                    setCheckinTargetVersion(versionNumber);
                                                    setShowMetricsModal(true);
                                                }}
                                                ctrRules={ctrRules}
                                                onUpdateCtrRules={setCtrRules}
                                                onDeleteVersion={handleDeletePackagingVersion}
                                                isPublished={isPublished}
                                                checkinRules={packagingSettings.checkinRules}
                                                onDeleteCheckin={handleDeleteCheckin}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'traffic' && initialData?.id && (
                                <div className="animate-fade-in h-full">
                                    <SuggestedTrafficTab
                                        customVideoId={initialData.id}
                                        packagingCtrRules={ctrRules}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <Toast
                message={toastMessage}
                isVisible={showToast}
                duration={4000}
                onClose={() => setShowToast(false)}
                type={toastType}
                position={toastPosition}
            />
        </>,
        document.body
    );
};
