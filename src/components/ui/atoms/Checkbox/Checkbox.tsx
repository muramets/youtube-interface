import React from 'react';
import { Check, Minus } from 'lucide-react';

interface CheckboxProps {
    checked: boolean;
    indeterminate?: boolean;
    onChange: () => void;
    className?: string;
    disabled?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({
    checked,
    indeterminate,
    onChange,
    className = '',
    disabled = false
}) => {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={indeterminate ? 'mixed' : checked}
            disabled={disabled}
            onClick={!disabled ? onChange : undefined}
            className={`
                w-4 h-4 rounded border transition-all flex items-center justify-center
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${checked || indeterminate
                    ? 'bg-white border-white'
                    : 'border-white/20 bg-transparent hover:border-white/40'
                }
                ${className}
            `}
        >
            {indeterminate ? (
                <Minus size={12} className="text-black" strokeWidth={3} />
            ) : checked ? (
                <Check size={12} className="text-black" strokeWidth={3} />
            ) : null}
        </button>
    );
};
