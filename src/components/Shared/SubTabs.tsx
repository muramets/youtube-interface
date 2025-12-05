import React from 'react';
import { Trash2 } from 'lucide-react';

export interface SubTab {
    id: string;
    label: string;
    icon?: React.ReactNode;
    color?: string;
    count?: number;
    data?: any;
    onDelete?: () => void;
}

interface SubTabsProps {
    tabs: SubTab[];
    activeTabId: string;
    onTabChange: (id: string) => void;
    className?: string;
}

export const SubTabs: React.FC<SubTabsProps> = ({
    tabs,
    activeTabId,
    onTabChange,
    className = ''
}) => {
    return (
        <div className={`flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0 flex-shrink-0 ${className}`}>
            {tabs.map(tab => {
                const isActive = activeTabId === tab.id;

                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={`
                            px-4 py-2 text-xs font-medium rounded-b-lg transition-colors relative flex items-center gap-2 overflow-hidden whitespace-nowrap
                            ${isActive ? 'text-white bg-white/5' : 'text-text-secondary hover:text-white hover:bg-white/5'}
                        `}
                    >
                        {isActive && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-text-primary" />
                        )}

                        {tab.color && (
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tab.color }} />
                        )}

                        {tab.icon && (
                            <span className={isActive ? 'text-white' : 'text-text-secondary'}>
                                {tab.icon}
                            </span>
                        )}

                        {tab.label}

                        {tab.count !== undefined && (
                            <span className="ml-1 text-[10px] opacity-50">{tab.count}</span>
                        )}

                        {tab.onDelete && (
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    tab.onDelete?.();
                                }}
                                className="ml-1 p-0.5 rounded-full text-text-secondary hover:text-red-500 hover:bg-white/10 transition-colors group/delete"
                            >
                                <Trash2 size={12} />
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
