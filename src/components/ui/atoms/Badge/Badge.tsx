import React from 'react';
import { PortalTooltip } from '../PortalTooltip';

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
     * Кастомный цвет бейджа (HEX, RGB и т.д.).
     * Если указан, перекрывает цвета варианта.
     */
    color?: string;

    /**
     * Дополнительные CSS-классы.
     */
    className?: string;

    /**
     * Содержимое бейджа (текст).
     */
    children: React.ReactNode;

    /**
     * Максимальная ширина бейджа. Если не указана, используется max-w-full.
     * @example "80px", "100px"
     */
    maxWidth?: string;

    /**
     * Disable internal tooltip even if truncated.
     * Useful when the badge is wrapped in a custom tooltip.
     */
    disableTooltip?: boolean;
}

// -----------------------------------------------------------------------------
// СТИЛИ
// -----------------------------------------------------------------------------

/**
 * Базовые классы для всех бейджей.
 */
const baseStyles = `
    flex items-center
    px-1 py-0.5
    text-[9px] font-bold uppercase tracking-wider
    rounded
    w-fit
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
    color,
    className = '',
    children,
    maxWidth,
    disableTooltip = false,
}) => {
    const textRef = React.useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = React.useState(false);

    React.useEffect(() => {
        if (!textRef.current) return;

        const checkTruncation = () => {
            if (textRef.current) {
                const element = textRef.current;
                const isOverflowing = element.scrollWidth > element.clientWidth ||
                    Array.from(element.children).some(child => child.scrollWidth > child.clientWidth);
                setIsTruncated(isOverflowing);
            }
        };

        // Initial check
        checkTruncation();

        // Observe layout changes
        const observer = new ResizeObserver(checkTruncation);
        observer.observe(textRef.current);

        return () => observer.disconnect();
    }, [children, maxWidth]);

    const classes = [
        baseStyles,
        !color && variantStyles[variant],
        'min-w-0 max-w-full overflow-hidden',
        className,
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    const style: React.CSSProperties = {
        ...(maxWidth ? { maxWidth } : {}),
        ...(color ? {
            backgroundColor: `${color}33`, // 20% opacity like variantStyles
            color: color,
        } : {})
    };

    const badgeContent = (
        <span className={classes} style={style} title="">
            <span
                ref={textRef}
                className="flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-full"
                style={color ? { filter: 'brightness(1.5) saturate(1.2)' } : undefined}
            >
                {React.Children.map(children, child => {
                    if (typeof child === 'string' || typeof child === 'number') {
                        return <span className="truncate min-w-0">{child}</span>;
                    }
                    return child;
                })}
            </span>
        </span>
    );

    // Show tooltip with full text only when actually truncated AND not disabled
    if (isTruncated && !disableTooltip) {
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
