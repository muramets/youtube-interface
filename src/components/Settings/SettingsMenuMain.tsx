import React from 'react';
import { ChevronRight, Moon, Sun, RefreshCw, Copy, Key } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';

interface SettingsMenuMainProps {
    onNavigate: (view: 'appearance' | 'sync' | 'clone' | 'apiKey') => void;
}

export const SettingsMenuMain: React.FC<SettingsMenuMainProps> = ({ onNavigate }) => {
    const { generalSettings } = useSettings();
    const theme = generalSettings.theme;

    return (
        <>
            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-hover-bg text-sm"
                onClick={() => onNavigate('appearance')}
            >
                <div className="flex items-center gap-3">
                    {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                    <span>Appearance: {theme === 'dark' ? 'Dark' : 'Light'}</span>
                </div>
                <ChevronRight size={20} />
            </div>

            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-hover-bg text-sm"
                onClick={() => onNavigate('sync')}
            >
                <div className="flex items-center gap-3">
                    <RefreshCw size={20} />
                    <span>Sync Settings</span>
                </div>
                <ChevronRight size={20} />
            </div>

            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-hover-bg text-sm"
                onClick={() => onNavigate('clone')}
            >
                <div className="flex items-center gap-3">
                    <Copy size={20} />
                    <span>Clone Settings</span>
                </div>
                <ChevronRight size={20} />
            </div>

            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-hover-bg text-sm"
                onClick={() => onNavigate('apiKey')}
            >
                <div className="flex items-center gap-3">
                    <Key size={20} />
                    <span>API Key</span>
                </div>
                <ChevronRight size={20} />
            </div>
        </>
    );
};
