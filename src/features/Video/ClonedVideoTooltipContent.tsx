import React, { useState } from 'react';
import { Copy, Check, Heart, Trash2, AlertCircle, ThumbsDown } from 'lucide-react';

interface ClonedVideoTooltipContentProps {
    version: number;
    filename: string;
    rating?: number; // 1 = Like, -1 = Dislike, 0 = None
    onRate?: (rating: 1 | 0 | -1) => void;
    onRemove?: () => void;
}

export const ClonedVideoTooltipContent: React.FC<ClonedVideoTooltipContentProps> = ({
    version,
    filename,
    rating = 0,
    onRate,
    onRemove
}) => {
    const [copied, setCopied] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(filename);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRate = (e: React.MouseEvent, value: 1 | -1) => {
        e.stopPropagation();
        // Toggle: if clicking same value, set to 0 (remove rating)
        const newRating = rating === value ? 0 : value;
        onRate?.(newRating);
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirmRemove) {
            setConfirmRemove(true);
            setTimeout(() => setConfirmRemove(false), 3000);
            return;
        }
        onRemove?.();
        setConfirmRemove(false);
    };

    return (
        <div className="flex flex-col gap-1.5">
            {/* Header Row: Version + Action Buttons */}
            <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-white">
                    v.{version}
                </div>
                <div className="flex items-center gap-0.5">
                    {onRate && (
                        <>
                            {/* Dislike Button */}
                            <button
                                onClick={(e) => handleRate(e, -1)}
                                className="p-1 rounded hover:bg-white/10 text-white transition-colors border-none cursor-pointer flex-shrink-0"
                                title={rating === -1 ? "Remove Dislike" : "Dislike"}
                            >
                                <ThumbsDown
                                    size={12}
                                    className={rating === -1 ? "fill-red-500 text-red-500" : ""}
                                />
                            </button>
                            {/* Like Button */}
                            <button
                                onClick={(e) => handleRate(e, 1)}
                                className="p-1 rounded hover:bg-white/10 text-white transition-colors border-none cursor-pointer flex-shrink-0"
                                title={rating === 1 ? "Unlike" : "Like"}
                            >
                                <Heart
                                    size={12}
                                    className={rating === 1 ? "fill-red-500 text-red-500" : ""}
                                />
                            </button>
                        </>
                    )}
                    <button
                        onClick={handleCopy}
                        className="p-1 rounded hover:bg-white/10 text-white transition-colors border-none cursor-pointer flex-shrink-0"
                        title="Copy filename"
                    >
                        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                    {onRemove && (
                        <button
                            onClick={handleRemove}
                            className={`p-1 rounded flex items-center justify-center transition-all border-none cursor-pointer flex-shrink-0 ${confirmRemove
                                ? 'bg-red-600 scale-110 shadow-lg shadow-red-500/20'
                                : 'hover:bg-white/10'
                                } text-white`}
                            title={confirmRemove ? "Click again to confirm" : "Remove"}
                        >
                            {confirmRemove ? <AlertCircle size={12} /> : <Trash2 size={12} />}
                        </button>
                    )}
                </div>
            </div>
            {/* Filename */}
            <div className="text-sm text-gray-300">
                <span className="break-words">
                    {filename}
                </span>
            </div>
        </div>
    );
};