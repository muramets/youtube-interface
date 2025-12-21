import React from 'react';
import { Trash2 } from 'lucide-react';

interface SidebarVersionItemProps {
    label: string;           // e.g., "v.2" or "Draft"
    isViewing: boolean;      // Currently viewing this version in the form
    isVideoActive: boolean;  // This is the version actively used by the video
    onClick: () => void;
    onDelete?: () => void;   // Only for saved versions, not draft
}

export const SidebarVersionItem: React.FC<SidebarVersionItemProps> = ({
    label,
    isViewing,
    isVideoActive,
    onClick,
    onDelete,
}) => {
    return (
        <div
            onClick={onClick}
            className={`
                group flex items-center justify-between pl-[56px] pr-4 py-1.5 cursor-pointer
                transition-colors rounded-lg mx-3
                ${isViewing
                    ? 'text-text-primary font-medium bg-white/5'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }
            `}
        >
            <div className="flex items-center gap-2">
                <span className="text-sm">{label}</span>

                {/* ACTIVE badge - green like notification center */}
                {isVideoActive && (
                    <span className="px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-green-500/20 text-green-400">
                        Active
                    </span>
                )}
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
