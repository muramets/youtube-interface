/**
 * Константы для таблицы трафика
 */
export const TRAFFIC_TABLE = {
    /** Высота одной строки в пикселях */
    ROW_HEIGHT: 44,
    /** Количество строк для предзагрузки вне viewport */
    OVERSCAN_COUNT: 10
} as const;

/**
 * Задержки для улучшения UX
 */
export const UX_DELAYS = {
    /** Минимальная задержка при обработке CSV для плавности анимации загрузки */
    CSV_PROCESSING_MIN: 600,
    /** Длительность показа toast-уведомлений */
    TOAST_DURATION: 3000
} as const;

/**
 * Предустановленные цвета для CTR правил
 */
export const PRESET_COLORS: readonly string[] = [
    '#EF4444', // Red
    '#F59E0B', // Amber
    '#e4d90aff', // Yellow
    '#10B981', // Green
    '#3B82F6', // Blue
    '#8B5CF6', // Violet
    '#EC4899', // Pink
];
