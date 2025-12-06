import React, { useState } from 'react';
import { Search, Check } from 'lucide-react';

interface FilterOption {
    id: string;
    label: string;
    description?: string; // e.g. video count
}

interface FilterInputListProps {
    options: FilterOption[];
    onApply: (selectedIds: string[]) => void;
    placeholder?: string;
    multiSelect?: boolean;
}

export const FilterInputList: React.FC<FilterInputListProps> = ({
    options,
    onApply,
    placeholder = "Search",
    multiSelect = true
}) => {
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    const toggleSelection = (id: string) => {
        if (multiSelect) {
            setSelectedIds(prev =>
                prev.includes(id)
                    ? prev.filter(mid => mid !== id)
                    : [...prev, id]
            );
        } else {
            setSelectedIds([id]);
        }
    };

    return (
        <div className="p-3 w-full bg-[#1F1F1F]">
            <div className="relative mb-3">
                <Search size={16} className="absolute left-0 top-2 text-[#AAAAAA]" />
                <input
                    type="text"
                    className="w-full bg-transparent border-b border-[#737373] focus:border-[#111111] py-1 pl-6 text-white outline-none transition-colors text-base placeholder-[#555555]"
                    placeholder={placeholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                />
            </div>

            <div className="max-h-60 overflow-y-auto mb-4 custom-scrollbar">
                {filteredOptions.length > 0 ? (
                    filteredOptions.map(option => {
                        const isSelected = selectedIds.includes(option.id);
                        return (
                            <button
                                key={option.id}
                                onClick={() => toggleSelection(option.id)}
                                className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-1 flex items-center justify-between group transition-colors
                                    ${isSelected ? 'bg-[#333333] text-white' : 'text-[#AAAAAA] hover:bg-[#161616] hover:text-white'}
                                `}
                            >
                                <div>
                                    <div className="font-medium truncate">{option.label}</div>
                                    {option.description && (
                                        <div className="text-xs opacity-60 truncate">{option.description}</div>
                                    )}
                                </div>
                                {isSelected && <Check size={16} className="text-white" />}
                            </button>
                        );
                    })
                ) : (
                    <div className="text-center py-4 text-[#555555] text-sm">
                        No results found
                    </div>
                )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#333333]">
                <button
                    onClick={() => selectedIds.length > 0 && onApply(selectedIds)}
                    disabled={selectedIds.length === 0}
                    className="bg-[#333333] text-white font-medium px-4 py-2 rounded-full text-sm hover:bg-[#444444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Apply
                </button>
            </div>
        </div>
    );
};
