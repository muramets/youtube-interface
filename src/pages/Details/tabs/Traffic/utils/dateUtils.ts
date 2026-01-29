export const formatPremiumPeriod = (start: number, end: number | null): string => {
    // If no specific start date, fallback (shouldn't happen for valid periods)
    if (!start) return 'Restored';

    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;
    const now = new Date();

    // Helper to format month (JAN, FEB...)
    const getMonth = (date: Date) => date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();

    // Helper to format day (numeric)
    const getDay = (date: Date) => date.getDate();

    // Helper to format time (09:15)
    const getTime = (date: Date) => date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    // Helper to get Year
    const getYear = (date: Date) => date.getFullYear();

    // If active (no end date), usually we just show "Active" or start date?
    // But for "Restored" badge, it implies a past period. 
    // If a restored version is currently active, it typically gets the "Active" badge, not "Restored".
    // However, if we are asked to format a period that IS active for some reason:
    if (!endDate) {
        // Fallback for active periods if this function is called: "Active since JAN 9"
        // But the user requested "Jan 9 - ..." style.
        // Assuming this function is primarily for CLOSED periods (Restored history).
        // If it's active, maybe just return start date?
        return `${getMonth(startDate)} ${getDay(startDate)} - NOW`;
    }

    const startYear = getYear(startDate);
    const endYear = getYear(endDate);
    const currentYear = getYear(now);

    // Filter out "Restored" text if we have valid dates? 
    // The user said "Текст restored останется как fail back". 
    // So if we return a string here, it replaces "Restored".

    // Case 1: Same Day -> JAN 9 • 09:15 - 11:20
    const isSameDay =
        startDate.getDate() === endDate.getDate() &&
        startDate.getMonth() === endDate.getMonth() &&
        startDate.getFullYear() === endDate.getFullYear();

    if (isSameDay) {
        return `${getMonth(startDate)} ${getDay(startDate)} • ${getTime(startDate)} - ${getTime(endDate)}`;
    }

    // Case 2: Same Month, Different Days -> JAN 9 - 11 2026
    const isSameMonth =
        startDate.getMonth() === endDate.getMonth() &&
        startDate.getFullYear() === endDate.getFullYear();

    if (isSameMonth) {
        // Show year if distinct from current year OR if it mimics the user example explicitly
        // User example: JAN 9 - 11 2026. 
        // We will show year if it's NOT current year.
        const showYear = startYear !== currentYear;
        const yearStr = showYear ? ` ${startYear}` : '';
        return `${getMonth(startDate)} ${getDay(startDate)} - ${getDay(endDate)}${yearStr}`;
    }

    // Case 3: Different Months (Same Year) -> JAN 9 - FEB 1 2026
    const isSameYear = startDate.getFullYear() === endDate.getFullYear();
    if (isSameYear) {
        const showYear = startYear !== currentYear;
        const yearStr = showYear ? ` ${startYear}` : '';
        return `${getMonth(startDate)} ${getDay(startDate)} - ${getMonth(endDate)} ${getDay(endDate)}${yearStr}`;
    }

    // Case 4: Different Years -> DEC 31 2025 - JAN 2 2026
    return `${getMonth(startDate)} ${getDay(startDate)} ${startYear} - ${getMonth(endDate)} ${getDay(endDate)} ${endYear}`;
};
