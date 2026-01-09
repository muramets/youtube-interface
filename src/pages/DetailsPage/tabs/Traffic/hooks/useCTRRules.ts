import { useState, useEffect } from 'react';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import { useSettings } from '../../../../../core/hooks/useSettings';
import { PRESET_COLORS } from '../utils/constants';
import type { CTRRule } from '../../../../../core/services/settingsService';

/**
 * Хук для управления CTR правилами.
 * Инкапсулирует всю бизнес-логику работы с правилами:
 * - Загрузка из настроек
 * - Добавление, обновление, удаление
 * - Сохранение в Firestore
 * - Отслеживание изменений
 */
export const useCTRRules = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { trafficSettings, updateTrafficSettings } = useSettings();

    const [rules, setRules] = useState<CTRRule[]>([]);
    const [hasChanges, setHasChanges] = useState(false);

    // Синхронизация с настройками
    useEffect(() => {
        const loadedRules = trafficSettings?.ctrRules || [];
        setRules(loadedRules);
        setHasChanges(false);
    }, [trafficSettings]);

    /**
     * Сохраняет правила в Firestore
     */
    const saveRules = async (newRules: CTRRule[]) => {
        if (!user?.uid || !currentChannel?.id) return;

        try {
            await updateTrafficSettings(user.uid, currentChannel.id, { ctrRules: newRules });
            setRules(newRules);
            setHasChanges(false);
        } catch (e) {
            console.error("Failed to save CTR rules", e);
        }
    };

    /**
     * Добавляет новое правило с умными дефолтами
     */
    const addRule = () => {
        const lastRule = rules[rules.length - 1];
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
            ...rules,
            { id: crypto.randomUUID(), operator: '<' as const, value: nextValue, color: nextColor }
        ];

        saveRules(newRules);
    };

    /**
     * Обновляет существующее правило
     */
    const updateRule = (id: string, updates: Partial<CTRRule>) => {
        const newRules = rules.map(r => {
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
        const newRules = rules.filter(r => r.id !== id);
        saveRules(newRules);
    };

    /**
     * Переупорядочивает правила (для drag-and-drop)
     */
    const reorderRules = (newRules: CTRRule[]) => {
        saveRules(newRules);
    };

    return {
        rules,
        hasChanges,
        addRule,
        updateRule,
        removeRule,
        reorderRules
    };
};
