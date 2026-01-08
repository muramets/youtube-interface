import React from 'react';

interface SidebarNavItemProps {
    icon: React.ReactNode;
    label: string;
    isActive?: boolean;
    onClick?: () => void;
}

export const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
    icon,
    label,
    isActive = false,
    onClick,
}) => {
    return (
        <div className="px-3">
            <button
                onClick={onClick}
                className={`
          w-full h-12 flex items-center gap-4 px-4 text-sm transition-colors rounded-lg text-text-primary
          ${isActive
                        ? 'bg-sidebar-active font-semibold'
                        : 'hover:bg-sidebar-hover font-normal'
                    }
        `}
            >
                <span className="flex-shrink-0">{icon}</span>
                <span className="whitespace-nowrap">{label}</span>
            </button>
        </div>
    );
};
