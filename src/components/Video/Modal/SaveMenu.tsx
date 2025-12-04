import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface SaveMenuProps {
    isSaving: boolean;
    isPackagingDirty: boolean;
    isDraft: boolean;
    hasCoverImage: boolean;
    currentPackagingVersion: number;
    onSaveDraft: () => void;
    onSaveVersion: () => void;
}

export const SaveMenu: React.FC<SaveMenuProps> = ({
    isSaving,
    isPackagingDirty,
    isDraft,
    hasCoverImage,
    currentPackagingVersion,
    onSaveDraft,
    onSaveVersion
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
        };
    }, []);

    const isDisabled = !isPackagingDirty || isSaving;
    const isDropdownDisabled = !hasCoverImage || isSaving || (!isPackagingDirty && !isDraft);

    return (
        <div className="flex items-center gap-2 relative" ref={menuRef}>
            <div className="flex items-center gap-0.5">
                <button
                    onClick={onSaveDraft}
                    disabled={isDisabled}
                    className={`px-3 h-8 text-sm font-medium transition-all flex items-center gap-2 rounded-l-full ${isDisabled
                        ? 'bg-[#424242] text-[#717171] cursor-default'
                        : 'bg-white text-black hover:bg-gray-200 cursor-pointer'
                        }`}
                >
                    {isSaving ? 'Saving...' : (!isPackagingDirty ? 'Saved as Draft' : 'Save as Draft')}
                </button>

                <div className="relative">
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        disabled={isDropdownDisabled}
                        className={`px-2 h-8 transition-all flex items-center justify-center rounded-r-full ${isDropdownDisabled
                            ? 'bg-[#424242] text-[#717171] cursor-default'
                            : 'bg-white text-black hover:bg-gray-200 cursor-pointer'
                            }`}
                    >
                        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown Menu */}
                    {isOpen && !isSaving && (
                        <div className="absolute top-full right-0 mt-0.5 w-max bg-[#1F1F1F]/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/5 overflow-hidden z-50 animate-scale-in origin-top-right">
                            <button
                                onClick={() => {
                                    onSaveVersion();
                                    setIsOpen(false);
                                }}
                                className="w-full px-4 py-2.5 text-left text-xs font-medium text-text-primary hover:bg-white/5 transition-colors flex items-center justify-between group whitespace-nowrap"
                            >
                                <span>Save as v.{currentPackagingVersion}</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
