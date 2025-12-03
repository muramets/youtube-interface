import React from 'react';

interface ThemeProps {
    isDark: boolean;
    textSecondary: string;
    hoverBg?: string;
    activeItemBg?: string;
    activeItemText?: string;
    borderColor?: string;
    bgMain?: string;
    textPrimary?: string;
}

interface SettingsSidebarProps {
    activeCategory: string;
    onCategoryChange: (category: string) => void;
    theme: ThemeProps;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ activeCategory, onCategoryChange, theme }) => {
    return (
        <div className={`w-[279px] border-r ${theme.borderColor} py-2 flex flex-col pt-2 ${theme.bgMain}`}>
            <SidebarItem
                label="API & Sync"
                isActive={activeCategory === 'api_sync'}
                onClick={() => onCategoryChange('api_sync')}
                theme={theme}
            />
            <SidebarItem
                label="Clone"
                isActive={activeCategory === 'clone'}
                onClick={() => onCategoryChange('clone')}
                theme={theme}
            />
        </div>
    );
};

const SidebarItem: React.FC<{
    label: string;
    isActive: boolean;
    onClick: () => void;
    theme: ThemeProps;
}> = ({ label, isActive, onClick, theme }) => (
    <div className="px-2">
        <button
            onClick={onClick}
            className={`w-full text-left px-4 h-[48px] flex items-center text-[15px] transition-colors rounded-lg
                ${isActive
                    ? `${theme.activeItemBg} ${theme.activeItemText} font-medium`
                    : `${theme.textSecondary} ${theme.hoverBg}`
                }`}
        >
            {label}
        </button>
    </div>
);
