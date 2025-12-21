import React from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useSettings } from '../../core/hooks/useSettings';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';

interface SettingsMenuAppearanceProps {
    onBack: () => void;
}

export const SettingsMenuAppearance: React.FC<SettingsMenuAppearanceProps> = ({ onBack }) => {
    const { generalSettings, updateGeneralSettings } = useSettings();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const theme = generalSettings.theme;

    const handleSetTheme = (newTheme: 'light' | 'dark') => {
        if (user && currentChannel) {
            updateGeneralSettings(user.uid, currentChannel.id, { theme: newTheme });
        }
    };

    return (
        <>
            <div
                className="flex items-center gap-3 px-4 py-2 border-b border-border mb-2 cursor-pointer"
                onClick={onBack}
            >
                <ArrowLeft size={20} />
                <span className="text-sm">Appearance</span>
            </div>

            <div className="pb-2">
                <div className="px-4 py-2 text-xs text-text-secondary">Setting</div>
                <div
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                    onClick={() => handleSetTheme('dark')}
                >
                    <div className="w-5 flex justify-center">
                        {theme === 'dark' && <Check size={18} />}
                    </div>
                    <span>Dark theme</span>
                </div>
                <div
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                    onClick={() => handleSetTheme('light')}
                >
                    <div className="w-5 flex justify-center">
                        {theme === 'light' && <Check size={18} />}
                    </div>
                    <span>Light theme</span>
                </div>
            </div>
        </>
    );
};
