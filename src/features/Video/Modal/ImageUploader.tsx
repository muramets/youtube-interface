import React, { useState } from 'react';
import { Info, Trash2 } from 'lucide-react';
import { PortalTooltip } from '../../../components/Shared/PortalTooltip';
import { ClonedVideoTooltipContent } from '../ClonedVideoTooltipContent';

interface ImageUploaderProps {
    coverImage: string | null;
    onUpload: (file: File) => void;
    onDrop: (e: React.DragEvent) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onTriggerUpload: () => void;
    currentVersion: number;
    currentOriginalName?: string;
    onDelete: (e: React.MouseEvent) => void;
    readOnly?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
    coverImage,
    onUpload,
    onDrop,
    fileInputRef,
    onTriggerUpload,
    currentVersion,
    currentOriginalName,
    onDelete,
    readOnly = false
}) => {
    const [isTooltipOpen, setIsTooltipOpen] = useState(false);

    return (
        <div
            className={`relative h-[198px] bg-black group ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
            onClick={!readOnly ? onTriggerUpload : undefined}
            onDragOver={(e) => e.preventDefault()}
            onDrop={!readOnly ? onDrop : undefined}
        >
            {coverImage ? (
                <img src={coverImage} alt="Current Cover" className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-text-secondary gap-2">
                    <span className="text-sm">Click or drag to upload</span>
                </div>
            )}

            {/* Hover Overlay */}
            {!readOnly && (
                <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 flex items-center justify-center ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <span className="text-white font-medium">Change Cover</span>
                </div>
            )}

            {/* Info Icon (Top Left) */}
            <div className={`absolute top-2 left-2 transition-opacity duration-200 ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <PortalTooltip
                    content={<ClonedVideoTooltipContent version={currentVersion} filename={currentOriginalName || ''} />}
                    align="left"
                    onOpenChange={setIsTooltipOpen}
                >
                    <div className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
                        <Info size={16} />
                    </div>
                </PortalTooltip>
            </div>

            {/* Top Right Actions */}
            {coverImage && !readOnly && (
                <div className={`absolute top-2 right-2 flex gap-2 transition-opacity duration-200 ${isTooltipOpen ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>

                    <button
                        onClick={onDelete}
                        className="w-8 h-8 rounded-full bg-black/60 text-white hover:bg-red-500 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => e.target.files && e.target.files[0] && onUpload(e.target.files[0])}
            />
        </div>
    );
};
