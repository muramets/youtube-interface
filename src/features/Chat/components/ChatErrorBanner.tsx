import React, { useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';

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
    const textRef = useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    React.useEffect(() => {
        const el = textRef.current;
        if (!el) return;

        const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
        check();

        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [error]);

    if (!error) return null;

    return (
        <div className="mx-3 mt-1.5 mb-1.5 px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/15 text-red-400 text-xs flex items-center gap-2 min-w-0 overflow-hidden">
            <PortalTooltip
                content={error}
                variant="glass"
                side="top"
                enterDelay={300}
                disabled={!isTruncated}
                triggerClassName="flex-1 min-w-0"
            >
                <span
                    ref={textRef}
                    className="truncate block min-w-0"
                >
                    {error}
                </span>
            </PortalTooltip>
            <div className="flex items-center gap-1 ml-auto shrink-0">
                {canRetry && (
                    <button
                        className="bg-transparent border-none text-red-400 cursor-pointer p-0.5 flex hover:text-red-300 transition-colors"
                        onClick={onRetry}
                        title="Retry"
                    >
                        <RotateCcw size={14} />
                    </button>
                )}
                <button
                    className="bg-transparent border-none text-red-400 cursor-pointer p-0.5 flex hover:text-red-300 transition-colors"
                    onClick={onDismiss}
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
