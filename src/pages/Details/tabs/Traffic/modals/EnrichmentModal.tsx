import React from 'react';
import { createPortal } from 'react-dom';
import { CloudDownload, X, Info } from 'lucide-react';
import { Button } from '../../../../../components/ui/atoms/Button/Button';

interface EnrichmentModalProps {
    isOpen: boolean;
    missingCount: number;
    unenrichedCount: number;
    estimatedQuota: number;
    onConfirm: () => void;
    onClose: () => void;
    isEnriching: boolean;
}

export const EnrichmentModal: React.FC<EnrichmentModalProps> = ({
    isOpen,
    missingCount,
    unenrichedCount,
    estimatedQuota,
    onConfirm,
    onClose,
    isEnriching,
}) => {
    // Freeze values on open to prevent UI jumping during enrichment
    const [frozen, setFrozen] = React.useState({ missingCount, unenrichedCount, estimatedQuota });

    React.useEffect(() => {
        if (isOpen) {
            setFrozen({ missingCount, unenrichedCount, estimatedQuota });
        }
        // Intentionally only update on open
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const totalCount = frozen.missingCount + frozen.unenrichedCount;

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[500px] max-w-[90vw] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <h2 className="text-xl font-bold text-text-primary m-0">
                        Enrich Video Data
                    </h2>
                    {!isEnriching && (
                        <button
                            onClick={onClose}
                            className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                        >
                            <X size={24} />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col gap-5">
                    <p className="text-sm text-text-secondary leading-relaxed px-1">
                        <span className="font-semibold text-text-primary">{totalCount} videos</span> are missing
                        {frozen.missingCount > 0 && frozen.unenrichedCount > 0
                            ? ' titles and channel info'
                            : frozen.missingCount > 0
                                ? ' titles'
                                : ' channel info'
                        }.
                        {' '}This data is required for:
                    </p>

                    {/* Benefits list */}
                    <div className="flex flex-col gap-2 px-1">
                        <div className="flex items-start gap-2.5">
                            <span className="text-accent mt-0.5 text-xs font-bold shrink-0">&#9679;</span>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                <span className="text-text-primary font-medium">Smart Assistant</span> — auto-classify traffic types, viewer types, and niche suggestions
                            </p>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <span className="text-accent mt-0.5 text-xs font-bold shrink-0">&#9679;</span>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                <span className="text-text-primary font-medium">AI Analysis</span> — content analysis, shared tags, channel grouping, and self-channel detection
                            </p>
                        </div>
                    </div>

                    {/* Quota info */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-yellow-500/10 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
                            <Info size={16} className="text-yellow-500" />
                        </div>
                        <div className="flex-1">
                            <p className="text-[10px] text-yellow-600/80 dark:text-yellow-500/80 uppercase tracking-widest font-bold mb-0.5">
                                ESTIMATED USAGE OF YT API QUOTA
                            </p>
                            <p className="text-sm text-text-primary font-medium">
                                {frozen.estimatedQuota} <span className="text-text-secondary font-normal">of 10,000 daily units</span>
                            </p>
                        </div>
                    </div>

                    {/* Consequence */}
                    <p className="text-sm text-text-secondary leading-relaxed px-1">
                        Without enrichment, these features will have limited or no results.
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-border bg-bg-secondary/30">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        disabled={isEnriching}
                        className="text-text-secondary hover:text-text-primary"
                    >
                        Skip
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onConfirm}
                        isLoading={isEnriching}
                        leftIcon={<CloudDownload size={16} />}
                    >
                        {isEnriching ? 'Enriching...' : 'Enrich'}
                    </Button>
                </div>
            </div>
        </div>,
        document.body,
    );
};
