/**
 * Performs a deep comparison between two values to determine if they are equivalent.
 * Optimized for JSON-like objects (primitives, arrays, plain objects).
 * 
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns true if the values are equivalent, false otherwise
 */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
        return false;
    }

    if (Array.isArray(a) !== Array.isArray(b)) {
        return false;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }

    // Both are objects
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
        if (!deepEqual(objA[key], objB[key])) return false;
    }

    return true;
}
