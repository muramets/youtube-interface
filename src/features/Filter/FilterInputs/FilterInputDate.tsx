import React from 'react';
import { DateRangePicker } from '../../../components/ui/molecules/DateRangePicker';

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
    return (
        <DateRangePicker
            initialStartDate={initialStartDate}
            initialEndDate={initialEndDate}
            availableMinDate={availableMinDate}
            availableMaxDate={availableMaxDate}
            onApply={onApply}
            onClose={onClose}
            onRemove={onRemove}
        />
    );
};
