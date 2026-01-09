import { useState, useCallback, startTransition } from 'react';

/**
 * Хук для управления выбором строк в таблице трафика.
 * Поддерживает выбор отдельных строк и массовый выбор/снятие выбора.
 */
export const useTrafficSelection = () => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    /**
     * Переключает выбор одной строки
     */
    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    /**
     * Переключает выбор всех строк.
     * Использует startTransition для плавности UI при большом количестве строк.
     */
    const toggleAll = useCallback((ids: string[]) => {
        startTransition(() => {
            setSelectedIds(prev => {
                // Если все выбраны -> снимаем выбор
                if (ids.every(i => prev.has(i))) {
                    return new Set();
                }
                // Иначе выбираем все
                return new Set(ids);
            });
        });
    }, []);

    /**
     * Очищает выбор
     */
    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    return {
        selectedIds,
        toggleSelection,
        toggleAll,
        clearSelection
    };
};
