import React, { useState } from 'react';
import { ChevronRight, Moon, Sun, Check, ArrowLeft, Key, Monitor } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useVideo } from '../context/VideoContext';
import { useLocation } from 'react-router-dom';
import { Dropdown } from './Shared/Dropdown';

interface SettingsDropdownProps {
    onClose: () => void;
    anchorEl: HTMLElement | null;
}

type MenuView = 'main' | 'appearance' | 'apiKey' | 'cardSize';

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({ onClose, anchorEl }) => {
    const { theme, setTheme } = useTheme();
    const { apiKey, setApiKey, cardsPerRow, updateCardsPerRow } = useVideo();
    const [menuView, setMenuView] = useState<MenuView>('main');
    const [tempApiKey, setTempApiKey] = useState(apiKey);
    const location = useLocation();
    const isWatchPage = location.pathname.startsWith('/watch/');
    const currentCardsPerRow = cardsPerRow;

    const handleSaveApiKey = () => {
        setApiKey(tempApiKey);
        setMenuView('main');
    };

    const renderMainView = () => (
        <>
            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-hover-bg text-sm"
                onClick={() => setMenuView('appearance')}
            >
                <div className="flex items-center gap-3">
                    {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                    <span>Appearance: {theme === 'dark' ? 'Dark' : 'Light'}</span>
                </div>
                <ChevronRight size={20} />
            </div>

            {!isWatchPage && (
                <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-hover-bg text-sm"
                    onClick={() => setMenuView('cardSize')}
                >
                    <div className="flex items-center gap-3">
                        <Monitor size={20} />
                        <span>Card Size</span>
                    </div>
                    <ChevronRight size={20} />
                </div>
            )}

            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-hover-bg text-sm"
                onClick={() => {
                    setTempApiKey(apiKey);
                    setMenuView('apiKey');
                }}
            >
                <div className="flex items-center gap-3">
                    <Key size={20} />
                    <span>API Key</span>
                </div>
                <ChevronRight size={20} />
            </div>
        </>
    );

    const renderAppearanceView = () => (
        <>
            <div
                className="flex items-center gap-3 px-4 py-2 border-b border-border mb-2 cursor-pointer hover:bg-hover-bg"
                onClick={() => setMenuView('main')}
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

    const renderCardSizeView = () => (
        <>
            <div
                className="flex items-center gap-3 px-4 py-2 border-b border-border mb-2 cursor-pointer hover:bg-hover-bg"
                onClick={() => setMenuView('main')}
            >
                <ArrowLeft size={20} />
                <span className="text-sm">Card Size</span>
            </div>

            <div className="p-4 flex flex-col gap-4 items-center">
                <div className="text-sm text-text-secondary">
                    Adjust Grid Size
                </div>
                <div className="flex items-center gap-6">
                    <button
                        className="w-10 h-10 rounded-full border border-border bg-bg-primary text-text-primary text-2xl flex items-center justify-center cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:bg-hover-bg transition-colors"
                        onClick={() => updateCardsPerRow(currentCardsPerRow + 1)}
                        disabled={currentCardsPerRow >= 9}
                    >
                        -
                    </button>
                    <span className="text-2xl font-bold">{currentCardsPerRow}</span>
                    <button
                        className="w-10 h-10 rounded-full border border-border bg-bg-primary text-text-primary text-2xl flex items-center justify-center cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:bg-hover-bg transition-colors"
                        onClick={() => updateCardsPerRow(currentCardsPerRow - 1)}
                        disabled={currentCardsPerRow <= 3}
                    >
                        +
                    </button>
                </div>
                <div className="text-xs text-text-secondary">
                    Current: {currentCardsPerRow} cards per row
                </div>
            </div>
        </>
    );

    const renderApiKeyView = () => (
        <>
            <div
                className="flex items-center gap-3 px-4 py-2 border-b border-border mb-2 cursor-pointer hover:bg-hover-bg"
                onClick={() => setMenuView('main')}
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

    return (
        <Dropdown
            isOpen={Boolean(anchorEl)}
            onClose={onClose}
            anchorEl={anchorEl}
            className="py-2 text-text-primary"
        >
            {menuView === 'main' && renderMainView()}
            {menuView === 'appearance' && renderAppearanceView()}
            {menuView === 'cardSize' && renderCardSizeView()}
            {menuView === 'apiKey' && renderApiKeyView()}
        </Dropdown>
    );
};
