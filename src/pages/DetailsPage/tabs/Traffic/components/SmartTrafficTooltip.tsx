import { Info, AlertTriangle } from 'lucide-react';
import { PortalTooltip } from '../../../../../components/Shared/PortalTooltip';

interface SmartTrafficTooltipProps {
    actualTotal: number;
    tableSum: number;
    trashValue?: number;
}

export const SmartTrafficTooltip: React.FC<SmartTrafficTooltipProps> = ({
    actualTotal,
    tableSum,
    trashValue = 0
}) => {
    const totalDifference = actualTotal - tableSum;
    const cleanLongTail = Math.max(0, totalDifference - trashValue);
    const isSignificant = cleanLongTail > actualTotal * 0.05;

    // BUSINESS LOGIC: Calculate "Clean Total" (Actual from report minus what we officially discarded as Trash)
    const cleanTotal = Math.max(0, actualTotal - trashValue);

    const content = (
        <div className="flex flex-col gap-2 p-1 max-w-[320px]">
            <div className="flex items-center gap-2 font-medium text-sm border-b pb-2 mb-1 border-white/10">
                {isSignificant ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : (
                    <Info className="w-4 h-4 text-blue-400" />
                )}
                <span>Traffic Discrepancy Explained</span>
            </div>

            <div className="space-y-1.5 text-[13px] leading-relaxed">
                <div className="flex justify-between text-white/60 gap-4">
                    <span>Actual Total (from report):</span>
                    <div className="text-right">
                        <span className="text-white font-mono">{cleanTotal.toLocaleString()}</span>
                        {trashValue > 0 && (
                            <span className="text-white/30 font-mono text-[11px] ml-1.5">
                                (+{trashValue.toLocaleString()} trashed)
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex justify-between text-white/60">
                    <span>Table Sum (visible rows):</span>
                    <span className="text-white font-mono">{tableSum.toLocaleString()}</span>
                </div>

                <div className="flex justify-between pt-1 border-t border-white/5 font-medium">
                    <span className="text-white/80"><strong>Long Tail</strong> Difference:</span>
                    <span className="text-amber-300 font-mono">+{cleanLongTail.toLocaleString()}</span>
                </div>
            </div>

            <div className="text-[11px] text-white/40 italic mt-2 leading-relaxed flex flex-col gap-2.5 [hyphens:none] [word-break:normal]">
                <p>
                    The list below displays your top performing sources. The difference in numbers represents the 'Long Tail' — aggregated data from minor sources and privacy-protected views that are hidden to keep your report clean.
                </p>
                <p>
                    A large discrepancy often signals that the algorithm is still in the <strong>exploration phase</strong> — testing your content across random topics because it hasn't locked onto a specific target audience yet.
                </p>
            </div>
        </div>
    );

    return (
        <PortalTooltip
            content={content}
            side="top"
            align="center"
        >
            <div className="cursor-help inline-flex items-center justify-center mr-1 opacity-60 hover:opacity-100 transition-opacity">
                {isSignificant ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                    <Info className="w-3.5 h-3.5 text-blue-400" />
                )}
            </div>
        </PortalTooltip>
    );
};
