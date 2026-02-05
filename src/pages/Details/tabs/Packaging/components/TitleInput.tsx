import React from 'react';

interface TitleInputProps {
    value: string;
    onChange: (value: string) => void;
    onABTestClick?: () => void;
    readOnly?: boolean;
}

const MAX_CHARS = 100;

export const TitleInput: React.FC<TitleInputProps> = ({
    value,
    onChange,
    onABTestClick,
    readOnly = false
}) => {
    const charCount = value.length;

    return (
        <div
            className={`relative flex flex-col bg-bg-secondary border border-border rounded-lg p-3 transition-colors
                hover:border-text-primary focus-within:border-text-primary ${readOnly ? 'opacity-60' : ''}`}
            style={{ height: '129px' }}
        >
            {/* Label inside container */}
            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-2">
                Title
            </label>

            {/* Input */}
            <textarea
                maxLength={MAX_CHARS}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Add a title that describes your video"
                className="flex-1 w-full bg-transparent text-base text-text-primary outline-none resize-none placeholder-modal-placeholder"
                readOnly={readOnly}
            />

            {/* A/B Testing button in bottom left */}
            {!readOnly && onABTestClick && (
                <button
                    onClick={onABTestClick}
                    className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1.5 
                        bg-button-secondary-bg hover:bg-button-secondary-hover rounded-full text-sm text-text-primary 
                        transition-colors"
                >
                    {/* YouTube A/B Testing icon */}
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 1a1 1 0 011 1v20a1 1 0 11-2 0V2a1 1 0 011-1Zm-2 4H3v14h7v2H3a2 2 0 01-1.99-1.796L1 19V5a2 2 0 012-2h7v2Zm11-2a2 2 0 012 2v14a2 2 0 01-2 2h-7v-4h4.132a1 1 0 00.832-1.555L14 8V3h7Zm-11 8.604L7.736 15H10v2H5.868a1 1 0 01-.832-1.555L10 8v3.606Z" />
                    </svg>
                    <span>A/B Testing</span>
                </button>
            )}

            {/* Character counter in bottom right */}
            <span className="absolute bottom-3 right-3 text-xs text-text-secondary">
                {charCount}/{MAX_CHARS}
            </span>
        </div>
    );
};
