/** Tailwind alignment classes for a column's align prop. */
export function alignClass(align?: 'left' | 'right' | 'center'): string {
    if (align === 'right') return 'justify-end text-right';
    if (align === 'center') return 'justify-center text-center';
    return '';
}
