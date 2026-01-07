import React, { useState } from 'react';
import { Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { SidebarVersionItem } from './SidebarVersionItem';
import type { PackagingVersion } from '../../../../core/utils/youtubeApi';

interface PackagingNavProps {
    versions: PackagingVersion[];
    viewingVersion: number | 'draft';
    activeVersion: number | 'draft';  // The version currently used by the video
    hasDraft: boolean;
    onVersionClick: (versionNumber: number | 'draft') => void;
    onDeleteVersion: (versionNumber: number) => void;
    onSelect: () => void;
    isActive: boolean;
}

export const PackagingNav: React.FC<PackagingNavProps> = ({
    versions,
    viewingVersion,
    activeVersion,
    hasDraft,
    onVersionClick,
    onDeleteVersion,
    onSelect,
    isActive
}) => {
    // ============================================================================
    // BUSINESS LOGIC: Collapsible Version List
    // ============================================================================
    // Versions are hidden by default to keep sidebar clean.
    // - First click on header → expands the list
    // - Second click → navigates to draft or latest version
    const [isExpanded, setIsExpanded] = useState(false);

    // BUSINESS LOGIC: Version Ordering
    // Sort by most recently used (endDate) or created (startDate) - newest first
    const sortedVersions = [...versions].sort((a, b) => {
        const aDate = a.endDate || a.startDate;
        const bDate = b.endDate || b.startDate;
        return bDate - aDate;
    });

    // Determine if there's content to expand
    const hasContent = hasDraft || versions.length > 0;

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
                            setIsExpanded(true);
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
                        w-full h-12 flex items-center gap-4 px-4 text-sm font-medium 
                        transition-colors rounded-lg cursor-pointer text-text-primary
                        ${isActive ? 'bg-sidebar-active' : 'hover:bg-sidebar-hover'}
                    `}
                >
                    {/* Icon */}
                    <span className="flex-shrink-0">
                        <Pencil size={24} />
                    </span>

                    {/* Label */}
                    <span className="flex-1">Packaging</span>

                    {/* Expand/Collapse Toggle - Right Side */}
                    {hasContent && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(!isExpanded);
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
                        // No delete for draft
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
                            onDelete={() => onDeleteVersion(version.versionNumber)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
