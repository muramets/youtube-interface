import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { type VideoDetails, type CoverVersion, type HistoryItem, extractVideoId } from '../../utils/youtubeApi';
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
    const { currentChannel } = useChannelStore();
    const { user } = useAuthStore();
    const modalRef = useRef<HTMLDivElement>(null);

    const [activeTab, setActiveTab] = useState<'details' | 'packaging'>('details');
    const [isStatsExpanded, setIsStatsExpanded] = useState(false);
    const [cloningVersion, setCloningVersion] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
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
        isDirty,
        isPublished, setIsPublished,
        publishedUrl, setPublishedUrl,
        isValid
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

    const handleSave = async (shouldClose = true) => {
        if (!coverImage) {
            alert("Please upload a cover image");
            return;
        }

        setIsSaving(true);

        const videoData: Omit<VideoDetails, 'id'> = {
            title: title || 'Very good playlist for you',
            description: description,
            tags: tags,
            thumbnail: coverImage,
            channelId: currentChannel?.id || '',
            channelTitle: currentChannel?.name || 'My Channel',
            channelAvatar: currentChannel?.avatar || '',
            publishedAt: initialData ? initialData.publishedAt : new Date().toISOString(),
            viewCount: viewCount || '1M',
            duration: duration || '1:02:11',
            isCustom: true,
            customImage: coverImage,
            createdAt: initialData?.createdAt,
            coverHistory: coverHistory,
            customImageName: currentOriginalName,
            customImageVersion: currentVersion,
            highestVersion: highestVersion,
            fileVersionMap: fileVersionMap,
            historyCount: coverHistory.length,
            publishedVideoId: isPublished ? (extractVideoId(publishedUrl) || undefined) : ''
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
            onClose();
        }
    };

    return createPortal(
        <>
            <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={handleBackdropClick}>
                <div
                    ref={modalRef}
                    className="bg-bg-secondary w-full max-w-[960px] h-[718px] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
                    onMouseDown={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-4 border-b border-border bg-bg-secondary">
                        <h2 className="text-xl font-semibold text-text-primary m-0">
                            {initialData ? 'Edit Video' : 'Create Video'}
                        </h2>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => handleSave()}
                                disabled={isSaving || !isDirty || !isValid}
                                className={`px-4 py-2 rounded-lg font-medium transition-all
                                    ${(isSaving || !isDirty || !isValid)
                                        ? 'bg-bg-primary text-text-secondary cursor-default opacity-50'
                                        : 'bg-text-primary text-bg-primary hover:opacity-90'
                                    }`}
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                onClick={onClose}
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
                        className="flex-1 overflow-y-auto custom-scrollbar p-6"
                        style={{ scrollbarGutter: 'stable' }}
                    >
                        <div key={activeTab} className="h-full animate-fade-in">
                            {activeTab === 'details' ? (
                                <div className="grid grid-cols-[1fr_352px] gap-8 items-start">
                                    {/* Left Column: Inputs */}
                                    <div className="flex flex-col gap-5">
                                        {/* Title */}
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Title</label>
                                            <input
                                                type="text"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-[#717171]"
                                                placeholder="Add a title that describes your video"
                                            />
                                        </div>

                                        {/* Description */}
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Description</label>
                                            <textarea
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                className="w-full h-32 bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none resize-none transition-colors hover:border-text-primary placeholder-[#717171]"
                                                placeholder="Tell viewers about your video"
                                            />
                                        </div>

                                        {/* Tags */}
                                        <TagsInput tags={tags} onChange={setTags} />

                                        {/* Published Status */}
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
                                                        className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-[#717171]"
                                                        placeholder="https://www.youtube.com/watch?v=..."
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Stats Section */}
                                        <div className="border-t border-border pt-4">
                                            <button
                                                onClick={() => setIsStatsExpanded(!isStatsExpanded)}
                                                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#3F3F3F] text-white text-sm font-medium hover:bg-[#4F4F4F] transition-colors mb-4"
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
                                                            className="bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-[#717171]"
                                                            placeholder="e.g. #1.1"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Audio #</label>
                                                        <input
                                                            type="text"
                                                            value={audioRender}
                                                            onChange={(e) => setAudioRender(e.target.value)}
                                                            className="bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-[#717171]"
                                                            placeholder="e.g. #1"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">View Count</label>
                                                        <input
                                                            type="text"
                                                            value={viewCount}
                                                            onChange={(e) => setViewCount(e.target.value)}
                                                            className="bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-[#717171]"
                                                            placeholder="e.g. 1.2M"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Duration</label>
                                                        <input
                                                            type="text"
                                                            value={duration}
                                                            onChange={(e) => setDuration(e.target.value)}
                                                            className="bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-[#717171]"
                                                            placeholder="e.g. 10:05"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Column: Packaging Preview */}
                                    <div className="w-[352px] mt-[4px]">
                                        <div className="bg-[#1F1F1F] rounded-xl shadow-lg overflow-hidden">
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

                                                {/* Badges */}
                                                <div className={`absolute top-2 left-2 bg-yellow-400 text-black text-xs font-bold px-2 py-1 rounded transition-opacity duration-200 ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                    Current Version
                                                </div>

                                                <div className={`absolute top-2 right-2 transition-opacity duration-200 ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                    <PortalTooltip
                                                        content={<ClonedVideoTooltipContent version={currentVersion} filename={currentOriginalName} />}
                                                        align="right"
                                                        onOpenChange={setIsTooltipOpen}
                                                    >
                                                        <div className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm">
                                                            <Info size={14} />
                                                        </div>
                                                    </PortalTooltip>
                                                </div>

                                                <input
                                                    id="cover-upload"
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => e.target.files && handleImageUpload(e.target.files[0])}
                                                />
                                            </div>

                                            {/* Version History */}
                                            {/* Version History */}
                                            <div className="bg-[#1F1F1F] p-4 rounded-lg">
                                                <VersionHistory
                                                    history={coverHistory}
                                                    isLoading={isLoadingHistory}
                                                    onRestore={handleRestoreVersion}
                                                    onDelete={handleDeleteVersion}
                                                    onClone={onClone ? handleCloneWithSave : undefined}
                                                    initialData={initialData}
                                                    cloningVersion={cloningVersion}
                                                    currentVersion={currentVersion}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-4">
                                    <div className="w-16 h-16 rounded-full bg-bg-primary flex items-center justify-center">
                                        <Info size={32} />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-lg font-medium text-text-primary mb-1">Packaging Tools</h3>
                                        <p>Advanced packaging features coming soon.</p>
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
