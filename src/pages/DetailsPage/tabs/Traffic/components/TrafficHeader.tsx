import React, { useRef, useState } from 'react';
import { SegmentedControl } from '../../../../../components/ui/molecules/SegmentedControl';
import { FilterDropdown } from '../../../../../components/ui/molecules/FilterDropdown';
import { TrafficUploader } from './TrafficUploader';
import { Settings } from 'lucide-react';
import { TrafficCTRConfig } from './TrafficCTRConfig';
import type { TrafficSource } from '../../../../../core/types/traffic';

interface TrafficHeaderProps {
    headerTitle: string;
    isViewingOldVersion: boolean;
    viewingVersion?: number | 'draft';
    shouldShowActions: boolean;

    // View mode
    viewMode: 'cumulative' | 'delta';
    onViewModeChange: (mode: 'cumulative' | 'delta') => void;

    // Upload
    isLoading: boolean;
    hasExistingSnapshot: boolean;
    onUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<void>;

    // Scroll state
    isScrolled: boolean;
}

/**
 * Sticky header для Traffic Tab.
 * Содержит заголовок, фильтры и кнопки действий.
 */
export const TrafficHeader: React.FC<TrafficHeaderProps> = ({
    headerTitle,
    isViewingOldVersion,
    viewingVersion,
    shouldShowActions,
    viewMode,
    onViewModeChange,
    isLoading,
    hasExistingSnapshot,
    onUpload,
    isScrolled
}) => {
    const configBtnRef = useRef<HTMLButtonElement>(null);
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    return (
        <>
            <div className={`sticky top-0 z-10 px-6 py-4 transition-shadow duration-200 bg-video-edit-bg ${isScrolled ? 'shadow-[0_2px_8px_rgba(0,0,0,0.3)]' : ''}`}>
                <div className="flex items-center justify-between gap-4 max-w-[1050px]">
                    <div>
                        <h1 className="text-2xl font-medium text-text-primary">{headerTitle}</h1>
                        {isViewingOldVersion && (
                            <p className="text-sm text-text-secondary mt-1">
                                Viewing stats for Version {viewingVersion}
                            </p>
                        )}
                    </div>

                    {/* Actions - Show if data exists OR has existing snapshots (for delta empty state) */}
                    {shouldShowActions && (
                        <div className="flex gap-2">
                            {/* CTR Settings */}
                            <button
                                ref={configBtnRef}
                                onClick={() => setIsConfigOpen(!isConfigOpen)}
                                className={`w-[34px] h-[34px] rounded-full flex items-center justify-center transition-colors border-none cursor-pointer ${isConfigOpen ? 'bg-text-primary text-bg-primary' : 'bg-transparent text-text-primary hover:bg-hover-bg'}`}
                                title="CTR Color Rules"
                            >
                                <Settings size={18} />
                            </button>

                            {/* View Mode Filter Menu */}
                            {!isLoading && (viewingVersion === 'draft' || viewingVersion === viewingVersion) && (
                                <FilterDropdown align="right" width="280px">
                                    <div className="py-2">
                                        <div className="px-4 py-3 border-b border-[#2a2a2a]">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                                                    View Mode
                                                </span>
                                            </div>
                                            <SegmentedControl
                                                options={[
                                                    { label: 'Total', value: 'cumulative' },
                                                    { label: 'New', value: 'delta' }
                                                ]}
                                                value={viewMode}
                                                onChange={(v: any) => onViewModeChange(v)}
                                            />
                                            <div className="mt-2 text-[10px] text-text-tertiary leading-relaxed grid">
                                                <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${viewMode === 'cumulative' ? 'opacity-100' : 'opacity-0'}`}>
                                                    Show total accumulated views
                                                </span>
                                                <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${viewMode === 'delta' ? 'opacity-100' : 'opacity-0'}`}>
                                                    Show new views since last snapshot
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </FilterDropdown>
                            )}

                            {!isLoading && (
                                <TrafficUploader
                                    isCompact
                                    onUpload={onUpload}
                                    isLoading={false}
                                    hasExistingSnapshot={hasExistingSnapshot}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* CTR Config Modal */}
            <TrafficCTRConfig
                isOpen={isConfigOpen}
                onClose={() => setIsConfigOpen(false)}
                anchorRef={configBtnRef}
            />
        </>
    );
};
