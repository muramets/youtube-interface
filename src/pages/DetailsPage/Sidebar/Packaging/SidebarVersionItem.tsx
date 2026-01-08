import React from 'react';
import { Trash2 } from 'lucide-react';
import { Badge } from '../../../../components/ui/atoms/Badge';

/**
 * BUSINESS LOGIC: Version Item States
 * 
 * - isViewing: This version is currently displayed in the form (user clicked it)
 * - isVideoActive: This version is the "source of truth" for the video
 * 
 * Example: User views v.1 while v.2 is active → isViewing=true for v.1, isVideoActive=true for v.2
 * The "Active" badge shows which version the video is actually using.
 */
interface SidebarVersionItemProps {
    label: string;
    isViewing: boolean;
    isVideoActive: boolean;
    onClick: () => void;
    onDelete?: () => void;
    isParentOfSelected?: boolean; // When a child snapshot is selected
}

export const SidebarVersionItem: React.FC<SidebarVersionItemProps> = ({
    label,
    isViewing,
    isVideoActive,
    onClick,
    onDelete,
    isParentOfSelected = false,
}) => {
    return (
        <div
            onClick={onClick}
            className={`
                group flex items-center justify-between pl-[56px] pr-4 py-1.5 cursor-pointer
                transition-colors rounded-lg ml-6 mr-3
                ${isViewing
                    ? 'text-text-primary font-medium bg-sidebar-active'
                    : isParentOfSelected
                        ? 'text-text-primary font-normal'
                        : 'text-text-secondary hover:text-text-primary hover:bg-sidebar-hover font-normal'
                }
            `}
            style={isParentOfSelected && !isViewing ? { backgroundColor: 'color-mix(in srgb, var(--sidebar-active), transparent 50%)' } : {}}
        >
            <div className="flex items-center gap-2">
                <span className="text-sm">{label}</span>

                {/* ACTIVE badge - always rendered, controlled by opacity for smooth transitions */}
                <div className={`inline-flex items-center transition-opacity duration-200 ${isVideoActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <Badge variant="success">Active</Badge>
                </div>
            </div>

            {/* Delete button - always present, show on hover via opacity */}
            {onDelete && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="p-1 text-text-secondary hover:text-red-500 rounded transition-all opacity-0 group-hover:opacity-100"
                    title="Delete version"
                >
                    <Trash2 size={12} />
                </button>
            )}
        </div>
    );
};
