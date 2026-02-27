/**
 * =============================================================================
 * SPLIT BUTTON COMPONENT
 * =============================================================================
 *
 * Кнопка с двумя частями: основное действие + dropdown chevron.
 * Паттерн split-button используется когда есть одно основное действие
 * и набор альтернатив (как Save → Save as v.X).
 *
 * Визуально:
 *   [ ⬆ Upload to v.3  | ▾ ]
 *
 * Стили: повторяют Button atom — те же variant/size tokens.
 *
 * =============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// ТИПЫ
// ---------------------------------------------------------------------------

type SplitButtonVariant = 'primary' | 'secondary' | 'accent';
type SplitButtonSize = 'sm' | 'md';

interface SplitButtonProps {
    /** Текст основной кнопки */
    label: string;
    /** Действие при клике на основную часть */
    onClick: () => void;
    /** Отключить всю кнопку */
    disabled?: boolean;
    /** Состояние загрузки — показывает spinner */
    isLoading?: boolean;
    /** Текст при загрузке */
    loadingLabel?: string;
    /** Иконка слева от текста */
    leftIcon?: React.ReactNode;
    /** Визуальный стиль */
    variant?: SplitButtonVariant;
    /** Размер */
    size?: SplitButtonSize;
    /** Содержимое dropdown (рендерится как children) */
    children: React.ReactNode;
    /** Выравнивание dropdown */
    dropdownAlign?: 'left' | 'right';
    /** Дополнительные CSS-классы для обёртки */
    className?: string;
}

// ---------------------------------------------------------------------------
// СТИЛИ (повторяют Button atom)
// ---------------------------------------------------------------------------

const variantStyles: Record<SplitButtonVariant, { main: string; divider: string }> = {
    primary: {
        main: 'bg-text-primary text-bg-primary hover:opacity-90',
        divider: 'border-[var(--split-button-divider)]'
    },
    secondary: {
        main: 'bg-button-secondary-bg text-button-secondary-text hover:bg-button-secondary-hover',
        divider: 'border-[var(--split-button-divider)]'
    },
    accent: {
        main: 'bg-[var(--primary-button-bg)] text-[var(--primary-button-text)] hover:bg-[var(--primary-button-hover)]',
        divider: 'border-[var(--split-button-divider)]'
    },
};

const sizeStyles: Record<SplitButtonSize, { main: string; chevron: string; text: string }> = {
    sm: { main: 'h-8 px-3', chevron: 'h-8 px-2', text: 'text-sm' },
    md: { main: 'h-10 px-4', chevron: 'h-10 px-2.5', text: 'text-sm' },
};

// ---------------------------------------------------------------------------
// КОМПОНЕНТ
// ---------------------------------------------------------------------------

/**
 * Split Button — кнопка с dropdown.
 *
 * @example
 * <SplitButton
 *     label="Upload to v.3"
 *     onClick={handleUpload}
 *     leftIcon={<Upload size={14} />}
 *     variant="secondary"
 *     size="sm"
 * >
 *     <div className="py-1">
 *         <button onClick={() => setVersion(3)}>v.3 (active)</button>
 *         <button onClick={() => setVersion(2)}>v.2</button>
 *     </div>
 * </SplitButton>
 */
export const SplitButton: React.FC<SplitButtonProps> = ({
    label,
    onClick,
    disabled = false,
    isLoading = false,
    loadingLabel,
    leftIcon,
    variant = 'secondary',
    size = 'md',
    children,
    dropdownAlign = 'right',
    className = '',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [isOpen]);

    const isDisabled = disabled || isLoading;
    const styles = variantStyles[variant];
    const sizes = sizeStyles[size];

    return (
        <div className={`relative inline-flex ${className}`} ref={containerRef}>
            {/* Main action button */}
            <button
                onClick={onClick}
                disabled={isDisabled}
                className={`
                    ${sizes.main} ${sizes.text} ${styles.main}
                    inline-flex items-center gap-2 font-medium
                    rounded-l-full transition-colors duration-150
                    disabled:opacity-50 disabled:cursor-not-allowed
                `}
            >
                {isLoading ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                        <span>{loadingLabel || label}</span>
                    </>
                ) : (
                    <>
                        {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
                        <span>{label}</span>
                    </>
                )}
            </button>

            {/* Chevron dropdown trigger */}
            <button
                onClick={() => !isDisabled && setIsOpen(prev => !prev)}
                disabled={isDisabled}
                className={`
                    ${sizes.chevron} ${styles.main}
                    inline-flex items-center justify-center
                    rounded-r-full transition-colors duration-150
                    border-l ${styles.divider}
                    disabled:opacity-50 disabled:cursor-not-allowed
                `}
            >
                <ChevronDown
                    size={14}
                    className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Dropdown menu */}
            {isOpen && (
                <div
                    className={`
                        absolute top-full mt-1 z-dropdown
                        bg-bg-secondary/95 backdrop-blur-xl
                        border border-white/10 rounded-xl
                        shadow-2xl overflow-hidden
                        animate-scale-in origin-top-right
                        min-w-[180px]
                        ${dropdownAlign === 'right' ? 'right-0' : 'left-0'}
                    `}
                    onClick={() => setIsOpen(false)}
                >
                    {children}
                </div>
            )}
        </div>
    );
};

export type { SplitButtonProps, SplitButtonVariant, SplitButtonSize };
