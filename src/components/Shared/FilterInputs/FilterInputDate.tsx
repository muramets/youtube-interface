import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface FilterInputDateProps {
    availableMinDate?: number;
    availableMaxDate?: number;
    initialStartDate?: number;
    initialEndDate?: number;
    onApply: (startTimestamp: number, endTimestamp: number) => void;
    onRemove?: () => void;
    onClose: () => void;
}

export const FilterInputDate: React.FC<FilterInputDateProps> = ({
    availableMinDate,
    availableMaxDate,
    initialStartDate,
    initialEndDate,
    onApply,
    onRemove,
    onClose
}) => {
    // Current view state
    const [view, setView] = useState<'calendar' | 'years'>('calendar');

    // Initialize dates
    const [currentDate, setCurrentDate] = useState(() => {
        if (initialStartDate) return new Date(initialStartDate);
        if (availableMaxDate) return new Date(availableMaxDate);
        return new Date();
    });

    const [selectionStart, setSelectionStart] = useState<Date | null>(() => initialStartDate ? new Date(initialStartDate) : null);
    const [selectionEnd, setSelectionEnd] = useState<Date | null>(() => initialEndDate ? new Date(initialEndDate) : null);

    // Calculate available years
    const availableYears = React.useMemo(() => {
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
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    };

    const handleDateClick = (day: number) => {
        const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);

        if (!selectionStart || (selectionStart && selectionEnd)) {
            // Start new selection
            setSelectionStart(clickedDate);
            setSelectionEnd(null);
        } else {
            // Check for toggle off (clicking the start date again)
            if (clickedDate.getTime() === selectionStart.getTime()) {
                setSelectionStart(null);
                setSelectionEnd(null);
                return;
            }

            // Complete selection
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

        // Check exact start
        if (date.getTime() === selectionStart.getTime()) return true;

        // Check exact end
        if (selectionEnd && date.getTime() === selectionEnd.getTime()) return true;

        // Check range
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
            // Set end time to end of day
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

    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const monthName = currentDate.toLocaleString('default', { month: 'short' }).toUpperCase();
    const year = currentDate.getFullYear();

    const handleRemove = () => {
        if (onRemove) onRemove();
    };

    const handleYearSelect = (selectedYear: number) => {
        setCurrentDate(new Date(selectedYear, currentDate.getMonth(), 1));
        setView('calendar');
    };

    return (
        <div className="p-4 w-[280px] bg-[#1F1F1F]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <button
                    onClick={() => showYearSwitcher && setView(view === 'calendar' ? 'years' : 'calendar')}
                    className={`flex items-center gap-2 text-sm font-bold text-white transition-colors rounded px-2 py-1 -ml-2 ${showYearSwitcher ? 'hover:bg-[#333333] cursor-pointer' : 'cursor-default'}`}
                >
                    <span>{monthName} {year}</span>
                    {showYearSwitcher && (
                        <CalendarIcon size={14} className={`text-[#AAAAAA] transition-transform ${view === 'years' ? 'rotate-180' : ''}`} />
                    )}
                </button>

                {view === 'calendar' && (
                    <div className="flex gap-2">
                        <button onClick={prevMonth} className="p-1 hover:bg-[#333333] rounded-full text-white transition-colors">
                            <ChevronLeft size={16} />
                        </button>
                        <button onClick={nextMonth} className="p-1 hover:bg-[#333333] rounded-full text-white transition-colors">
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
                                    ? 'bg-[#333333] text-white border border-[#444444]'
                                    : 'text-[#AAAAAA] hover:bg-[#2A2A2A] hover:text-white'
                                }
                            `}
                        >
                            {y}
                        </button>
                    ))}
                </div>
            ) : (
                /* Days Grid */
                <div className="grid grid-cols-7 gap-y-2 mb-4">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                        <div key={d} className="text-center text-xs text-[#AAAAAA] font-medium">{d}</div>
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
                            <div key={day} className={`flex items-center justify-center w-full h-8 ${inRange ? 'bg-[#333333]' : ''} ${rangeStart && selectionEnd ? 'bg-gradient-to-r from-transparent to-[#333333] from-50%' : ''} ${rangeEnd && selectionStart ? 'bg-gradient-to-l from-transparent to-[#333333] from-50%' : ''}`}>
                                <button
                                    onClick={() => handleDateClick(day)}
                                    className={`
                                        h-8 w-8 text-sm flex items-center justify-center relative transition-colors z-10
                                        ${rangeStart ? 'bg-white text-black font-bold rounded-full' : ''}
                                        ${rangeEnd ? 'bg-white text-black font-bold rounded-full' : ''}
                                        ${!selected ? 'text-white hover:bg-[#333333] rounded-full' : ''}
                                        ${inRange ? 'bg-[#333333] text-white rounded-none w-full h-full' : ''}
                                    `}
                                >
                                    {day}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex justify-end pt-2 border-t border-[#333333] gap-2">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-[#AAAAAA] font-medium hover:text-white transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={selectionStart ? handleApply : handleRemove}
                    disabled={!selectionStart && !onRemove}
                    className="bg-[#333333] text-white font-medium px-4 py-2 rounded-full text-sm hover:bg-[#444444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {!selectionStart && onRemove ? 'Remove' : 'Apply'}
                </button>
            </div>
        </div>
    );
};
