// =============================================================================
// ConfirmLargePayloadBanner — confirmation UI for large thumbnail batches
//
// Rendered when the server emits a confirmLargePayload SSE event (≥15 thumbnails
// requested). User must explicitly confirm before images are loaded into context.
// =============================================================================

import React from 'react';
import { Images } from 'lucide-react';

interface ConfirmLargePayloadBannerProps {
    count: number;
    onConfirm: () => void;
    onDismiss: () => void;
}

export const ConfirmLargePayloadBanner: React.FC<ConfirmLargePayloadBannerProps> = ({
    count,
    onConfirm,
    onDismiss,
}) => {
    return (
        <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-amber-400/[0.06] border border-amber-400/[0.15] text-[12px]">
            <Images size={14} className="shrink-0 mt-0.5 text-amber-400" />
            <div className="flex flex-col gap-2 min-w-0 flex-1">
                <span className="text-text-secondary leading-snug">
                    Load <strong className="text-text-primary">{count} thumbnail{count !== 1 ? 's' : ''}</strong> into context?
                    This will use additional tokens.
                </span>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="px-2.5 py-1 rounded-md bg-amber-400/[0.12] text-amber-400 hover:bg-amber-400/[0.2] transition-colors duration-150 text-[11px] font-medium"
                    >
                        Load
                    </button>
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="px-2.5 py-1 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-white/[0.04] transition-colors duration-150 text-[11px]"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};
