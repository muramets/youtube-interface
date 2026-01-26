import { useState, useEffect } from 'react';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import { useSettings } from '../../../../../core/hooks/useSettings';
import { PRESET_COLORS } from '../utils/constants';
import type { CTRRule } from '../../../../../core/services/settingsService';

/**
 * Хук для управления CTR правилами.
 */
export const useCTRRules = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { trafficSettings, updateTrafficSettings } = useSettings();

    // Local optimistic state to prevent jitter during drag-and-drop
    const [localRules, setLocalRules] = useState<CTRRule[]>([]);

    // Sync local state with store on load / external update
    useEffect(() => {
        if (trafficSettings?.ctrRules) {
            setLocalRules(trafficSettings.ctrRules);
        }
    }, [trafficSettings?.ctrRules]);

    const hasChanges = false; // Kept for API compatibility, though currently unused

    /**
     * Сохраняет правила в Firestore
     */
    const saveRules = async (newRules: CTRRule[]) => {
        // 1. Optimistic Update
        setLocalRules(newRules);

        if (!user?.uid || !currentChannel?.id) return;

        try {
            // 2. Persist to Backend
            await updateTrafficSettings(user.uid, currentChannel.id, { ctrRules: newRules });
        } catch (e) {
            console.error("Failed to save CTR rules", e);
            // Revert on error
            if (trafficSettings?.ctrRules) {
                setLocalRules(trafficSettings.ctrRules);
            }
        }
    };

    /**
     * Добавляет новое правило с умными дефолтами
     */
    const addRule = () => {
        const lastRule = localRules[localRules.length - 1];
        let nextValue = 5;
        let nextColor = PRESET_COLORS[0];

        if (lastRule) {
            nextValue = lastRule.value + 1;
            const colorIndex = PRESET_COLORS.indexOf(lastRule.color);
            if (colorIndex !== -1) {
                nextColor = PRESET_COLORS[(colorIndex + 1) % PRESET_COLORS.length];
            }
        }

        const newRules = [
            ...localRules,
            { id: crypto.randomUUID(), operator: '<' as const, value: nextValue, color: nextColor }
        ];

        saveRules(newRules);
    };

    /**
     * Обновляет существующее правило
     */
    const updateRule = (id: string, updates: Partial<CTRRule>) => {
        const newRules = localRules.map(r => {
            if (r.id !== id) return r;

            const updated = { ...r, ...updates };

            // Валидация: CTR не может быть больше 100%
            if (updated.value > 100) updated.value = 100;
            if (updated.maxValue !== undefined && updated.maxValue > 100) {
                updated.maxValue = 100;
            }

            return updated;
        });

        saveRules(newRules);
    };

    /**
     * Удаляет правило
     */
    const removeRule = (id: string) => {
        const newRules = localRules.filter(r => r.id !== id);
        saveRules(newRules);
    };

    /**
     * Переупорядочивает правила (для drag-and-drop)
     */
    const reorderRules = (newRules: CTRRule[]) => {
        saveRules(newRules);
    };

    return {
        rules: localRules,
        hasChanges,
        addRule,
        updateRule,
        removeRule,
        reorderRules
    };
};
