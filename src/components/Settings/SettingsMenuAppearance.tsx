import React from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface SettingsMenuAppearanceProps {
    onBack: () => void;
}

export const SettingsMenuAppearance: React.FC<SettingsMenuAppearanceProps> = ({ onBack }) => {
    const { theme, setTheme } = useTheme();

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
                    onClick={() => setTheme('dark')}
                >
                    <div className="w-5 flex justify-center">
                        {theme === 'dark' && <Check size={18} />}
                    </div>
                    <span>Dark theme</span>
                </div>
                <div
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                    onClick={() => setTheme('light')}
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
