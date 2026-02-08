import React, { useRef, useState } from 'react';
import { FilterDropdown } from '../../../../../components/ui/molecules/FilterDropdown';
import { TrafficUploader } from './TrafficUploader';
import { Settings, CloudDownload, Wand2, Download, Image as ImageIcon } from 'lucide-react';
import { TrafficCTRConfig } from './TrafficCTRConfig';
import { TrafficFilterMenu } from './TrafficFilterMenu';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { TrafficFilter } from '../hooks/useTrafficFilters';



interface TrafficHeaderProps {
    headerTitle: string;
    isViewingOldVersion: boolean;
    viewingVersion?: number | 'draft';
    versionLabel?: { main: string; period: string | null } | null; // Object with main and period parts
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


    // Data for Niche Filtering
    groups?: import('../../../../../core/types/traffic').TrafficGroup[];
    trafficSources?: import('../../../../../core/types/traffic').TrafficSource[];

    // Missing Titles Sync
    missingTitlesCount?: number;
    onOpenMissingTitles?: () => void;

    // Smart Assistant Toggle
    isAssistantEnabled?: boolean;
    onToggleAssistant?: () => void;

    // Export
    onExport?: () => void;
    onExportImages?: () => void;
}

/**
 * Sticky header untuk Traffic Tab.
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
    isScrolled,
    groups,
    trafficSources,
    missingTitlesCount = 0,
    onOpenMissingTitles,
    isAssistantEnabled = false,
    onToggleAssistant,
    onExport,
    onExportImages
}) => {
    const configBtnRef = useRef<HTMLButtonElement>(null);
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    // Image Download Button State
    const [showImageDownload, setShowImageDownload] = useState(false);
    const imageDownloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


    // Filter badge count (active filters)
    const badgeCount = filters.length;

    return (
        <>
            <div className={`sticky top-0 z-10 px-6 py-4 transition-shadow duration-200 bg-video-edit-bg ${isScrolled ? 'shadow-[0_2px_8px_rgba(0,0,0,0.3)]' : ''}`}>
                <div className="flex items-center justify-between gap-4 max-w-[1200px]">
                    <div>
                        <h1 className="text-2xl font-medium text-text-primary">{headerTitle}</h1>
                        {/* Always show version stats info if viewing a specific version */}
                        {versionLabel && (
                            <p className="text-sm text-text-secondary mt-1">
                                Viewing stats for {versionLabel.main}
                                {versionLabel.period && (
                                    <span className="text-text-tertiary italic text-xs"> ({versionLabel.period})</span>
                                )}
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
                            {/* Smart Assistant Toggle */}
                            {onToggleAssistant && (
                                <button
                                    onClick={onToggleAssistant}
                                    className={`w-[34px] h-[34px] rounded-full flex items-center justify-center transition-all border-none cursor-pointer ${isAssistantEnabled
                                        ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]'
                                        : 'bg-transparent text-text-primary hover:bg-hover-bg'}`}
                                    title={isAssistantEnabled ? "Disable Smart Assistant" : "Enable Smart Assistant"}
                                >
                                    <Wand2 size={18} className={isAssistantEnabled ? "animate-pulse" : ""} />
                                </button>
                            )}

                            {/* Sync Missing Titles Button */}
                            {missingTitlesCount > 0 && onOpenMissingTitles && (
                                <button
                                    onClick={onOpenMissingTitles}
                                    className="w-[34px] h-[34px] rounded-full flex items-center justify-center transition-colors border-0 cursor-pointer bg-transparent text-text-primary hover:text-blue-500 hover:bg-blue-500/10"
                                    title={`Sync ${missingTitlesCount} missing titles`}
                                >
                                    <CloudDownload size={18} />
                                </button>
                            )}

                            {/* Export CSV & Images (Two-State Button) */}
                            {onExport && (
                                <div className="relative">
                                    <button
                                        onClick={(e) => {
                                            if (showImageDownload && onExportImages) {
                                                e.stopPropagation();
                                                onExportImages();
                                                setShowImageDownload(false);
                                                if (imageDownloadTimerRef.current) clearTimeout(imageDownloadTimerRef.current);
                                            } else if (onExport) {
                                                onExport();
                                                setShowImageDownload(true);
                                                if (imageDownloadTimerRef.current) clearTimeout(imageDownloadTimerRef.current);
                                                imageDownloadTimerRef.current = setTimeout(() => setShowImageDownload(false), 5000);
                                            }
                                        }}
                                        className={`
                                            relative flex items-center justify-center w-[34px] h-[34px] rounded-full transition-all duration-300 ease-out
                                            ${showImageDownload
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500 scale-105'
                                                : 'bg-transparent text-text-primary hover:text-green-500 hover:bg-green-500/10'
                                            }
                                        `}
                                        title={showImageDownload ? "Download Covers (ZIP)" : "Export Current View (CSV)"}
                                    >
                                        {/* Icons Container - Smooth Transition Switch */}
                                        <div className="relative w-[18px] h-[18px] flex items-center justify-center">
                                            <Download
                                                size={18}
                                                className={`absolute transition-all duration-300 transform
                                                    ${showImageDownload
                                                        ? 'opacity-0 scale-75 rotate-12'
                                                        : 'opacity-100 scale-100 rotate-0'
                                                    }
                                                `}
                                            />

                                            <ImageIcon
                                                size={18}
                                                strokeWidth={2.5}
                                                className={`absolute transition-all duration-300 transform
                                                    ${showImageDownload
                                                        ? 'opacity-100 scale-100 rotate-0 text-white'
                                                        : 'opacity-0 scale-75 -rotate-12'
                                                    }
                                                `}
                                            />
                                        </div>
                                    </button>
                                </div>
                            )}

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
                                            groups={groups}
                                            sources={trafficSources}
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

