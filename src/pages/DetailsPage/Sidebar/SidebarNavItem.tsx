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
          w-full h-12 flex items-center gap-6 px-4 text-sm font-medium transition-colors rounded-lg text-text-primary
          ${isActive
                        ? 'bg-sidebar-active'
                        : 'hover:bg-sidebar-hover'
                    }
        `}
            >
                <span className="flex-shrink-0">{icon}</span>
                <span>{label}</span>
            </button>
        </div>
    );
};
