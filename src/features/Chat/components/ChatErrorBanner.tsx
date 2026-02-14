import React from 'react';
import { RotateCcw, X } from 'lucide-react';

interface ChatErrorBannerProps {
    error: string | null;
    canRetry: boolean;
    onRetry: () => void;
    onDismiss: () => void;
}

export const ChatErrorBanner: React.FC<ChatErrorBannerProps> = ({
    error,
    canRetry,
    onRetry,
    onDismiss,
}) => {
    if (!error) return null;

    const errorBtnClass = "bg-transparent border-none text-[color:var(--danger-color,#cc0000)] cursor-pointer p-0.5 flex";

    return (
        <div className="px-3 py-2 mx-2.5 mb-1.5 rounded-md bg-[rgba(204,0,0,0.08)] border border-[rgba(204,0,0,0.15)] text-[color:var(--danger-color,#cc0000)] text-xs flex items-center gap-2">
            <span>{error}</span>
            <div className="flex items-center gap-1 ml-auto shrink-0">
                {canRetry && (
                    <button className={errorBtnClass} onClick={onRetry} title="Retry">
                        <RotateCcw size={14} />
                    </button>
                )}
                <button className={errorBtnClass} onClick={onDismiss}><X size={14} /></button>
            </div>
        </div>
    );
};
