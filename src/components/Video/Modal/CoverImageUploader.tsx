import React, { useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { resizeImage } from '../../../utils/imageUtils';

interface CoverImageUploaderProps {
    currentVersion: number;
    coverImage: string | null;
    onImageUpload: (file: File, resizedImage: string) => void;
}

export const CoverImageUploader: React.FC<CoverImageUploaderProps> = ({
    currentVersion,
    coverImage,
    onImageUpload
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFile = async (file: File) => {
        if (file && file.type.startsWith('image/')) {
            try {
                const resizedImage = await resizeImage(file, 800, 0.8);
                onImageUpload(file, resizedImage);
            } catch (error) {
                console.error('Error resizing image:', error);
                alert('Failed to process image.');
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    return (
        <div className="flex flex-col gap-2">
            <label className="text-sm text-text-secondary font-medium">
                Cover Image (v.{currentVersion})
            </label>
            <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`w-full aspect-video rounded-lg bg-bg-primary border-2 border-dashed flex items-center justify-center cursor-pointer relative overflow-hidden transition-colors ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-text-secondary'
                    }`}
            >
                {coverImage ? (
                    <img src={coverImage} alt="Cover Preview" className="w-full h-full object-cover" />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-text-secondary">
                        <ImageIcon size={40} />
                        <span className="text-sm">Click or drag to upload cover</span>
                    </div>
                )}
            </div>
            <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                accept="image/*"
                className="hidden"
            />
        </div>
    );
};
