import type { FilterOperator } from '../stores/filterStore';

export const applyNumericFilter = (value: number, operator: FilterOperator, filterValue: any): boolean => {
    switch (operator) {
        case 'gte': return value >= filterValue;
        case 'lte': return value <= filterValue;
        case 'gt': return value > filterValue;
        case 'lt': return value < filterValue;
        case 'equals': return value === filterValue;
        case 'between': {
            const [min, max] = filterValue;
            return value >= min && value <= max;
        }
        default: return true;
    }
};
