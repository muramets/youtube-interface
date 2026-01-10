import React from 'react';
import { Pencil } from 'lucide-react';
import { SidebarVersionItem } from './SidebarVersionItem';
import { SidebarNavHeader } from '../SidebarNavHeader';
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
            <SidebarNavHeader
                icon={<Pencil size={24} />}
                title="Packaging"
                isActive={isActive}
                isExpanded={isExpanded}
                hasContent={hasContent}
                onClick={() => {
                    onSelect();
                    if (!isExpanded && hasContent) {
                        onToggle();
                    } else {
                        // Logic moved from inline:
                        // If expanded, clicking goes to draft/current
                        // But wait, the previous logic was: clicking ALWAYS selects, but toggle handles expand
                        // Let's replicate exact behavior:
                        if (hasDraft) {
                            onVersionClick('draft');
                        } else if (sortedVersions.length > 0) {
                            onVersionClick(sortedVersions[0].versionNumber);
                        }
                    }
                }}
                onToggle={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
            />

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
                            label={`v.${version.versionNumber} `}
                            isViewing={viewingVersion === version.versionNumber}
                            isVideoActive={activeVersion === version.versionNumber}
                            onClick={() => onVersionClick(version.versionNumber)}
                            onDelete={() => onDeleteVersion(version.versionNumber, `v.${version.versionNumber} `)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
