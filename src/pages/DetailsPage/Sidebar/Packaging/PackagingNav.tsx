import React from 'react';
import { Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { SidebarVersionItem } from './SidebarVersionItem';
import type { PackagingVersion } from '../../../../core/utils/youtubeApi';

interface PackagingNavProps {
    versions: PackagingVersion[];
    viewingVersion: number | 'draft';
    activeVersion: number | 'draft';  // The version currently used by the video
    hasDraft: boolean;
    onVersionClick: (versionNumber: number | 'draft') => void;
    onDeleteVersion: (versionNumber: number, versionLabel?: string) => void;
    onDeleteDraft?: () => void; // Optional callback to delete draft
    onSelect: () => void;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: () => void;
}

export const PackagingNav: React.FC<PackagingNavProps> = ({
    versions,
    viewingVersion,
    activeVersion,
    hasDraft,
    onVersionClick,
    onDeleteVersion,
    onDeleteDraft,
    onSelect,
    isActive,
    isExpanded,
    onToggle
}) => {
    // ============================================================================
    // BUSINESS LOGIC: Collapsible Version List
    // ============================================================================
    // Versions are hidden by default to keep sidebar clean.
    // - First click on header → expands the list (managed by parent)
    // - Second click → navigates to draft or latest version

    // Determine if there's content to expand
    const hasContent = hasDraft || versions.length > 0;

    // Standard Sort: Active Top, then Chronological Descending
    const sortedVersions = React.useMemo(() => {
        return [...versions].sort((a, b) => {
            const isActiveA = a.versionNumber === activeVersion;
            const isActiveB = b.versionNumber === activeVersion;
            if (isActiveA && !isActiveB) return -1;
            if (!isActiveA && isActiveB) return 1;
            return b.versionNumber - a.versionNumber;
        });
    }, [versions, activeVersion]);

    return (
        <div className="flex flex-col">
            {/* Header Row */}
            <div className="px-3">
                <div
                    onClick={() => {
                        onSelect();
                        // If not expanded, first expand
                        // If expanded, clicking header goes to draft/current
                        if (!isExpanded && hasContent) {
                            onToggle();
                        } else {
                            // Go to draft if exists, otherwise latest version
                            if (hasDraft) {
                                onVersionClick('draft');
                            } else if (sortedVersions.length > 0) {
                                onVersionClick(sortedVersions[0].versionNumber);
                            }
                        }
                    }}
                    className={`
                        w-full h-12 flex items-center gap-4 px-4 text-sm 
                        transition-colors rounded-lg cursor-pointer text-text-primary
                        ${isActive ? 'bg-sidebar-active font-semibold' : 'hover:bg-sidebar-hover font-normal'}
                    `}
                >
                    {/* Icon */}
                    <span className="flex-shrink-0">
                        <Pencil size={24} />
                    </span>

                    {/* Label */}
                    <span className="flex-1 whitespace-nowrap">Packaging</span>

                    {/* Expand/Collapse Toggle - Right Side */}
                    {hasContent && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggle();
                            }}
                            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                        >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Version List (expanded) */}
            {isExpanded && hasContent && (
                <div className="flex flex-col gap-1 py-1">
                    {/* Draft row (if exists) */}
                    {hasDraft && (
                        <SidebarVersionItem
                            label="Draft"
                            isViewing={viewingVersion === 'draft'}
                            isVideoActive={activeVersion === 'draft'}
                            onClick={() => onVersionClick('draft')}
                            onDelete={onDeleteDraft} // Allow deleting draft
                        />
                    )}

                    {/* Saved versions */}
                    {sortedVersions.map((version) => (
                        <SidebarVersionItem
                            key={version.versionNumber}
                            label={`v.${version.versionNumber}`}
                            isViewing={viewingVersion === version.versionNumber}
                            isVideoActive={activeVersion === version.versionNumber}
                            onClick={() => onVersionClick(version.versionNumber)}
                            onDelete={() => onDeleteVersion(version.versionNumber, `v.${version.versionNumber}`)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
