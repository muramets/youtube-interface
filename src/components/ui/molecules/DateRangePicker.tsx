import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface DateRangePickerProps {
    /** Initial start date (timestamp) */
    initialStartDate?: number;
    /** Initial end date (timestamp) */
    initialEndDate?: number;
    /** Minimum selectable date (timestamp) */
    availableMinDate?: number;
    /** Maximum selectable date (timestamp) */
    availableMaxDate?: number;
    /** Called when user clicks Apply with selected range */
    onApply: (startTimestamp: number, endTimestamp: number) => void;
    /** Called when user clicks Cancel */
    onClose: () => void;
    /** If provided, shows a Remove button when no selection */
    onRemove?: () => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
    initialStartDate,
    initialEndDate,
    availableMinDate,
    availableMaxDate,
    onApply,
    onClose,
    onRemove
}) => {
    const [view, setView] = useState<'calendar' | 'years'>('calendar');

    const [currentDate, setCurrentDate] = useState(() => {
        if (initialStartDate) return new Date(initialStartDate);
        if (availableMaxDate) return new Date(availableMaxDate);
        return new Date();
    });

    const [selectionStart, setSelectionStart] = useState<Date | null>(() =>
        initialStartDate ? new Date(initialStartDate) : null
    );
    const [selectionEnd, setSelectionEnd] = useState<Date | null>(() =>
        initialEndDate ? new Date(initialEndDate) : null
    );

    // Calculate available years
    const availableYears = useMemo(() => {
        if (!availableMinDate || !availableMaxDate) return [];
        const minYear = new Date(availableMinDate).getFullYear();
        const maxYear = new Date(availableMaxDate).getFullYear();
        const years: number[] = [];
        for (let y = minYear; y <= maxYear; y++) {
            years.push(y);
        }
        return years;
    }, [availableMinDate, availableMaxDate]);

    const showYearSwitcher = availableYears.length > 1;

    const getDaysInMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date: Date) => {
        // Monday = 0, Tuesday = 1, ..., Sunday = 6
        return (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7;
    };

    const handleDateClick = (day: number) => {
        const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);

        if (!selectionStart || (selectionStart && selectionEnd)) {
            setSelectionStart(clickedDate);
            setSelectionEnd(null);
        } else {
            if (clickedDate.getTime() === selectionStart.getTime()) {
                setSelectionStart(null);
                setSelectionEnd(null);
                return;
            }

            if (clickedDate < selectionStart) {
                setSelectionEnd(selectionStart);
                setSelectionStart(clickedDate);
            } else {
                setSelectionEnd(clickedDate);
            }
        }
    };

    const isSelected = (day: number) => {
        if (!selectionStart) return false;
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        if (date.getTime() === selectionStart.getTime()) return true;
        if (selectionEnd && date.getTime() === selectionEnd.getTime()) return true;
        if (selectionStart && selectionEnd) {
            return date > selectionStart && date < selectionEnd;
        }
        return false;
    };

    const isRangeStart = (day: number) => {
        if (!selectionStart) return false;
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        return date.getTime() === selectionStart.getTime();
    };

    const isRangeEnd = (day: number) => {
        if (!selectionEnd) return false;
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        return date.getTime() === selectionEnd.getTime();
    };

    const handleApply = () => {
        if (selectionStart) {
            const end = selectionEnd || selectionStart;
            const endTimestamp = new Date(end);
            endTimestamp.setHours(23, 59, 59, 999);
            onApply(selectionStart.getTime(), endTimestamp.getTime());
        }
    };

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleYearSelect = (selectedYear: number) => {
        setCurrentDate(new Date(selectedYear, currentDate.getMonth(), 1));
        setView('calendar');
    };

    const handleRemove = () => {
        if (onRemove) onRemove();
    };

    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const monthName = currentDate.toLocaleString('default', { month: 'short' }).toUpperCase();
    const year = currentDate.getFullYear();

    return (
        <div className="p-4 w-[280px] bg-bg-secondary">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <button
                    onClick={() => showYearSwitcher && setView(view === 'calendar' ? 'years' : 'calendar')}
                    className={`flex items-center gap-2 text-sm font-bold text-text-primary transition-colors rounded px-2 py-1 -ml-2 ${showYearSwitcher ? 'hover:bg-hover-bg cursor-pointer' : 'cursor-default'}`}
                >
                    <span>{monthName} {year}</span>
                    {showYearSwitcher && (
                        <CalendarIcon size={14} className={`text-text-tertiary transition-transform ${view === 'years' ? 'rotate-180' : ''}`} />
                    )}
                </button>

                {view === 'calendar' && (
                    <div className="flex gap-2">
                        <button onClick={prevMonth} className="p-1 hover:bg-hover-bg rounded-full text-text-primary transition-colors">
                            <ChevronLeft size={16} />
                        </button>
                        <button onClick={nextMonth} className="p-1 hover:bg-hover-bg rounded-full text-text-primary transition-colors">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>

            {view === 'years' ? (
                <div className="grid grid-cols-3 gap-2 mb-4 h-[240px] overflow-y-auto custom-scrollbar">
                    {availableYears.map(y => (
                        <button
                            key={y}
                            onClick={() => handleYearSelect(y)}
                            className={`
                                py-2 px-1 rounded-lg text-sm font-medium transition-colors
                                ${y === year
                                    ? 'bg-hover-bg text-text-primary border border-border'
                                    : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                                }
                            `}
                        >
                            {y}
                        </button>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-7 gap-y-2 mb-4">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                        <div key={i} className="text-center text-xs text-text-tertiary font-medium">{d}</div>
                    ))}

                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const selected = isSelected(day);
                        const rangeStart = isRangeStart(day);
                        const rangeEnd = isRangeEnd(day);
                        const inRange = selected && !rangeStart && !rangeEnd;

                        return (
                            <div key={day} className={`flex items-center justify-center w-full h-8 ${inRange ? 'bg-hover-bg' : ''} ${rangeStart && selectionEnd ? 'bg-gradient-to-r from-transparent to-hover-bg from-50%' : ''} ${rangeEnd && selectionStart ? 'bg-gradient-to-l from-transparent to-hover-bg from-50%' : ''}`}>
                                <button
                                    onClick={() => handleDateClick(day)}
                                    className={`
                                        h-8 w-8 text-sm flex items-center justify-center relative transition-colors z-10
                                        ${rangeStart ? 'bg-text-primary text-bg-primary font-bold rounded-full' : ''}
                                        ${rangeEnd ? 'bg-text-primary text-bg-primary font-bold rounded-full' : ''}
                                        ${!selected ? 'text-text-primary hover:bg-hover-bg rounded-full' : ''}
                                        ${inRange ? 'bg-hover-bg text-text-primary rounded-none w-full h-full' : ''}
                                    `}
                                >
                                    {day}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border gap-2">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-text-secondary font-medium hover:text-text-primary transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={selectionStart ? handleApply : handleRemove}
                    disabled={!selectionStart && !onRemove}
                    className="bg-hover-bg text-text-primary font-medium px-4 py-2 rounded-full text-sm hover:bg-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {!selectionStart && onRemove ? 'Remove' : 'Apply'}
                </button>
            </div>
        </div>
    );
};
