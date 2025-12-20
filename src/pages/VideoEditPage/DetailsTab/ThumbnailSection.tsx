import React, { useRef } from 'react';
import { Upload, X } from 'lucide-react';

interface ThumbnailSectionProps {
    value: string;
    onChange: (value: string) => void;
}

export const ThumbnailSection: React.FC<ThumbnailSectionProps> = ({ value, onChange }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return;
        }

        // Convert to base64 for preview (in production, would upload to storage)
        const reader = new FileReader();
        reader.onloadend = () => {
            onChange(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleRemove = () => {
        onChange('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">
                Thumbnail
            </label>
            <p className="text-xs text-text-secondary">
                Select or upload a picture that shows what's in your video.
            </p>

            <div className="flex gap-4 mt-2">
                {/* Upload Button */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-40 aspect-video rounded-lg border-2 border-dashed border-border 
            hover:border-text-primary transition-colors flex flex-col items-center justify-center gap-2
            bg-bg-secondary"
                >
                    <Upload size={24} className="text-text-secondary" />
                    <span className="text-xs text-text-secondary">Upload</span>
                </button>

                {/* Current Thumbnail Preview */}
                {value && (
                    <div className="relative w-40 aspect-video rounded-lg overflow-hidden bg-bg-secondary group">
                        <img
                            src={value}
                            alt="Thumbnail preview"
                            className="w-full h-full object-cover"
                        />
                        <button
                            onClick={handleRemove}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white
                opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />
        </div>
    );
};
