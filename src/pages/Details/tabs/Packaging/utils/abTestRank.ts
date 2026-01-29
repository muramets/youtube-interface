/**
 * =============================================================================
 * A/B TEST RANKING UTILITY
 * =============================================================================
 * 
 * Общая логика определения ранга результата A/B теста.
 * Используется в:
 *   - ABTitlesDisplay (бейджи Winner/Loser/So-so)
 *   - ABTestingModal (цвет обводки)
 * 
 * ЛОГИКА:
 *   - 2 варианта: winner (max) / loser (min)
 *   - 3+ вариантов: winner / middle / loser
 *   - Если значение 0 или все нули → null (без ранга)
 * 
 * =============================================================================
 */

/**
 * Возможные ранги результата A/B теста.
 * 
 * - 'winner' — наивысший результат (зелёный)
 * - 'loser'  — наименьший результат (красный)
 * - 'middle' — средний результат (жёлтый/оранжевый)
 * - null     — нет данных или нельзя определить
 */
export type ABTestRank = 'winner' | 'middle' | 'loser' | null;

/**
 * Определяет ранг значения среди результатов A/B теста.
 * 
 * @param value — текущее значение (watch time share %)
 * @param results — массив всех значений для сравнения
 * @returns ABTestRank или null
 * 
 * @example
 * getABTestRank(45, [45, 30, 25]); // 'winner'
 * getABTestRank(30, [45, 30, 25]); // 'middle'
 * getABTestRank(25, [45, 30, 25]); // 'loser'
 * getABTestRank(0, [45, 30, 0]);   // null (нет данных)
 */
export const getABTestRank = (value: number, results: number[]): ABTestRank => {
    // Нет данных
    if (results.length === 0) {
        return null;
    }

    // Все нули — нет результатов
    const total = results.reduce((a, b) => a + (b || 0), 0);
    if (total === 0) {
        return null;
    }

    // Это значение равно 0 — нет данных для него
    if (value === 0) {
        return null;
    }

    // Фильтруем ненулевые значения для сравнения
    const nonZeroResults = results.filter(r => r > 0);

    // Нужно минимум 2 значения для сравнения
    if (nonZeroResults.length < 2) {
        return null;
    }

    // Сортируем уникальные значения по убыванию
    const uniqueValues = [...new Set(nonZeroResults)].sort((a, b) => b - a);
    const rank = uniqueValues.indexOf(value);

    // Winner — первое место
    if (rank === 0) {
        return 'winner';
    }

    // Loser — последнее место
    if (rank === uniqueValues.length - 1) {
        return 'loser';
    }

    // Middle — всё что между
    return 'middle';
};

/**
 * Маппинг ранга на CSS класс для обводки (используется в ABTestingModal).
 * 
 * @param rank — ранг из getABTestRank
 * @param defaultClass — класс по умолчанию когда rank = null
 */
export const getRankBorderClass = (
    rank: ABTestRank,
    defaultClass = 'border-[#5F5F5F]'
): string => {
    switch (rank) {
        case 'winner':
            return '!border-green-500';
        case 'middle':
            return '!border-orange-500';
        case 'loser':
            return '!border-red-500';
        default:
            return defaultClass;
    }
};

/**
 * Маппинг ранга на Badge variant (используется в ABTitlesDisplay).
 * 
 * @param rank — ранг из getABTestRank
 * @returns объект с variant и label для Badge, или null
 */
export const getRankBadgeProps = (
    rank: ABTestRank
): { variant: 'success' | 'warning' | 'error'; label: string } | null => {
    switch (rank) {
        case 'winner':
            return { variant: 'success', label: 'Winner' };
        case 'middle':
            return { variant: 'warning', label: 'So-so' };
        case 'loser':
            return { variant: 'error', label: 'Loser' };
        default:
            return null;
    }
};
