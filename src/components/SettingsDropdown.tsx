import React, { useState } from 'react';
import { ChevronRight, Moon, Sun, Check, ArrowLeft, Key, Monitor, RefreshCw } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useVideo } from '../context/VideoContext';
import { useLocation } from 'react-router-dom';
import { Dropdown } from './Shared/Dropdown';

interface SettingsDropdownProps {
    onClose: () => void;
    anchorEl: HTMLElement | null;
}

type MenuView = 'main' | 'appearance' | 'apiKey' | 'cardSize' | 'sync';

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({ onClose, anchorEl }) => {
    const { theme, setTheme } = useTheme();
    const { apiKey, setApiKey, cardsPerRow, updateCardsPerRow, syncSettings, updateSyncSettings, manualSync, isSyncing } = useVideo();
    const [menuView, setMenuView] = useState<MenuView>('main');
    const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);
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
                onClick={() => setMenuView('sync')}
            >
                <div className="flex items-center gap-3">
                    <RefreshCw size={20} />
                    <span>Sync Settings</span>
                </div>
                <ChevronRight size={20} />
            </div>

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

    const renderSyncView = () => (
        <>
            <div
                className="flex items-center gap-3 px-4 py-2 border-b border-border mb-2 cursor-pointer hover:bg-hover-bg"
                onClick={() => setMenuView('main')}
            >
                <ArrowLeft size={20} />
                <span className="text-sm">Sync Settings</span>
            </div>

            <div className="p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Auto-Sync</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={syncSettings.autoSync}
                            onChange={(e) => updateSyncSettings({ ...syncSettings, autoSync: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                </div>

                {syncSettings.autoSync && (
                    <div className="flex flex-col gap-2">
                        <span className="text-xs text-text-secondary">Sync Frequency</span>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-bg-primary border border-border rounded-lg p-1 w-24">
                                <input
                                    type="text"
                                    value={
                                        syncSettings.frequencyHours % 168 === 0 ? syncSettings.frequencyHours / 168 :
                                            syncSettings.frequencyHours % 24 === 0 ? syncSettings.frequencyHours / 24 :
                                                syncSettings.frequencyHours
                                    }
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        const unit =
                                            syncSettings.frequencyHours % 168 === 0 ? 'weeks' :
                                                syncSettings.frequencyHours % 24 === 0 ? 'days' : 'hours';

                                        let newHours = val;
                                        if (unit === 'weeks') newHours = val * 168;
                                        else if (unit === 'days') newHours = val * 24;

                                        updateSyncSettings({ ...syncSettings, frequencyHours: Math.max(1, newHours) });
                                    }}
                                    className="bg-transparent border-none text-text-primary w-full text-center focus:outline-none font-medium"
                                />
                                <div className="flex flex-col border-l border-border pl-1 gap-0.5">
                                    <button
                                        className="text-text-secondary hover:text-text-primary flex items-center justify-center h-3 w-4 cursor-pointer bg-transparent border-none p-0"
                                        onClick={() => {
                                            const currentVal =
                                                syncSettings.frequencyHours % 168 === 0 ? syncSettings.frequencyHours / 168 :
                                                    syncSettings.frequencyHours % 24 === 0 ? syncSettings.frequencyHours / 24 :
                                                        syncSettings.frequencyHours;
                                            const unit =
                                                syncSettings.frequencyHours % 168 === 0 ? 'weeks' :
                                                    syncSettings.frequencyHours % 24 === 0 ? 'days' : 'hours';

                                            let newHours = 0;
                                            if (unit === 'weeks') newHours = (currentVal + 1) * 168;
                                            else if (unit === 'days') newHours = (currentVal + 1) * 24;
                                            else newHours = currentVal + 1;

                                            updateSyncSettings({ ...syncSettings, frequencyHours: newHours });
                                        }}
                                    >
                                        <ChevronRight size={12} className="-rotate-90" />
                                    </button>
                                    <button
                                        className="text-text-secondary hover:text-text-primary flex items-center justify-center h-3 w-4 cursor-pointer bg-transparent border-none p-0"
                                        onClick={() => {
                                            const currentVal =
                                                syncSettings.frequencyHours % 168 === 0 ? syncSettings.frequencyHours / 168 :
                                                    syncSettings.frequencyHours % 24 === 0 ? syncSettings.frequencyHours / 24 :
                                                        syncSettings.frequencyHours;
                                            if (currentVal <= 1) return;

                                            const unit =
                                                syncSettings.frequencyHours % 168 === 0 ? 'weeks' :
                                                    syncSettings.frequencyHours % 24 === 0 ? 'days' : 'hours';

                                            let newHours = 0;
                                            if (unit === 'weeks') newHours = (currentVal - 1) * 168;
                                            else if (unit === 'days') newHours = (currentVal - 1) * 24;
                                            else newHours = currentVal - 1;

                                            updateSyncSettings({ ...syncSettings, frequencyHours: newHours });
                                        }}
                                    >
                                        <ChevronRight size={12} className="rotate-90" />
                                    </button>
                                </div>
                            </div>

                            <div className="relative">
                                <button
                                    className="bg-bg-primary text-text-primary border border-border rounded-lg p-2 text-sm flex items-center justify-between gap-2 min-w-[100px] cursor-pointer hover:bg-hover-bg"
                                    onClick={() => setIsUnitDropdownOpen(!isUnitDropdownOpen)}
                                >
                                    <span className="capitalize">
                                        {syncSettings.frequencyHours % 168 === 0 ? 'Weeks' :
                                            syncSettings.frequencyHours % 24 === 0 ? 'Days' : 'Hours'}
                                    </span>
                                    <ChevronRight size={14} className={`transition-transform ${isUnitDropdownOpen ? '-rotate-90' : 'rotate-90'}`} />
                                </button>

                                {isUnitDropdownOpen && (
                                    <div className="absolute top-full right-0 mt-1 w-full bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden z-10 animate-scale-in">
                                        {['Hours', 'Days', 'Weeks'].map((unit) => (
                                            <div
                                                key={unit}
                                                className="px-3 py-2 text-sm cursor-pointer hover:bg-hover-bg text-text-primary"
                                                onClick={() => {
                                                    const currentVal =
                                                        syncSettings.frequencyHours % 168 === 0 ? syncSettings.frequencyHours / 168 :
                                                            syncSettings.frequencyHours % 24 === 0 ? syncSettings.frequencyHours / 24 :
                                                                syncSettings.frequencyHours;

                                                    let newHours = currentVal;
                                                    if (unit === 'Weeks') newHours = currentVal * 168;
                                                    else if (unit === 'Days') newHours = currentVal * 24;

                                                    updateSyncSettings({ ...syncSettings, frequencyHours: Math.max(1, newHours) });
                                                    setIsUnitDropdownOpen(false);
                                                }}
                                            >
                                                {unit}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="border-t border-border pt-4">
                    <button
                        onClick={manualSync}
                        disabled={isSyncing}
                        className={`w-full py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors ${isSyncing ? 'bg-bg-secondary text-text-secondary cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'}`}
                    >
                        <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                        {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <p className="text-xs text-text-secondary mt-2 text-center">
                        Updates video stats (views, likes) from YouTube.
                    </p>
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
            {menuView === 'sync' && renderSyncView()}
            {menuView === 'apiKey' && renderApiKeyView()}
        </Dropdown>
    );
};
