/**
 * Форматирует длительность из секунд в формат HH:MM:SS
 * 
 * @param duration - Длительность в секундах или уже отформатированная строка
 * @returns Отформатированная строка в формате HH:MM:SS
 * 
 * @example
 * formatDuration("3661") // "01:01:01"
 * formatDuration("01:01:01") // "01:01:01" (уже отформатирована)
 */
export const formatDuration = (duration: string): string => {
    // Если уже отформатирована (HH:MM:SS), возвращаем как есть
    if (duration.includes(':')) return duration;

    // Иначе парсим секунды и форматируем
    const seconds = parseInt(duration);
    if (isNaN(seconds)) return duration;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Конвертирует длительность в секунды для сортировки
 * 
 * @param duration - Длительность в формате HH:MM:SS или секундах
 * @returns Количество секунд
 * 
 * @example
 * durationToSeconds("01:01:01") // 3661
 * durationToSeconds("3661") // 3661
 */
/**
 * Parses ISO 8601 duration (e.g., PT1H2M10S) to total seconds.
 */
export const parseISODuration = (duration: string): number => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');

    return hours * 3600 + minutes * 60 + seconds;
};

/**
 * Конвертирует длительность в секунды для сортировки
 * 
 * @param duration - Длительность в формате HH:MM:SS, ISO 8601 или секундах
 * @returns Количество секунд
 */
export const durationToSeconds = (duration: string): number => {
    if (!duration) return 0;

    // ISO 8601 format (PT...)
    if (duration.startsWith('PT')) {
        return parseISODuration(duration);
    }

    // Если уже в секундах
    if (!duration.includes(':')) return parseInt(duration) || 0;

    // Парсим формат HH:MM:SS или MM:SS
    const parts = duration.split(':').map(p => parseInt(p) || 0);

    if (parts.length === 3) {
        // HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
        // MM:SS
        return parts[0] * 60 + parts[1];
    }

    // Только секунды
    return parts[0] || 0;
};
