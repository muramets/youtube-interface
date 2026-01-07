import React from 'react';

interface TitleInputCardProps {
    value: string;
    index: number;
    borderClassName: string;
    onChange: (value: string) => void;
    /** If true, show shorter "(req.)" label */
    compact?: boolean;
}

/**
 * Title textarea input inside a styled card.
 * Displays "Title (required)" for first two slots.
 */
export const TitleInputCard: React.FC<TitleInputCardProps> = ({
    value,
    index,
    borderClassName,
    onChange,
    compact = false
}) => {
    const isRequired = index < 2;
    const requiredLabel = compact ? ' (req.)' : ' (required)';

    return (
        <div
            className={`flex-1 relative bg-modal-surface border rounded-2xl p-4 pt-3
                hover:border-[#AAAAAA] focus-within:border-[#AAAAAA] transition-colors overflow-hidden ${borderClassName}`}
            style={compact ? undefined : { height: '148px' }}
        >
            <div className="flex items-center justify-between text-xs text-modal-text-secondary mb-2 whitespace-nowrap px-1">
                <span>Title{compact ? ` ${index + 1}` : ''}{isRequired ? requiredLabel : ''}</span>
                <span>{value.length > 0 ? value.length : ''}</span>
            </div>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={`Add title ${index + 1}`}
                className="w-full h-[calc(100%-32px)] bg-transparent text-sm text-modal-text-primary placeholder:text-modal-placeholder 
                    resize-none focus:outline-none"
            />
        </div>
    );
};
