import React, { useRef, useState } from 'react';
import { FilterDropdown } from '../../../../../components/ui/molecules/FilterDropdown';
import { TrafficUploader } from './TrafficUploader';
import { Settings } from 'lucide-react';
import { TrafficCTRConfig } from './TrafficCTRConfig';
import { TrafficFilterMenu } from './TrafficFilterMenu';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { TrafficFilter } from '../hooks/useTrafficFilters';

interface TrafficHeaderProps {
    headerTitle: string;
    isViewingOldVersion: boolean;
    viewingVersion?: number | 'draft';
    versionLabel?: string; // e.g. "Version 1" (aliased)
    shouldShowActions: boolean;

    // View mode
    viewMode: 'cumulative' | 'delta';
    onViewModeChange: (mode: 'cumulative' | 'delta') => void;

    // Filters
    filters: TrafficFilter[];
    onAddFilter: (filter: Omit<TrafficFilter, 'id'>) => void;
    onRemoveFilter: (id: string) => void;

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
    versionLabel,
    shouldShowActions,
    viewMode,
    onViewModeChange,
    filters,
    onAddFilter,
    onRemoveFilter,
    isLoading,
    hasExistingSnapshot,
    onUpload,
    isScrolled
}) => {
    const configBtnRef = useRef<HTMLButtonElement>(null);
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    // Filter badge count (active filters)
    const badgeCount = filters.length;

    return (
        <>
            <div className={`sticky top-0 z-10 px-6 py-4 transition-shadow duration-200 bg-video-edit-bg ${isScrolled ? 'shadow-[0_2px_8px_rgba(0,0,0,0.3)]' : ''}`}>
                <div className="flex items-center justify-between gap-4 max-w-[1050px]">
                    <div>
                        <h1 className="text-2xl font-medium text-text-primary">{headerTitle}</h1>
                        {/* Always show version stats info if viewing a specific version */}
                        {versionLabel && (
                            <p className="text-sm text-text-secondary mt-1">
                                Viewing stats for {versionLabel}
                            </p>
                        )}
                        {!versionLabel && isViewingOldVersion && (
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

                            {/* View Mode & Filter Menu */}
                            {!isLoading && (viewingVersion === 'draft' || viewingVersion === viewingVersion) && (
                                <FilterDropdown align="right" width="280px" badgeCount={badgeCount}>
                                    {({ onClose }) => (
                                        <TrafficFilterMenu
                                            viewMode={viewMode}
                                            onViewModeChange={onViewModeChange}
                                            filters={filters}
                                            onAddFilter={onAddFilter}
                                            onRemoveFilter={onRemoveFilter}
                                            onClose={onClose}
                                        />
                                    )}
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

// Wrapper hack: since we can't easily modify FilterDropdown in this step without a separate tool call (and potential side effects),
// and I cannot pass onClose.
// Actually, for now, TrafficFilterMenu's onClose will just do nothing visually if inside FilterDropdown?
// No, user expects it to close.
// I will check if I can modify FilterDropdown first or if I should just use the Trends approach here.
// Trends approach is more robust because `TrafficFilterMenu` needs to modify its height and `FilterDropdown` has fixed positioning logic that might not update? 
// Actually FilterDropdown has auto-height.
// BUT `onClose` is critical.
// I will pause this Edit to Modify FilterDropdown first.

