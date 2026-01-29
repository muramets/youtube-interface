import React from 'react';
import { X, Plus } from 'lucide-react';

interface ThumbnailSlotProps {
    src: string;
    index: number;
    borderClassName: string;
    onUpload: () => void;
    onRemove: () => void;
}

/**
 * Thumbnail display/upload slot with remove button on hover.
 * Shows either the uploaded image or an empty placeholder to trigger upload.
 */
export const ThumbnailSlot: React.FC<ThumbnailSlotProps> = ({
    src,
    index,
    borderClassName,
    onUpload,
    onRemove
}) => {
    if (src) {
        return (
            <div
                className={`relative rounded-xl border border-dashed group cursor-pointer ${borderClassName}`}
                style={{ padding: '4px' }}
                onClick={onUpload}
            >
                <img
                    src={src}
                    alt={`Thumbnail ${index + 1}`}
                    className="rounded-lg object-cover"
                    style={{ width: '257px', height: '140px' }}
                />
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white 
                        flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <X size={14} />
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={onUpload}
            className={`rounded-xl border border-dashed 
                hover:border-[#AAAAAA] transition-colors flex flex-col items-center justify-center gap-2
                bg-modal-input-bg group ${borderClassName}`}
            style={{ width: '265px', height: '148px' }}
        >
            <Plus size={32} className="text-[#5F5F5F] group-hover:text-[#AAAAAA] transition-colors" />
            <span className="text-base text-[#5F5F5F] group-hover:text-[#AAAAAA] transition-colors text-center px-2">
                Add thumbnail
            </span>
        </button>
    );
};
