import React, { useState } from 'react';

interface FilterInputTitleProps {
    value: string;
    onApply: (value: string) => void;
}

export const FilterInputTitle: React.FC<FilterInputTitleProps> = ({ value, onApply }) => {
    const [inputValue, setInputValue] = useState(value || '');

    return (
        <div className="p-3 w-full bg-[#1F1F1F]">
            <div className="mb-2 text-sm text-[#AAAAAA]">contains</div>
            <input
                type="text"
                autoFocus
                className="w-full bg-transparent border-b border-[#737373] focus:border-[#111111] py-1 text-white outline-none transition-colors text-base"
                placeholder="Value"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        onApply(inputValue);
                    }
                }}
            />
            <div className="flex justify-end mt-4">
                <button
                    onClick={() => onApply(inputValue)}
                    className="bg-[#333333] text-white font-medium px-4 py-2 rounded-full text-sm hover:bg-[#444444] transition-colors"
                >
                    Apply
                </button>
            </div>
        </div>
    );
};
