import React from 'react';

interface DescriptionInputProps {
    value: string;
    onChange: (value: string) => void;
}

export const DescriptionInput: React.FC<DescriptionInputProps> = ({ value, onChange }) => {
    return (
        <div
            className="relative flex flex-col bg-bg-secondary border border-border rounded-lg p-3 hover:border-text-primary focus-within:border-text-primary transition-colors"
            style={{ height: '219px' }}
        >
            {/* Label inside container */}
            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-2">
                Description
            </label>

            {/* Textarea */}
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Tell viewers about your video"
                className="flex-1 w-full bg-transparent text-base text-text-primary outline-none resize-none placeholder-modal-placeholder"
            />
        </div>
    );
};
