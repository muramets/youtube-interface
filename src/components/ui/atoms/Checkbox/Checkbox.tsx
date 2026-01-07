import React from 'react';
import { Check, Minus } from 'lucide-react';

interface CheckboxProps {
    checked: boolean;
    indeterminate?: boolean;
    onChange: () => void;
    className?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
    checked,
    indeterminate,
    onChange,
    className = ''
}) => {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={indeterminate ? 'mixed' : checked}
            onClick={onChange}
            className={`
                w-4 h-4 rounded border transition-all flex items-center justify-center
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
