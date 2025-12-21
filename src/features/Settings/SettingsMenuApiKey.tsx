import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useSettings } from '../../core/hooks/useSettings';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';

interface SettingsMenuApiKeyProps {
    onBack: () => void;
}

export const SettingsMenuApiKey: React.FC<SettingsMenuApiKeyProps> = ({ onBack }) => {
    const { generalSettings, updateGeneralSettings } = useSettings();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const [tempApiKey, setTempApiKey] = useState('');

    useEffect(() => {
        setTimeout(() => setTempApiKey(generalSettings.apiKey || ''), 0);
    }, [generalSettings.apiKey]);

    const handleSaveApiKey = async () => {
        if (user && currentChannel) {
            await updateGeneralSettings(user.uid, currentChannel.id, { apiKey: tempApiKey });
        }
        onBack();
    };

    return (
        <>
            <div
                className="flex items-center gap-3 px-4 py-2 border-b border-border mb-2 cursor-pointer"
                onClick={onBack}
            >
                <ArrowLeft size={20} />
                <span className="text-sm">API Key</span>
            </div>

            <div className="p-4 flex flex-col gap-3">
                <div className="text-sm text-text-secondary">
                    Enter your YouTube Data API v3 Key:
                </div>
                <input
                    type="text"
                    className="p-2 rounded border border-border bg-bg-primary text-text-primary w-full box-border focus:outline-none focus:border-text-primary"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                />
                <button
                    className="px-4 py-2 rounded-full border-none bg-[#3ea6ff] text-black font-bold cursor-pointer self-end hover:bg-[#3ea6ff]/90 transition-colors"
                    onClick={handleSaveApiKey}
                >
                    Save
                </button>
            </div>
        </>
    );
};
