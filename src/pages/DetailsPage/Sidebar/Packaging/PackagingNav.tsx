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
    onDeleteVersion: (versionNumber: number) => void;
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

    // BUSINESS LOGIC: Deduplication for Packaging Tab
    // Users only care about "Content Versions" here. Since clones (restored versions) 
    // are identical to their originals, we shouldn't show duplicates (e.g. v.3 and v.3 restored).
    // We group by "Original Version" and show only the representative (Active > Latest).
    const uniqueVersions = React.useMemo(() => {
        const groups = new Map<number, PackagingVersion[]>();

        versions.forEach(v => {
            const canonicalId = v.cloneOf || v.versionNumber;
            // Debug log to trace deduplication issues
            console.log(`[PackagingNav] Dedupe: v.${v.versionNumber} (cloneOf: ${v.cloneOf}) -> Group ${canonicalId}`);

            if (!groups.has(canonicalId)) {
                groups.set(canonicalId, []);
            }
            groups.get(canonicalId)?.push(v);
        });

        const result: PackagingVersion[] = [];
        groups.forEach((groupVersions) => {
            // 1. Pick Active if exists in group
            const active = groupVersions.find(v => v.versionNumber === activeVersion);
            if (active) {
                result.push(active);
            } else {
                // 2. Otherwise pick the one with highest versionNumber (latest instance)
                // Assuming groupVersions might not be sorted, we sort desc
                const latest = groupVersions.sort((a, b) => b.versionNumber - a.versionNumber)[0];
                result.push(latest);
            }
        });

        // Maintain the sort order: Active Top, then Chronological
        return result.sort((a, b) => {
            const isActiveA = a.versionNumber === activeVersion;
            const isActiveB = b.versionNumber === activeVersion;
            if (isActiveA && !isActiveB) return -1;
            if (!isActiveA && isActiveB) return 1;

            // For non-active, sort by their actual version number (desc)
            // This keeps the "Latest touched" at the top
            return b.versionNumber - a.versionNumber;
        });
    }, [versions, activeVersion]);

    const sortedVersions = uniqueVersions;

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
                        // No delete for draft
                        />
                    )}

                    {/* Saved versions */}
                    {sortedVersions.map((version) => {
                        return (
                            <SidebarVersionItem
                                key={version.versionNumber}
                                label={`v.${version.cloneOf || version.versionNumber}`}
                                isViewing={viewingVersion === version.versionNumber}
                                isVideoActive={activeVersion === version.versionNumber}
                                onClick={() => onVersionClick(version.versionNumber)}
                                onDelete={() => onDeleteVersion(version.versionNumber)}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};
