import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Moon, Sun, Check, ArrowLeft, Key, Monitor } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useVideo } from '../context/VideoContext';
import { useLocation } from 'react-router-dom';
import './SettingsDropdown.css';

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
    const dropdownRef = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const isWatchPage = location.pathname.startsWith('/watch/');
    const currentCardsPerRow = cardsPerRow;
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    useEffect(() => {
        if (anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            const menuWidth = 300;
            const menuHeight = 400; // Approximate max height

            let top = rect.bottom + 8;
            let left = rect.right - menuWidth;

            // Adjust if going off screen
            if (left < 16) left = 16;
            if (top + menuHeight > window.innerHeight) top = rect.top - menuHeight - 8;

            setPosition({ top, left });
        }
    }, [anchorEl]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && anchorEl && !anchorEl.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', onClose, true);
        window.addEventListener('resize', onClose);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', onClose, true);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose, anchorEl]);

    const handleSaveApiKey = () => {
        setApiKey(tempApiKey);
        setMenuView('main');
    };

    const renderMainView = () => (
        <>
            <div className="settings-menu-item" onClick={() => setMenuView('appearance')}>
                <div className="settings-menu-item-content">
                    {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                    <span>Appearance: {theme === 'dark' ? 'Dark' : 'Light'}</span>
                </div>
                <ChevronRight size={20} />
            </div>

            {!isWatchPage && (
                <div className="settings-menu-item" onClick={() => setMenuView('cardSize')}>
                    <div className="settings-menu-item-content">
                        <Monitor size={20} />
                        <span>Card Size</span>
                    </div>
                    <ChevronRight size={20} />
                </div>
            )}

            <div className="settings-menu-item" onClick={() => {
                setTempApiKey(apiKey);
                setMenuView('apiKey');
            }}>
                <div className="settings-menu-item-content">
                    <Key size={20} />
                    <span>API Key</span>
                </div>
                <ChevronRight size={20} />
            </div>
        </>
    );

    const renderAppearanceView = () => (
        <>
            <div className="settings-header" onClick={() => setMenuView('main')}>
                <ArrowLeft size={20} />
                <span className="settings-header-title">Appearance</span>
            </div>

            <div style={{ padding: '0 0 8px 0' }}>
                <div className="settings-section-label">Setting</div>
                <div className="settings-option" onClick={() => setTheme('dark')}>
                    <div className="check-icon-container">
                        {theme === 'dark' && <Check size={18} />}
                    </div>
                    <span>Dark theme</span>
                </div>
                <div className="settings-option" onClick={() => setTheme('light')}>
                    <div className="check-icon-container">
                        {theme === 'light' && <Check size={18} />}
                    </div>
                    <span>Light theme</span>
                </div>
            </div>
        </>
    );

    const renderCardSizeView = () => (
        <>
            <div className="settings-header" onClick={() => setMenuView('main')}>
                <ArrowLeft size={20} />
                <span className="settings-header-title">Card Size</span>
            </div>

            <div className="card-size-container">
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Adjust Grid Size
                </div>
                <div className="card-size-controls">
                    <button
                        className="card-size-button"
                        onClick={() => updateCardsPerRow(currentCardsPerRow + 1)}
                        disabled={currentCardsPerRow >= 9}
                    >
                        -
                    </button>
                    <span className="card-size-value">{currentCardsPerRow}</span>
                    <button
                        className="card-size-button"
                        onClick={() => updateCardsPerRow(currentCardsPerRow - 1)}
                        disabled={currentCardsPerRow <= 3}
                    >
                        +
                    </button>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Current: {currentCardsPerRow} cards per row
                </div>
            </div>
        </>
    );

    const renderApiKeyView = () => (
        <>
            <div className="settings-header" onClick={() => setMenuView('main')}>
                <ArrowLeft size={20} />
                <span className="settings-header-title">API Key</span>
            </div>

            <div className="api-key-container">
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Enter your YouTube Data API v3 Key:
                </div>
                <input
                    type="text"
                    className="api-key-input"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                />
                <button className="api-key-save-button" onClick={handleSaveApiKey}>
                    Save
                </button>
            </div>
        </>
    );

    return createPortal(
        <div
            ref={dropdownRef}
            className="settings-dropdown"
            style={{
                top: position.top,
                left: position.left,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {menuView === 'main' && renderMainView()}
            {menuView === 'appearance' && renderAppearanceView()}
            {menuView === 'cardSize' && renderCardSizeView()}
            {menuView === 'apiKey' && renderApiKeyView()}
        </div>,
        document.body
    );
};
