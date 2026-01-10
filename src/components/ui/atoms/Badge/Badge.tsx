import React from 'react';
import { PortalTooltip } from '../../../Shared/PortalTooltip';

// -----------------------------------------------------------------------------
// ТИПЫ
// -----------------------------------------------------------------------------

/**
 * Варианты стилей бейджа.
 */
type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Пропсы компонента Badge.
 */
interface BadgeProps {
    /**
     * Визуальный стиль бейджа.
     * @default "neutral"
     */
    variant?: BadgeVariant;

    /**
     * Дополнительные CSS-классы.
     */
    className?: string;

    /**
     * Содержимое бейджа (текст).
     */
    children: React.ReactNode;

    /**
     * Включить обрезку текста с многоточием (...) при переполнении.
     * @default false
     */
    truncate?: boolean;

    /**
     * Максимальная ширина бейджа. Работает вместе с truncate.
     * @example "80px", "100px"
     */
    maxWidth?: string;
}

// -----------------------------------------------------------------------------
// СТИЛИ
// -----------------------------------------------------------------------------

/**
 * Базовые классы для всех бейджей.
 */
const baseStyles = `
    inline-flex items-center
    px-1 py-0.5
    text-[9px] font-bold uppercase tracking-wider
    rounded
`;

/**
 * Стили для каждого варианта.
 * 
 * Формат: фон с низкой opacity + яркий текст
 * Это создаёт премиальный, ненавязчивый вид.
 */
const variantStyles: Record<BadgeVariant, string> = {
    /**
     * SUCCESS — Зелёный
     * Используй для "Active", "Online", "Success", "Completed"
     */
    success: 'bg-green-500/20 text-green-400',

    /**
     * WARNING — Жёлтый/Оранжевый
     * Используй для "Pending", "Draft", предупреждений
     */
    warning: 'bg-yellow-500/20 text-yellow-400',

    /**
     * ERROR — Красный
     * Используй для "Error", "Failed", "Offline"
     */
    error: 'bg-red-500/20 text-red-400',

    /**
     * INFO — Синий
     * Используй для "New", "Beta", информационных меток
     */
    info: 'bg-blue-500/20 text-blue-400',

    /**
     * NEUTRAL — Серый
     * Используй для обычных меток без особого акцента
     */
    neutral: 'bg-text-secondary/20 text-text-secondary',
};

// -----------------------------------------------------------------------------
// КОМПОНЕНТ
// -----------------------------------------------------------------------------

/**
 * Бейдж для отображения статуса или категории.
 * 
 * @example
 * // Активный статус
 * <Badge variant="success">Active</Badge>
 * 
 * @example
 * // Черновик
 * <Badge variant="warning">Draft</Badge>
 * 
 * @example
 * // Новая функция
 * <Badge variant="info">New</Badge>
 * 
 * @example
 * // С обрезкой текста и tooltip
 * <Badge variant="warning" truncate maxWidth="80px">
 *   Restored 3
 * </Badge>
 */
export const Badge: React.FC<BadgeProps> = ({
    variant = 'neutral',
    className = '',
    children,
    truncate = false,
    maxWidth,
}) => {
    const textRef = React.useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = React.useState(false);

    React.useEffect(() => {
        if (truncate && textRef.current) {
            const element = textRef.current;
            setIsTruncated(element.scrollWidth > element.clientWidth);
        }
    }, [truncate, children, maxWidth]);

    const classes = [
        baseStyles,
        variantStyles[variant],
        truncate && 'min-w-0',
        className,
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    const style = maxWidth ? { maxWidth } : undefined;

    const badgeContent = (
        <span className={classes} style={style} title="">
            {truncate ? (
                <span
                    ref={textRef}
                    className="overflow-hidden text-ellipsis whitespace-nowrap inline-block max-w-full"
                >
                    {children}
                </span>
            ) : (
                children
            )}
        </span>
    );

    // Show tooltip with full text only when actually truncated
    if (truncate && isTruncated) {
        return (
            <PortalTooltip
                content={children}
                variant="glass"
                side="top"
                align="center"
                enterDelay={300}
                triggerClassName="inline-flex min-w-0"
                title=""
            >
                {badgeContent}
            </PortalTooltip>
        );
    }

    return badgeContent;
};

// Экспорт типов
export type { BadgeProps, BadgeVariant };
