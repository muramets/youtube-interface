
import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { type VideoDetails, type CoverVersion, type HistoryItem } from '../../utils/youtubeApi';
import { useVideosStore } from '../../stores/videosStore';
import { useChannelStore } from '../../stores/channelStore';
import { useAuthStore } from '../../stores/authStore';
import { Toast } from '../Shared/Toast';
import { CoverImageUploader } from './Modal/CoverImageUploader';
import { VersionHistory } from './Modal/VersionHistory';
import { VideoForm } from './Modal/VideoForm';
import { useVideoForm } from '../../hooks/useVideoForm';

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

    const [isSaving, setIsSaving] = useState(false);
    const [cloningVersion, setCloningVersion] = useState<number | null>(null);

    // Toast State
    const [toastMessage, setToastMessage] = useState('');
    const [showToast, setShowToast] = useState(false);
    const [toastType, setToastType] = useState<'success' | 'error'>('success');

    const {
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
        isDirty
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

    const handleImageUpload = (file: File, resizedImage: string) => {
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
            historyCount: coverHistory.length
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
            alert("Failed to save video.");
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleBackdropClick}>
                <div
                    ref={modalRef}
                    className="bg-bg-secondary rounded-xl p-6 w-[500px] max-w-[90%] border border-border text-text-primary animate-scale-in-center shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                    onMouseDown={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="m-0 text-xl font-bold">{initialData ? 'Edit Video' : 'Create My Video'}</h2>
                        <button onClick={onClose} className="bg-transparent border-none text-text-primary cursor-pointer hover:text-text-secondary transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex flex-col gap-5">
                        <CoverImageUploader
                            currentVersion={currentVersion}
                            coverImage={coverImage}
                            onImageUpload={handleImageUpload}
                        />

                        {((isLoadingHistory && (initialData?.historyCount ?? 0) > 0) || coverHistory.length > 0) && (
                            <VersionHistory
                                history={coverHistory}
                                isLoading={isLoadingHistory}
                                onRestore={handleRestoreVersion}
                                onDelete={handleDeleteVersion}
                                onClone={onClone ? handleCloneWithSave : undefined}
                                initialData={initialData}
                                cloningVersion={cloningVersion}
                            />
                        )}

                        <VideoForm
                            title={title}
                            setTitle={setTitle}
                            viewCount={viewCount}
                            setViewCount={setViewCount}
                            duration={duration}
                            setDuration={setDuration}
                        />

                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-full border-none bg-transparent text-text-primary cursor-pointer font-medium hover:bg-hover-bg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleSave()}
                                disabled={isSaving || !isDirty}
                                className={`px-4 py-2 rounded-full border-none font-bold transition-all relative overflow-hidden
                                    ${(isSaving || !isDirty)
                                        ? 'bg-bg-primary text-text-secondary cursor-default opacity-50'
                                        : 'bg-text-primary text-bg-primary cursor-pointer hover:opacity-90'
                                    }
                                    ${isSaving ? 'cursor-wait' : ''}
                                `}
                            >
                                {isSaving && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent animate-shimmer bg-[length:200%_100%]"></div>
                                )}
                                <span className="relative z-10">Save</span>
                            </button>
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
