import React from 'react';

interface TitleInputProps {
    value: string;
    onChange: (value: string) => void;
}

const MAX_CHARS = 100;

export const TitleInput: React.FC<TitleInputProps> = ({ value, onChange }) => {
    const charCount = value.length;

    return (
        <div
            className="relative flex flex-col bg-bg-secondary border border-border rounded-lg p-3 hover:border-text-primary focus-within:border-text-primary transition-colors"
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
            />

            {/* Character counter in bottom right */}
            <span className="absolute bottom-3 right-3 text-xs text-text-secondary">
                {charCount}/{MAX_CHARS}
            </span>
        </div>
    );
};
