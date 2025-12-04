import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { type VideoDetails, type CoverVersion, type PackagingMetrics, type PackagingVersion, type HistoryItem } from '../../utils/youtubeApi';
import { useVideosStore } from '../../stores/videosStore';
import { useChannelStore } from '../../stores/channelStore';
import { useAuthStore } from '../../stores/authStore';
import { Toast } from '../Shared/Toast';
import { useVideoForm } from '../../hooks/useVideoForm';
import { resizeImage } from '../../utils/imageUtils';
import { VersionHistory } from './Modal/VersionHistory';
import { ImageUploader } from './Modal/ImageUploader';
import { VideoForm } from './Modal/VideoForm';
import { PackagingTable } from './Packaging';
import { SortableVariant } from './Modal/SortableVariant';
import { MetricsModal } from './Modal/MetricsModal';
import { SaveMenu } from './Modal/SaveMenu';

interface CustomVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (videoData: Omit<VideoDetails, 'id'>, shouldClose?: boolean) => Promise<string | void>;
    onClone?: (originalVideo: VideoDetails, version: CoverVersion) => Promise<void>;
    initialData?: VideoDetails;
}

export const CustomVideoModal: React.FC<CustomVideoModalProps> = ({
    isOpen,
    onClose,
    onSave,
    onClone,
    initialData
}) => {
    const { saveVideoHistory, deleteVideoHistoryItem } = useVideosStore();
    const { currentChannel, updateChannel } = useChannelStore();
    const { user } = useAuthStore();
    const modalRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [activeTab, setActiveTab] = useState<'details' | 'packaging'>('details');
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

    const handleSaveAsVersion = () => {
        // If this is the first version (no history), just save and finalize without metrics
        if (packagingHistory.length === 0) {
            setIsDraft(false);
            handleSave(true, false); // Explicitly set isDraft to false
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
        // IMPORTANT: Snapshot should be of the PREVIOUS version (initialData), not the current new draft
        // But wait, if we are saving as a NEW version, we are snapshotting the CURRENT state as the start of this new version?
        // No, typically "Save as Version 2" means "Finalize Version 1 and start Version 2".
        // So the snapshot should be of the state being finalized.
        // Let's assume the current form state is what we want to snapshot as the "configuration" for this version.

        const newHistoryItem: PackagingVersion = {
            versionNumber: currentPackagingVersion,
            startDate: Date.now(),
            checkins: [{
                id: crypto.randomUUID(),
                date: Date.now(),
                metrics: metricsData
            }],
            configurationSnapshot: {
                title: title,
                description: description,
                tags: tags,
                coverImage: coverImage || '',
                abTestVariants: abTestVariants,
                localizations: localizations
            }
        };

        setPackagingHistory(prev => [...prev, newHistoryItem]);
        setCurrentPackagingVersion(prev => prev + 1);
        setShowMetricsModal(false);
        setIsDraft(false); // Version finalized, no longer a draft

        // Proceed with normal save, explicitly setting isDraft to false
        await handleSave(true, false);
    };


    // Toast State
    const [toastMessage, setToastMessage] = useState('');
    const [showToast, setShowToast] = useState(false);
    const [toastType, setToastType] = useState<'success' | 'error'>('success');

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
        setPackagingHistory
    } = useVideoForm(initialData, isOpen);

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

        try {
            const resizedImage = await resizeImage(file, 800, 0.8);
            const fileKey = `${file.name.replace(/\./g, '_')} -${file.size} `;
            let newVersion: number;

            if (fileVersionMap[fileKey]) {
                const existingVersion = fileVersionMap[fileKey];
                const isCurrent = currentVersion === existingVersion;
                const isInHistory = coverHistory.some(h => h.version === existingVersion);

                if (isCurrent || isInHistory) {
                    setToastMessage('This cover image already exists!');
                    setToastType('error');
                    setShowToast(true);
                    return;
                }
                newVersion = existingVersion;
            } else {
                newVersion = highestVersion + 1;
                setFileVersionMap(prev => ({ ...prev, [fileKey]: newVersion }));
                setHighestVersion(newVersion);
            }

            if (coverImage) {
                const historyVersion: CoverVersion = {
                    url: coverImage,
                    version: currentVersion,
                    timestamp: Date.now(),
                    originalName: currentOriginalName
                };
                setCoverHistory(prev => [historyVersion, ...prev]);
            }

            setCoverImage(resizedImage);
            setCurrentOriginalName(file.name);
            setCurrentVersion(newVersion);
        } catch (error) {
            console.error('Error resizing image:', error);
            setToastMessage('Failed to process image');
            setToastType('error');
            setShowToast(true);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleImageUpload(e.dataTransfer.files[0]);
        }
    };

    const handleRestoreVersion = (versionToRestore: CoverVersion) => {
        if (coverImage) {
            const historyVersion: CoverVersion = {
                url: coverImage,
                version: currentVersion,
                timestamp: Date.now(),
                originalName: currentOriginalName
            };
            setCoverHistory(prev => [historyVersion, ...prev.filter(v => v.timestamp !== versionToRestore.timestamp)]);
            setDeletedHistoryIds(prev => new Set(prev).add(versionToRestore.timestamp));
        }

        setCoverImage(versionToRestore.url);
        setCurrentOriginalName(versionToRestore.originalName || 'Restored Version');
        setCurrentVersion(versionToRestore.version);
    };

    const handleDeleteVersion = (e: React.MouseEvent, timestamp: number) => {
        e.stopPropagation();
        setCoverHistory(prev => prev.filter(v => v.timestamp !== timestamp));
        setDeletedHistoryIds(prev => new Set(prev).add(timestamp));
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

    const handleSave = async (shouldClose = true, overrideIsDraft?: boolean) => {
        if (!coverImage) {
            alert("Please upload a cover image");
            return;
        }

        setIsSaving(true);

        const finalData = getFullPayload();

        const videoData: Omit<VideoDetails, 'id'> = {
            ...finalData,
            thumbnail: coverImage,
            channelId: currentChannel?.id || '',
            channelTitle: currentChannel?.name || 'My Channel',
            channelAvatar: currentChannel?.avatar || '',
            publishedAt: initialData ? initialData.publishedAt : new Date().toISOString(),
            // Metadata is already in finalData, but we need to ensure structure matches
            viewCount: finalData.viewCount || '1M',
            duration: finalData.duration || '1:02:11',
            isCustom: true,
            customImage: coverImage,
            createdAt: initialData?.createdAt,
            coverHistory: coverHistory,
            customImageName: currentOriginalName || undefined,
            customImageVersion: currentVersion,
            highestVersion: highestVersion,
            fileVersionMap: fileVersionMap,
            historyCount: coverHistory.length,
            publishedVideoId: finalData.publishedVideoId,
            videoRender: finalData.videoRender,
            audioRender: finalData.audioRender,
            isDraft: overrideIsDraft !== undefined ? overrideIsDraft : (shouldClose ? isDraft : true) // Use override if provided, otherwise auto-save preserves state, Manual save sets to Draft
        };

        try {
            const newId = await onSave(videoData, shouldClose);
            const targetId = initialData?.id || (typeof newId === 'string' ? newId : undefined);

            if (targetId && user && currentChannel) {
                const deletePromises = Array.from(deletedHistoryIds).map(timestamp =>
                    deleteVideoHistoryItem(user.uid, currentChannel.id, targetId, timestamp.toString())
                );
                await Promise.all(deletePromises);

                const savePromises = coverHistory.map(item => saveVideoHistory(user.uid, currentChannel.id, targetId, item as unknown as HistoryItem));
                await Promise.all(savePromises);
            }

            if (shouldClose) {
                onClose();
            } else {
                // If manual save (not close), mark as draft
                setIsDraft(true);
            }
        } catch (error) {
            console.error("Failed to save video:", error);
            setToastMessage("Failed to save video.");
            setToastType('error');
            setShowToast(true);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = async () => {
        // Auto-save Metadata ONLY
        if (isMetadataDirty) {
            const metadataPayload = getMetadataOnlyPayload();
            // We need to construct the full object but with original packaging data
            const videoData: Omit<VideoDetails, 'id'> = {
                ...metadataPayload,
                thumbnail: initialData?.thumbnail || '',
                channelId: currentChannel?.id || '',
                channelTitle: currentChannel?.name || 'My Channel',
                channelAvatar: currentChannel?.avatar || '',
                publishedAt: initialData ? initialData.publishedAt : new Date().toISOString(),
                isCustom: true,
                customImage: initialData?.customImage, // Revert to initial
                createdAt: initialData?.createdAt,
                coverHistory: coverHistory, // History shouldn't change if we revert
                customImageName: initialData?.customImageName,
                customImageVersion: initialData?.customImageVersion || 1,
                highestVersion: initialData?.highestVersion || 0,
                fileVersionMap: initialData?.fileVersionMap || {},
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
                                    onSaveDraft={() => handleSave(false)}
                                    onSaveVersion={handleSaveAsVersion}
                                />
                            ) : (
                                <button
                                    onClick={() => handleSave(true)}
                                    disabled={true} // TODO: Enable when adding check-in
                                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-all bg-[#424242] text-[#717171] cursor-default"
                                >
                                    Save
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
                    <div className="px-6 pt-4 border-b border-border/50 flex gap-6">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'details' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            Details
                            {activeTab === 'details' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-text-primary rounded-t-full" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('packaging')}
                            className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'packaging' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            Packaging
                            {activeTab === 'packaging' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-text-primary rounded-t-full" />}
                        </button>
                    </div>

                    {/* Content */}
                    <div
                        className="flex-1 overflow-y-auto custom-scrollbar"
                        style={{ scrollbarGutter: 'stable' }}
                    >
                        <div key={activeTab} className="h-full animate-fade-in">
                            {activeTab === 'details' && (
                                <div className="grid grid-cols-[1fr_352px] gap-8 items-start p-6">
                                    {/* Left Column: Inputs */}
                                    <VideoForm
                                        title={title}
                                        setTitle={setTitle}
                                        description={description}
                                        setDescription={setDescription}
                                        tags={tags}
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
                                                    await updateChannel(user.uid, currentChannel.id, {
                                                        customLanguages: [...existingLanguages, newLang]
                                                    });
                                                }
                                            }
                                        }}
                                        onRemoveLanguage={removeLanguage}
                                        savedCustomLanguages={currentChannel?.customLanguages}
                                        onDeleteCustomLanguage={async (code) => {
                                            if (currentChannel && user) {
                                                const existingLanguages = currentChannel.customLanguages || [];
                                                const updatedLanguages = existingLanguages.filter(l => l.code !== code);
                                                await updateChannel(user.uid, currentChannel.id, {
                                                    customLanguages: updatedLanguages
                                                });
                                            }
                                        }}
                                        isPublished={isPublished}
                                        setIsPublished={setIsPublished}
                                        publishedUrl={publishedUrl}
                                        setPublishedUrl={setPublishedUrl}
                                        isStatsExpanded={isStatsExpanded}
                                        setIsStatsExpanded={setIsStatsExpanded}
                                        videoRender={videoRender}
                                        setVideoRender={setVideoRender}
                                        audioRender={audioRender}
                                        setAudioRender={setAudioRender}
                                        viewCount={viewCount}
                                        setViewCount={setViewCount}
                                        duration={duration}
                                        setDuration={setDuration}
                                        onShowToast={(message, type) => {
                                            setToastMessage(message);
                                            setToastType(type);
                                            setShowToast(true);
                                        }}
                                    />

                                    {/* Right Column: Packaging Preview */}
                                    <div className="w-[352px] mt-[4px]">
                                        <div className="bg-modal-surface rounded-xl shadow-lg overflow-hidden">
                                            <ImageUploader
                                                coverImage={coverImage}
                                                onUpload={handleImageUpload}
                                                onDrop={handleDrop}
                                                fileInputRef={fileInputRef}
                                                onTriggerUpload={() => fileInputRef.current?.click()}
                                                currentVersion={currentVersion}
                                                currentOriginalName={currentOriginalName}
                                                onDelete={handleDeleteCurrentVersion}
                                            />

                                            {/* Version History */}
                                            <div className="bg-modal-surface p-4 rounded-lg">
                                                <VersionHistory
                                                    history={coverHistory}
                                                    isLoading={false}
                                                    onRestore={handleRestoreVersion}
                                                    onDelete={handleDeleteVersion}
                                                    onClone={onClone ? handleCloneWithSave : undefined}
                                                    initialData={initialData}
                                                    cloningVersion={cloningVersion}
                                                    currentVersion={currentVersion}
                                                    abTestVariants={abTestVariants}
                                                    onAddToAbTest={(url) => {
                                                        if (abTestVariants.includes(url)) {
                                                            setAbTestVariants(prev => prev.filter(v => v !== url));
                                                        } else if (abTestVariants.length < 3) {
                                                            setAbTestVariants(prev => [...prev, url]);
                                                        } else {
                                                            setToastMessage('A/B test limit reached (max 3)');
                                                            setToastType('error');
                                                            setShowToast(true);
                                                        }
                                                    }}
                                                />
                                            </div>
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
                                            />
                                        </div>
                                    </div>
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
                position="bottom"
            />
        </>,
        document.body
    );
};
