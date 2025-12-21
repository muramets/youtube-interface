/**
 * Calculate the due date for a check-in based on video publish time and rule duration.
 * 
 * Logic:
 * 1. Calculate base due time: publishTime + hoursAfterPublish
 * 2. If calculated time < 12:00 local time → adjust to 12:00 same day
 * 3. If calculated time >= 12:00 local time → keep as is
 * 
 * This accounts for YouTube Analytics updating at 12:00 local time.
 */
export const calculateDueDate = (publishedAt: string, hoursAfterPublish: number): number => {
    const publishTime = new Date(publishedAt).getTime();
    const baseDueTime = publishTime + (hoursAfterPublish * 60 * 60 * 1000);

    const dueDate = new Date(baseDueTime);
    const dueHour = dueDate.getHours();

    // If the due time is before 12:00, push it to 12:00 same day
    if (dueHour < 12) {
        dueDate.setHours(12, 0, 0, 0);
        return dueDate.getTime();
    }

    // Otherwise, keep the original time
    return baseDueTime;
};
