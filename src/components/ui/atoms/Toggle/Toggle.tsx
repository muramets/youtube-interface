import React from 'react';

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    className?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
    checked,
    onChange,
    size = 'md',
    disabled = false,
    className = ''
}) => {
    // Size configs
    const sizes = {
        sm: { width: 'w-8', height: 'h-4', knob: 'h-3 w-3', translate: 'translate-x-4' },
        md: { width: 'w-11', height: 'h-6', knob: 'h-5 w-5', translate: 'translate-x-5' },
        lg: { width: 'w-14', height: 'h-7', knob: 'h-6 w-6', translate: 'translate-x-7' },
    };

    const s = sizes[size];

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={`
                relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out border-2 border-transparent
                ${s.width} ${s.height}
                ${checked ? 'bg-blue-600' : 'bg-white/20'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${!checked && !disabled ? 'hover:bg-white/30' : ''}
                ${className}
            `}
        >
            <span className="sr-only">Use setting</span>
            <span
                aria-hidden="true"
                className={`
                    pointer-events-none inline-block rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                    ${s.knob}
                    ${checked ? s.translate : 'translate-x-0'}
                `}
            />
        </button>
    );
};
