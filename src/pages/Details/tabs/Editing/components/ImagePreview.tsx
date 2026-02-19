import React, { useCallback, useRef } from 'react';
import { ImagePlus, X, PanelRightOpen } from 'lucide-react';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';
import { useEditingStore } from '../../../../../core/stores/editing/editingStore';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import { EditingService } from '../../../../../core/services/editingService';
import { resizeImageToBlob } from '../../../../../core/utils/imageUtils';

/** Max image dimension (px) — matches 4K UHD (3840×2160). */
const MAX_IMAGE_DIMENSION = 3840;
/** JPEG quality for resized images — maximum quality to preserve detail. PNG is always lossless. */
const IMAGE_QUALITY = 1.0;

interface ImagePreviewProps {
    defaultImageUrl: string;
    videoId: string;
    isBrowserOpen: boolean;
    onToggleBrowser: () => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ defaultImageUrl, videoId, isBrowserOpen, onToggleBrowser }) => {
    const imageUrl = useEditingStore((s) => s.imageUrl);
    const imageWidth = useEditingStore((s) => s.imageWidth);
    const imageHeight = useEditingStore((s) => s.imageHeight);
    const imageStoragePath = useEditingStore((s) => s.imageStoragePath);

    const setImage = useEditingStore((s) => s.setImage);
    const setImageStoragePath = useEditingStore((s) => s.setImageStoragePath);
    const clearImage = useEditingStore((s) => s.clearImage);

    const { user } = useAuth();
    const currentChannel = useChannelStore((s) => s.currentChannel);

    const inputRef = useRef<HTMLInputElement>(null);
    const displayUrl = imageUrl || defaultImageUrl;

    // When the displayed image loads, sync its natural dimensions into the store
    const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        const store = useEditingStore.getState();
        if (store.imageWidth !== naturalWidth || store.imageHeight !== naturalHeight) {
            useEditingStore.setState({ imageWidth: naturalWidth, imageHeight: naturalHeight });
        }
    }, []);

    const handleFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) return;
        const userId = user?.uid;
        const channelId = currentChannel?.id;
        if (!userId || !channelId || !videoId) return;

        // Show optimistic preview immediately via blob URL
        const blobUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = async () => {
            setImage(blobUrl, img.naturalWidth, img.naturalHeight);

            const needsResize = Math.max(img.naturalWidth, img.naturalHeight) > MAX_IMAGE_DIMENSION;

            if (!needsResize) {
                // Image fits within bounds — upload original (zero quality loss)
                EditingService.uploadImage(userId, channelId, videoId, file)
                    .then(({ storagePath, downloadUrl }) => {
                        setImage(downloadUrl, img.naturalWidth, img.naturalHeight);
                        setImageStoragePath(storagePath);
                        URL.revokeObjectURL(blobUrl);
                    })
                    .catch((err) => {
                        console.error('[ImagePreview] Upload failed:', err);
                    });
                return;
            }

            // Oversized image — resize to max render resolution (4K)
            try {
                const resized = await resizeImageToBlob(file, MAX_IMAGE_DIMENSION, IMAGE_QUALITY, file.type);
                const resizedFile = new File([resized], file.name, { type: file.type });

                // Re-read resized dimensions for accurate store state
                const resizedImg = new Image();
                const resizedUrl = URL.createObjectURL(resized);
                resizedImg.onload = () => {
                    const { naturalWidth: rw, naturalHeight: rh } = resizedImg;
                    URL.revokeObjectURL(resizedUrl);

                    EditingService.uploadImage(userId, channelId, videoId, resizedFile)
                        .then(({ storagePath, downloadUrl }) => {
                            setImage(downloadUrl, rw, rh);
                            setImageStoragePath(storagePath);
                            URL.revokeObjectURL(blobUrl);
                        })
                        .catch((err) => {
                            console.error('[ImagePreview] Upload failed:', err);
                        });
                };
                resizedImg.src = resizedUrl;
            } catch (err) {
                console.error('[ImagePreview] Resize failed, uploading original:', err);
                EditingService.uploadImage(userId, channelId, videoId, file)
                    .then(({ storagePath, downloadUrl }) => {
                        setImage(downloadUrl, img.naturalWidth, img.naturalHeight);
                        setImageStoragePath(storagePath);
                        URL.revokeObjectURL(blobUrl);
                    })
                    .catch((uploadErr) => {
                        console.error('[ImagePreview] Upload failed:', uploadErr);
                    });
            }
        };
        img.src = blobUrl;
    }, [user?.uid, currentChannel?.id, videoId, setImage, setImageStoragePath]);

    const handleClearImage = useCallback(() => {
        // Delete from Storage if we have a storage path
        if (imageStoragePath) {
            EditingService.deleteImage(imageStoragePath).catch((err) => {
                console.error('[ImagePreview] Delete failed:', err);
            });
        }
        clearImage();
    }, [imageStoragePath, clearImage]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between h-6">
                <h3 className="text-sm font-semibold text-text-primary">Image</h3>
                <div className="flex items-center gap-2">
                    {displayUrl && imageWidth && imageHeight && (
                        <span className="text-xs text-text-tertiary">
                            {imageWidth}×{imageHeight}
                        </span>
                    )}
                    {imageUrl && (
                        <PortalTooltip content="Remove custom image" side="bottom" align="center" enterDelay={500}>
                            <button
                                onClick={handleClearImage}
                                className="p-1 rounded hover:bg-hover text-text-tertiary hover:text-text-primary transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </PortalTooltip>
                    )}
                    {!isBrowserOpen && (
                        <PortalTooltip content={<span className="whitespace-nowrap">Open Track Browser</span>} side="bottom" align="right" enterDelay={500}>
                            <button
                                onClick={onToggleBrowser}
                                className="p-1 rounded hover:bg-hover text-text-tertiary hover:text-text-primary transition-colors"
                            >
                                <PanelRightOpen size={16} />
                            </button>
                        </PortalTooltip>
                    )}
                </div>
            </div>

            <div
                className="relative aspect-video rounded-xl overflow-hidden bg-bg-secondary border-2 border-dashed border-border hover:border-text-tertiary transition-colors cursor-pointer group"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                {displayUrl ? (
                    <img
                        src={displayUrl}
                        alt="Video image"
                        className="w-full h-full object-cover"
                        draggable={false}
                        onLoad={handleImgLoad}
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-tertiary">
                        <ImagePlus size={32} />
                        <span className="text-sm">Drop image or click to upload</span>
                    </div>
                )}

                {/* Hover overlay */}
                {displayUrl && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="flex items-center gap-2 text-white text-sm font-medium">
                            <ImagePlus size={18} />
                            <span>Change image</span>
                        </div>
                    </div>
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileInput}
                />
            </div>
        </div>
    );
};
