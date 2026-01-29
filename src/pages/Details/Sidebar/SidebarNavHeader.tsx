import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SidebarNavHeaderProps {
    icon: React.ReactNode;
    title: string;
    isActive: boolean;
    isExpanded: boolean;
    hasContent: boolean;
    /**
     * Primary click handler.
     * Logic for expand/nav behavior should be handled by the parent
     * (e.g., if !expanded -> toggle, else -> select).
     */
    onClick: () => void;
    /**
     * Secondary click handler for the chevron, ensures only expansion toggles
     * without triggering the main selection if needed.
     */
    onToggle: (e: React.MouseEvent) => void;
}

/**
 * Shared header component for sidebar navigation sections.
 * Used by PackagingNav and TrafficNav.
 */
export const SidebarNavHeader: React.FC<SidebarNavHeaderProps> = ({
    icon,
    title,
    isActive,
    isExpanded,
    hasContent,
    onClick,
    onToggle
}) => {
    return (
        <div className="px-3">
            <div
                onClick={onClick}
                className={`
                    w-full h-12 flex items-center gap-4 px-4 text-sm 
                    transition-colors rounded-lg cursor-pointer text-text-primary
                    ${isActive ? 'bg-sidebar-active font-semibold' : 'hover:bg-sidebar-hover font-normal'}
                `}
            >
                {/* Icon */}
                <span className="flex-shrink-0">
                    {icon}
                </span>

                {/* Label */}
                <span className="flex-1 whitespace-nowrap">{title}</span>

                {/* Expand/Collapse Toggle - Right Side */}
                {hasContent && (
                    <button
                        onClick={onToggle}
                        className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                )}
            </div>
        </div>
    );
};
