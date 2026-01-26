import { useState } from 'react';

interface UseFrozenValueParams<T, D extends unknown[] = []> {
    value: T;
    version: number;
    dependencies?: D;
    shouldUpdate?: (prev: { value: T; version: number; dependencies: D }, next: { value: T; version: number; dependencies: D }) => boolean;
}

/**
 * A hook that holds onto a value and only updates it when the version changes, 
 * or optionally when other dependencies change, relative to the last "frozen" state.
 * 
 * Uses Render-Phase Updates via useState to ensure safety and stability.
 */
export function useFrozenValue<T, D extends unknown[] = []>({
    value,
    version,
    dependencies = [] as unknown as D,
    shouldUpdate
}: UseFrozenValueParams<T, D>): T {
    const [frozen, setFrozen] = useState<{
        value: T;
        version: number;
        dependencies: D;
    }>({
        value,
        version,
        dependencies
    });

    let needsUpdate = false;

    // Check conditions against CURRENT state (frozen)
    if (frozen.version !== version) {
        needsUpdate = true;
    } else if (shouldUpdate) {
        // Custom update logic
        // Note: We use the *new* value/deps from props for the "next" state
        needsUpdate = shouldUpdate(
            { value: frozen.value, version: frozen.version, dependencies: frozen.dependencies },
            { value, version, dependencies }
        );
    } else {
        // Default dependency check: shallow compare
        if (frozen.dependencies.length !== dependencies.length) {
            needsUpdate = true;
        } else {
            for (let i = 0; i < dependencies.length; i++) {
                if (frozen.dependencies[i] !== dependencies[i]) {
                    needsUpdate = true;
                    break;
                }
            }
        }
    }

    if (needsUpdate) {
        const newState = { value, version, dependencies };
        setFrozen(newState);
        return value; // Return new value immediately
    }

    return frozen.value;
}
