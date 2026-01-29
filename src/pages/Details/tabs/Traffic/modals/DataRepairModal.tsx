import React from 'react';
import { createPortal } from 'react-dom';
import { CloudDownload, X, Info } from 'lucide-react';
import { Button } from '../../../../../components/ui/atoms/Button/Button';

interface DataRepairModalProps {
    isOpen: boolean;
    missingCount: number;
    estimatedQuota: number;
    onConfirm: () => void;
    onClose: () => void;
    isRestoring: boolean;
    variant?: 'sync' | 'assistant';
}

export const DataRepairModal: React.FC<DataRepairModalProps> = ({
    isOpen,
    missingCount,
    estimatedQuota,
    onConfirm,
    onClose,
    isRestoring,
    variant = 'sync'
}) => {
    // Frozen values to prevent UI jumping while syncing
    const [frozenMissingCount, setFrozenMissingCount] = React.useState<number>(missingCount);
    const [frozenEstimatedQuota, setFrozenEstimatedQuota] = React.useState<number>(estimatedQuota);

    // Update frozen values ONLY when the modal is opened
    React.useEffect(() => {
        if (isOpen) {
            setFrozenMissingCount(missingCount);
            setFrozenEstimatedQuota(estimatedQuota);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]); // We purposefully omit missingCount/estimatedQuota to only update on open

    if (!isOpen) return null;

    const isAssistant = variant === 'assistant';

    return createPortal(
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[500px] max-w-[90vw] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <h2 className="text-xl font-bold text-text-primary m-0">
                        {isAssistant ? 'Smart Assistant Needs Data' : 'Update missing data'}
                    </h2>
                    {!isRestoring && (
                        <button
                            onClick={onClose}
                            className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                        >
                            <X size={24} />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col gap-6">
                    <div className="px-1">
                        <p className="text-sm text-text-secondary leading-relaxed">
                            {isAssistant ? (
                                <>
                                    Smart Assistant works best with rich data (channel's info for each video). <span className="font-semibold text-text-primary">{frozenMissingCount} videos</span> are missing these and other details.
                                    <br /><br />
                                    Sync with YouTube to enable intelligent niche prediction.
                                </>
                            ) : (
                                <>
                                    This snapshot contains <span className="font-semibold text-text-primary">{frozenMissingCount} videos</span> without titles.
                                    Syncing with YouTube will enable full insights and detailed tooltips.
                                </>
                            )}
                        </p>
                    </div>

                    {/* Usage Info - Yellow Box */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-yellow-500/10 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
                            <Info size={16} className="text-yellow-500" />
                        </div>
                        <div className="flex-1">
                            <p className="text-[10px] text-yellow-600/80 dark:text-yellow-500/80 uppercase tracking-widest font-bold mb-0.5">ESTIMATED USAGE OF YT API QUOTA</p>
                            <p className="text-sm text-text-primary font-medium">
                                {frozenEstimatedQuota} <span className="text-text-secondary font-normal">of 10,000 daily units</span>
                            </p>
                        </div>
                    </div>

                    {/* Consequence text */}
                    <div className="px-1">
                        <p className="text-sm text-text-secondary leading-relaxed">
                            {isAssistant
                                ? "If you skip sync, Smart Assistant won't be able to make niche suggestions for these videos."
                                : "If you skip sync, these videos will have empty titles in the table."
                            }
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-border bg-bg-secondary/30">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        disabled={isRestoring}
                        className="text-text-secondary hover:text-text-primary"
                    >
                        Skip
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onConfirm}
                        isLoading={isRestoring}
                        leftIcon={<CloudDownload size={16} />}
                    >
                        {isRestoring ? 'Updating...' : 'Sync'}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
};
