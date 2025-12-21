import { useRef } from 'react';

interface UseFrozenValueParams<T, D extends any[] = []> {
    value: T;
    version: number;
    dependencies?: D;
    shouldUpdate?: (prev: { value: T; version: number; dependencies: D }, next: { value: T; version: number; dependencies: D }) => boolean;
}

/**
 * A hook that holds onto a value and only updates it when the version changes, 
 * or optionally when other dependencies change, relative to the last "frozen" state.
 * 
 * This is useful when we calculate a heavy object (like a layout structure) and want to 
 * keep returning the *same instance* even if the inputs technically change, unless 
 * a specific "version" signal (like a force-update counter) increments.
 */
export function useFrozenValue<T, D extends any[] = []>({
    value,
    version,
    dependencies = [] as unknown as D,
    shouldUpdate
}: UseFrozenValueParams<T, D>): T {
    const ref = useRef<{
        version: number;
        value: T;
        dependencies: D;
        initialized: boolean;
    } | null>(null);

    const currentDeps = dependencies;
    const prevEntry = ref.current;

    let needsUpdate = false;

    if (!prevEntry || !prevEntry.initialized) {
        needsUpdate = true;
    } else if (prevEntry.version !== version) {
        needsUpdate = true;
    } else if (shouldUpdate) {
        // Custom update logic if provided
        needsUpdate = shouldUpdate(
            { value: prevEntry.value, version: prevEntry.version, dependencies: prevEntry.dependencies },
            { value, version, dependencies: currentDeps }
        );
    } else {
        // Default dependency check: shallow compare if array length matches
        // (Though usually we rely on version for the heavy lifting here as per original code pattern)
        if (prevEntry.dependencies.length !== currentDeps.length) {
            needsUpdate = true;
        } else {
            // Simple shallow equality check for deps
            for (let i = 0; i < currentDeps.length; i++) {
                if (prevEntry.dependencies[i] !== currentDeps[i]) {
                    needsUpdate = true;
                    break;
                }
            }
        }
    }

    // Special case from original code: specific overrides like "wasEmpty" check
    // Logic: If the previous value was generated from "empty data" but now we have data, update.
    // We can handle this by letting the caller pass `dependencies` that include `data.length > 0`.
    // Or we implicitly update if the *value* seems "initialized" vs "uninitialized".

    // BUT the original code used specific refs like `frozenWorldWidthRef`.
    // Let's stick effectively to the pattern:
    // If version changed OR dependencies changed -> Update.

    if (needsUpdate) {
        ref.current = {
            version,
            value,
            dependencies: currentDeps,
            initialized: true
        };
    }

    return ref.current!.value;
}
