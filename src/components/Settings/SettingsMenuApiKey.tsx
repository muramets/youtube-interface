import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

interface SettingsMenuApiKeyProps {
    onBack: () => void;
}

export const SettingsMenuApiKey: React.FC<SettingsMenuApiKeyProps> = ({ onBack }) => {
    const { generalSettings, updateGeneralSettings } = useSettings();
    const [tempApiKey, setTempApiKey] = useState('');

    useEffect(() => {
        setTempApiKey(generalSettings.apiKey || '');
    }, [generalSettings.apiKey]);

    const handleSaveApiKey = async () => {
        await updateGeneralSettings({ apiKey: tempApiKey });
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
                    className="p-2 rounded border border-border bg-bg-primary text-text-primary w-full box-border focus:outline-none focus:border-blue-500"
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
