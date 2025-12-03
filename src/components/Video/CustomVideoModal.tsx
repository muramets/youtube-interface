import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ChevronDown, ChevronUp, Info, Trash2, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type VideoDetails, type CoverVersion, type HistoryItem, type PackagingMetrics, type PackagingVersion } from '../../utils/youtubeApi';
import { useVideosStore } from '../../stores/videosStore';
import { useChannelStore } from '../../stores/channelStore';
import { useAuthStore } from '../../stores/authStore';
import { Toast } from '../Shared/Toast';
import { useVideoForm } from '../../hooks/useVideoForm';
import { TagsInput } from '../TagsInput';
import { resizeImage } from '../../utils/imageUtils';
import { PortalTooltip } from '../Shared/PortalTooltip';
import { ClonedVideoTooltipContent } from './ClonedVideoTooltipContent';
import { VersionHistory } from './Modal/VersionHistory';
import { LanguageTabs } from './LanguageTabs';
import { PackagingTable } from './Packaging';

interface CustomVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (videoData: Omit<VideoDetails, 'id'>, shouldClose?: boolean) => Promise<string | void>;
    onClone?: (originalVideo: VideoDetails, version: CoverVersion) => Promise<void>;
    initialData?: VideoDetails;
}

interface SortableVariantProps {
    id: string;
    url: string;
    index: number;
    onRemove: () => void;
}

const SortableVariant = ({ id, url, index, onRemove }: SortableVariantProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="aspect-video rounded-md overflow-hidden border border-border relative group touch-none"
        >
            <img src={url} alt={`Variant ${index + 1}`} className="w-full h-full object-cover" />

            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="absolute top-1 left-1 p-1 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing hover:bg-black/60 transition-opacity"
            >
                <GripVertical size={12} />
            </div>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
            >
                <X size={10} />
            </button>
            <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/60 rounded text-[9px] font-medium text-white backdrop-blur-sm">
                {String.fromCharCode(65 + index)}
            </div>
        </div>
    );
};

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
    const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
    const saveMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (saveMenuRef.current && !saveMenuRef.current.contains(event.target as Node)) {
                setIsSaveMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside, true); // Use capture phase to handle clicks even if propagation is stopped
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
        };
    }, []);



    // Metrics Modal State
    const [showMetricsModal, setShowMetricsModal] = useState(false);
    const [metricsData, setMetricsData] = useState<PackagingMetrics>({
        impressions: 0,
        ctr: 0,
        views: 0,
        avdSeconds: 0,
        avdPercentage: 0
    });
    const [avdInput, setAvdInput] = useState(''); // Text input for AVD (e.g. "1:30")

    const handleAvdChange = (value: string) => {
        setAvdInput(value);
        // Parse time string to seconds (e.g. "1:30" -> 90)
        if (value.includes(':')) {
            const parts = value.split(':').map(Number);
            if (parts.length === 2) {
                setMetricsData(prev => ({ ...prev, avdSeconds: parts[0] * 60 + parts[1] }));
            } else if (parts.length === 3) {
                setMetricsData(prev => ({ ...prev, avdSeconds: parts[0] * 3600 + parts[1] * 60 + parts[2] }));
            }
        } else {
            setMetricsData(prev => ({ ...prev, avdSeconds: Number(value) || 0 }));
        }
    };

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

    const confirmSaveVersion = async () => {
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
    const [isTooltipOpen, setIsTooltipOpen] = useState(false);

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
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-bg-secondary w-full max-w-md rounded-xl shadow-2xl p-6 flex flex-col gap-4 animate-scale-in border border-border">
                        <div className="p-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-medium text-white mb-2">
                                    {checkinTargetVersion !== null ? `Add Check-in to v.${checkinTargetVersion}` : `Finalize v.${currentPackagingVersion} & Upgrade`}
                                </h3>
                                <button onClick={() => setShowMetricsModal(false)} className="text-text-secondary hover:text-text-primary">
                                    <X size={20} />
                                </button>
                            </div>
                            <p className="text-sm text-[#AAAAAA] mb-6">
                                To track the performance impact of your new packaging, please enter the metrics for the previous version at the time of the change.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs text-[#AAAAAA]">Views</label>
                                <input
                                    type="number"
                                    value={metricsData.views}
                                    onChange={(e) => setMetricsData(prev => ({ ...prev, views: Number(e.target.value) }))}
                                    className="w-full bg-[#1F1F1F] border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-[#AAAAAA]">CTR (%)</label>
                                <input
                                    type="number"
                                    value={metricsData.ctr}
                                    onChange={(e) => setMetricsData(prev => ({ ...prev, ctr: Number(e.target.value) }))}
                                    className="w-full bg-[#1F1F1F] border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0.0"
                                    step="0.1"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-[#AAAAAA]">AVD (Time)</label>
                                <input
                                    type="text"
                                    value={avdInput}
                                    onChange={(e) => handleAvdChange(e.target.value)}
                                    className="modal-input"
                                    placeholder="e.g. 1:30"
                                />
                                <span className="text-xs text-text-secondary">Parsed: {metricsData.avdSeconds}s</span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => setShowMetricsModal(false)}
                                className="px-4 py-2 rounded-lg text-text-primary hover:bg-bg-tertiary transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmSaveVersion}
                                className="px-4 py-2 rounded-lg bg-brand-primary text-white font-medium hover:bg-brand-secondary transition-colors"
                            >
                                {checkinTargetVersion !== null ? 'Add Check-in' : 'Save & Upgrade Version'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onMouseDown={handleBackdropClick}>
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
                                <div className="flex items-center gap-2 relative" ref={saveMenuRef}>
                                    <div className="flex items-center gap-0.5">
                                        <button
                                            onClick={() => handleSave(false)}
                                            disabled={!isPackagingDirty || isSaving}
                                            className={`px-3 h-8 text-sm font-medium transition-all flex items-center gap-2 rounded-l-full ${!isPackagingDirty || isSaving
                                                ? 'bg-[#424242] text-[#717171] cursor-default'
                                                : 'bg-white text-black hover:bg-gray-200 cursor-pointer'
                                                }`}
                                        >
                                            {isSaving ? 'Saving...' : (!isPackagingDirty ? 'Saved as Draft' : 'Save as Draft')}
                                        </button>

                                        <div className="relative">
                                            <button
                                                onClick={() => setIsSaveMenuOpen(!isSaveMenuOpen)}
                                                disabled={!coverImage || isSaving || (!isPackagingDirty && !isDraft)}
                                                className={`px-2 h-8 transition-all flex items-center justify-center rounded-r-full ${!coverImage || isSaving || (!isPackagingDirty && !isDraft)
                                                    ? 'bg-[#424242] text-[#717171] cursor-default'
                                                    : 'bg-white text-black hover:bg-gray-200 cursor-pointer'
                                                    }`}
                                            >
                                                <ChevronDown size={16} className={`transition-transform ${isSaveMenuOpen ? 'rotate-180' : ''}`} />
                                            </button>

                                            {/* Dropdown Menu */}
                                            {isSaveMenuOpen && !isSaving && (
                                                <div className="absolute top-full right-0 mt-0.5 w-max bg-[#1F1F1F]/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/5 overflow-hidden z-50 animate-scale-in origin-top-right">
                                                    <button
                                                        onClick={() => {
                                                            handleSaveAsVersion();
                                                            setIsSaveMenuOpen(false);
                                                        }}
                                                        className="w-full px-4 py-2.5 text-left text-xs font-medium text-text-primary hover:bg-white/5 transition-colors flex items-center justify-between group whitespace-nowrap"
                                                    >
                                                        <span>Save as v.{currentPackagingVersion}</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
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
                                className="p-2 rounded-full hover:bg-white/10 text-text-primary transition-colors"
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
                                    <div className="flex flex-col gap-5">

                                        <LanguageTabs
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
                                        />

                                        {/* Title */}
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Title</label>
                                            <input
                                                type="text"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-modal-placeholder"
                                                placeholder="Add a title that describes your video"
                                            />
                                        </div>

                                        {/* Description */}
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Description</label>
                                            <textarea
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                className="w-full h-32 bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none resize-none transition-colors hover:border-text-primary placeholder-modal-placeholder"
                                                placeholder="Tell viewers about your video"
                                            />
                                        </div>

                                        {/* Tags */}
                                        <TagsInput
                                            tags={tags}
                                            onChange={setTags}
                                            onShowToast={(message, type) => {
                                                setToastMessage(message);
                                                setToastType(type);
                                                setShowToast(true);
                                            }}
                                        />

                                        {/* Published Status - Only for default language */}
                                        {activeLanguage === 'default' && (
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        onClick={() => setIsPublished(!isPublished)}
                                                        className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors ${isPublished ? 'bg-text-primary border-text-primary' : 'border-text-secondary hover:border-text-primary'}`}
                                                    >
                                                        {isPublished && <Check size={14} className="text-bg-primary" />}
                                                    </div>
                                                    <span className="text-sm text-text-primary font-medium cursor-pointer" onClick={() => setIsPublished(!isPublished)}>Video Published</span>
                                                </div>

                                                {isPublished && (
                                                    <div className="animate-scale-in origin-top">
                                                        <input
                                                            type="text"
                                                            value={publishedUrl}
                                                            onChange={(e) => setPublishedUrl(e.target.value)}
                                                            className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-modal-placeholder"
                                                            placeholder="https://www.youtube.com/watch?v=..."
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Stats Section - Only for default language */}
                                        {activeLanguage === 'default' && (
                                            <div className="border-t border-border pt-4">
                                                <button
                                                    onClick={() => setIsStatsExpanded(!isStatsExpanded)}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-modal-button-bg text-white text-sm font-medium hover:bg-modal-button-hover transition-colors mb-4"
                                                >
                                                    {isStatsExpanded ? 'Show less' : 'Show more'}
                                                    {isStatsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </button>

                                                {isStatsExpanded && (
                                                    <div className="grid grid-cols-2 gap-4 animate-fade-in pb-2">
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Video Render #</label>
                                                            <input
                                                                type="text"
                                                                value={videoRender}
                                                                onChange={(e) => setVideoRender(e.target.value)}
                                                                className="modal-input"
                                                                placeholder="e.g. #1.1"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Audio #</label>
                                                            <input
                                                                type="text"
                                                                value={audioRender}
                                                                onChange={(e) => setAudioRender(e.target.value)}
                                                                className="modal-input"
                                                                placeholder="e.g. #1"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">View Count</label>
                                                            <input
                                                                type="text"
                                                                value={viewCount}
                                                                onChange={(e) => setViewCount(e.target.value)}
                                                                className="modal-input"
                                                                placeholder="e.g. 1.2M"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Duration</label>
                                                            <input
                                                                type="text"
                                                                value={duration}
                                                                onChange={(e) => setDuration(e.target.value)}
                                                                className="modal-input"
                                                                placeholder="e.g. 10:05"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Column: Packaging Preview */}
                                    <div className="w-[352px] mt-[4px]">
                                        <div className="bg-modal-surface rounded-xl shadow-lg overflow-hidden">
                                            {/* Current Cover */}
                                            <div
                                                className="relative h-[198px] bg-black group cursor-pointer"
                                                onClick={() => document.getElementById('cover-upload')?.click()}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={handleDrop}
                                            >
                                                {coverImage ? (
                                                    <img src={coverImage} alt="Current Cover" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-text-secondary gap-2">
                                                        <span className="text-sm">Click or drag to upload</span>
                                                    </div>
                                                )}

                                                {/* Hover Overlay */}
                                                <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 flex items-center justify-center ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                    <span className="text-white font-medium">Change Cover</span>
                                                </div>

                                                {/* Info Icon (Top Left) */}
                                                <div className={`absolute top-2 left-2 transition-opacity duration-200 ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                    <PortalTooltip
                                                        content={<ClonedVideoTooltipContent version={currentVersion} filename={currentOriginalName} />}
                                                        align="left"
                                                        onOpenChange={setIsTooltipOpen}
                                                    >
                                                        <div className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm">
                                                            <Info size={14} />
                                                        </div>
                                                    </PortalTooltip>
                                                </div>

                                                {/* Delete Button (Top Right) */}
                                                {coverImage && (
                                                    <div className={`absolute top-2 right-2 transition-opacity duration-200 ${isTooltipOpen ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
                                                        <button
                                                            onClick={handleDeleteCurrentVersion}
                                                            className="w-8 h-8 rounded-full bg-black/60 text-white hover:bg-red-500 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                )}



                                                <input
                                                    id="cover-upload"
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => e.target.files && handleImageUpload(e.target.files[0])}
                                                />
                                            </div>
                                            {/* Version History */}
                                            <div className="bg-modal-surface p-4 rounded-lg">
                                                <VersionHistory
                                                    history={coverHistory}
                                                    isLoading={isLoadingHistory}
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
                            {/* Packaging Tab Content */}
                            {activeTab === 'packaging' && (
                                <div className="animate-fade-in px-6 pt-6">
                                    <div className="rounded-xl overflow-hidden">
                                        <div className="rounded-xl overflow-hidden">
                                            <PackagingTable
                                                history={packagingHistory}
                                                onUpdateHistory={setPackagingHistory}
                                                onAddCheckin={(versionNumber) => {
                                                    // Open metrics modal for adding a check-in to an existing version
                                                    // We need to know which version we are adding to
                                                    // We can reuse the existing metrics modal state, but we need a way to distinguish
                                                    // between "saving as new version" and "adding check-in".
                                                    // Let's add a state for 'checkinTargetVersion'
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
            </div >
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
