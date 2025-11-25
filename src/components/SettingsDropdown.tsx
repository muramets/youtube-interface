import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Moon, Sun, Check, ArrowLeft, Key, Monitor } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useVideo } from '../context/VideoContext';

import { useLocation } from 'react-router-dom';

interface SettingsDropdownProps {
    onClose: () => void;
}

type MenuView = 'main' | 'appearance' | 'apiKey' | 'cardSize';

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({ onClose }) => {
    const { theme, setTheme } = useTheme();
    const { apiKey, setApiKey, cardsPerRow, updateCardsPerRow, watchPageCardsPerRow, updateWatchPageCardsPerRow } = useVideo();
    const [menuView, setMenuView] = useState<MenuView>('main');
    const [tempApiKey, setTempApiKey] = useState(apiKey);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const isWatchPage = location.pathname.startsWith('/watch/');
    const currentCardsPerRow = isWatchPage ? watchPageCardsPerRow : cardsPerRow;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const handleSaveApiKey = () => {
        setApiKey(tempApiKey);
        setMenuView('main');
    };

    const renderMainView = () => (
        <>
            <div
                className="hover-bg"
                style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    borderRadius: '8px'
                }}
                onClick={() => setMenuView('appearance')}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                    <span>Appearance: {theme === 'dark' ? 'Dark' : 'Light'}</span>
                </div>
                <ChevronRight size={20} />
            </div>

            <div
                className="hover-bg"
                style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    borderRadius: '8px'
                }}
                onClick={() => setMenuView('cardSize')}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Monitor size={20} />
                    <span>Card Size</span>
                </div>
                <ChevronRight size={20} />
            </div>

            <div
                className="hover-bg"
                style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    borderRadius: '8px'
                }}
                onClick={() => {
                    setTempApiKey(apiKey);
                    setMenuView('apiKey');
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    borderBottom: '1px solid var(--border)',
                    marginBottom: '8px',
                    cursor: 'pointer'
                }}
                onClick={() => setMenuView('main')}
            >
                <ArrowLeft size={20} />
                <span style={{ fontSize: '16px' }}>Appearance</span>
            </div>

            <div style={{ padding: '0 0 8px 0' }}>
                <div style={{ padding: '8px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Setting
                </div>
                <div
                    className="hover-bg"
                    style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '8px' }}
                    onClick={() => setTheme('dark')}
                >
                    <div style={{ width: '20px', display: 'flex', justifyContent: 'center' }}>
                        {theme === 'dark' && <Check size={18} />}
                    </div>
                    <span>Dark theme</span>
                </div>
                <div
                    className="hover-bg"
                    style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '8px' }}
                    onClick={() => setTheme('light')}
                >
                    <div style={{ width: '20px', display: 'flex', justifyContent: 'center' }}>
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
                style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    borderBottom: '1px solid var(--border)',
                    marginBottom: '8px',
                    cursor: 'pointer'
                }}
                onClick={() => setMenuView('main')}
            >
                <ArrowLeft size={20} />
                <span style={{ fontSize: '16px' }}>Card Size</span>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {isWatchPage ? 'Adjust Sidebar Scale' : 'Adjust Grid Size'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <button
                        onClick={() => isWatchPage ? updateWatchPageCardsPerRow(currentCardsPerRow + 1) : updateCardsPerRow(currentCardsPerRow + 1)}
                        disabled={currentCardsPerRow >= 9}
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: '24px',
                            cursor: currentCardsPerRow >= 9 ? 'not-allowed' : 'pointer',
                            opacity: currentCardsPerRow >= 9 ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        -
                    </button>
                    <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{currentCardsPerRow}</span>
                    <button
                        onClick={() => isWatchPage ? updateWatchPageCardsPerRow(currentCardsPerRow - 1) : updateCardsPerRow(currentCardsPerRow - 1)}
                        disabled={currentCardsPerRow <= 3}
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: '24px',
                            cursor: currentCardsPerRow <= 3 ? 'not-allowed' : 'pointer',
                            opacity: currentCardsPerRow <= 3 ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        +
                    </button>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Current: {currentCardsPerRow} {isWatchPage ? 'scale' : 'cards per row'}
                </div>
            </div>
        </>
    );

    const renderApiKeyView = () => (
        <>
            <div
                style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    borderBottom: '1px solid var(--border)',
                    marginBottom: '8px',
                    cursor: 'pointer'
                }}
                onClick={() => setMenuView('main')}
            >
                <ArrowLeft size={20} />
                <span style={{ fontSize: '16px' }}>API Key</span>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Enter your YouTube Data API v3 Key:
                </div>
                <input
                    type="text"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    style={{
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        width: '100%',
                        boxSizing: 'border-box'
                    }}
                />
                <button
                    onClick={handleSaveApiKey}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '18px',
                        border: 'none',
                        backgroundColor: '#3ea6ff',
                        color: 'black',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        alignSelf: 'flex-end'
                    }}
                >
                    Save
                </button>
            </div>
        </>
    );

    return (
        <div
            ref={dropdownRef}
            style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '8px 0',
                width: '300px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                zIndex: 1000,
                color: 'var(--text-primary)'
            }}
        >
            {menuView === 'main' && renderMainView()}
            {menuView === 'appearance' && renderAppearanceView()}
            {menuView === 'cardSize' && renderCardSizeView()}
            {menuView === 'apiKey' && renderApiKeyView()}
        </div>
    );
};
