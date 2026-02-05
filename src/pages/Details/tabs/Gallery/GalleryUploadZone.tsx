/**
 * GalleryUploadZone
 * 
 * Drop zone for uploading images to the gallery.
 * Styled to match TrafficUploader for UI consistency.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Loader2, Image } from 'lucide-react';

interface GalleryUploadZoneProps {
    onUpload: (files: File[]) => Promise<void>;
    isLoading?: boolean;
    title?: string;
    description?: React.ReactNode;
}

export const GalleryUploadZone: React.FC<GalleryUploadZoneProps> = ({
    onUpload,
    isLoading = false,
    title = "Upload Cover Variations",
    description
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isBusy = isLoading || isProcessing;

    const processFiles = useCallback(async (files: File[]) => {
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        setIsProcessing(true);
        try {
            await onUpload(imageFiles);
        } finally {
            setIsProcessing(false);
        }
    }, [onUpload]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (isBusy) return;
        e.preventDefault();
        setIsDragging(true);
    }, [isBusy]);

    const handleDragLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        if (isBusy) return;
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        await processFiles(files);
    }, [isBusy, processFiles]);

    const handleClick = useCallback(() => {
        if (!isBusy) {
            fileInputRef.current?.click();
        }
    }, [isBusy]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        processFiles(files);
        // Reset value so same file can be selected again
        e.target.value = '';
    }, [processFiles]);

    return (
        <div
            className={`
                relative h-[200px] flex flex-col items-center justify-center text-center transition-all duration-300
                border rounded-xl
                ${isBusy
                    ? 'border-transparent bg-bg-secondary/50 cursor-wait'
                    : `cursor-pointer border-dashed ${isDragging ? 'border-accent-blue bg-accent-blue/5' : 'border-white/10 hover:border-white bg-transparent'}`
                }
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleFileChange}
            />

            <div className="flex flex-col items-center gap-3">
                {isBusy ? (
                    <>
                        <div className="w-12 h-12 rounded-full bg-accent-blue/10 flex items-center justify-center text-accent-blue mb-1">
                            <Loader2 className="animate-spin" size={24} />
                        </div>
                        <div className="space-y-1 animate-pulse">
                            <h3 className="text-sm font-medium text-text-primary">
                                Uploading Images...
                            </h3>
                            <p className="text-xs text-text-secondary">
                                This may take a few seconds
                            </p>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-text-secondary transition-colors group-hover:bg-white/10">
                            <Image size={24} />
                        </div>

                        <div className="space-y-1">
                            <h3 className="text-sm font-medium text-text-primary">
                                {title}
                            </h3>
                            <p className="text-xs text-text-secondary">
                                {description || (
                                    <>
                                        Drag and drop your images here, or{' '}
                                        <span className="text-accent-blue hover:underline font-medium">
                                            browse
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
