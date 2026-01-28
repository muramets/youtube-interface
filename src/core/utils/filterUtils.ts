import type { FilterOperator } from '../stores/filterStore';

export const applyNumericFilter = (value: number, operator: FilterOperator, filterValue: number | [number, number]): boolean => {
    if (operator === 'between') {
        if (Array.isArray(filterValue) && filterValue.length === 2) {
            const [min, max] = filterValue;
            return value >= min && value <= max;
        }
        return false;
    }

    if (typeof filterValue === 'number') {
        switch (operator) {
            case 'gte': return value >= filterValue;
            case 'lte': return value <= filterValue;
            case 'gt': return value > filterValue;
            case 'lt': return value < filterValue;
            case 'equals': return value === filterValue;
            default: return true;
        }
    }

    return true;
};
