import React from 'react';
import { Image } from 'lucide-react';
import { SidebarNavHeader } from '../SidebarNavHeader';

interface GalleryNavProps {
    itemCount: number;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    onSelect: () => void;
}

/**
 * Sidebar navigation item for Visual Gallery tab.
 * Shows image icon with item count badge.
 */
export const GalleryNav: React.FC<GalleryNavProps> = ({
    itemCount,
    isActive,
    isExpanded,
    onToggle,
    onSelect
}) => {
    // No expandable content for now, just a simple nav item
    const hasContent = false;

    return (
        <div className="flex flex-col">
            <SidebarNavHeader
                icon={
                    <div className="relative">
                        <Image size={24} />
                        {itemCount > 0 && (
                            <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-medium bg-[#3ea6ff] text-white rounded-full">
                                {itemCount > 99 ? '99+' : itemCount}
                            </span>
                        )}
                    </div>
                }
                title="Visual Gallery"
                isActive={isActive}
                isExpanded={isExpanded}
                hasContent={hasContent}
                onClick={() => {
                    onSelect();
                    if (!isExpanded && hasContent) {
                        onToggle();
                    }
                }}
                onToggle={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
            />
        </div>
    );
};
