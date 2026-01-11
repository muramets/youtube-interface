import React from 'react';

interface SidebarNavItemProps {
    icon: React.ReactNode;
    label: string;
    isActive?: boolean;
    onClick?: () => void;
    action?: React.ReactNode;
}

export const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
    icon,
    label,
    isActive = false,
    onClick,
    action
}) => {
    return (
        <div className="px-3">
            <button
                onClick={onClick}
                className={`
                    w-full h-12 flex items-center justify-between px-4 text-sm transition-colors rounded-lg text-text-primary
                    ${isActive
                        ? 'bg-sidebar-active font-semibold'
                        : 'hover:bg-sidebar-hover font-normal'
                    }
                `}
            >
                <div className="flex items-center gap-4 min-w-0">
                    <span className="flex-shrink-0">{icon}</span>
                    <span className="whitespace-nowrap truncate">{label}</span>
                </div>

                {action && (
                    <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0 ml-2">
                        {action}
                    </div>
                )}
            </button>
        </div>
    );
};
