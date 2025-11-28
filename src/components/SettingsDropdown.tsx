import React, { useState } from 'react';
import { Dropdown } from './Shared/Dropdown';
import { SettingsMenuMain } from './Settings/SettingsMenuMain';
import { SettingsMenuAppearance } from './Settings/SettingsMenuAppearance';
import { SettingsMenuSync } from './Settings/SettingsMenuSync';
import { SettingsMenuClone } from './Settings/SettingsMenuClone';
import { SettingsMenuApiKey } from './Settings/SettingsMenuApiKey';

interface SettingsDropdownProps {
    onClose: () => void;
    anchorEl: HTMLElement | null;
}

type MenuView = 'main' | 'appearance' | 'apiKey' | 'sync' | 'clone';

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({ onClose, anchorEl }) => {
    const [menuView, setMenuView] = useState<MenuView>('main');

    return (
        <Dropdown
            isOpen={Boolean(anchorEl)}
            onClose={onClose}
            anchorEl={anchorEl}
            className="text-text-primary"
        >
            {menuView === 'main' && (
                <SettingsMenuMain onNavigate={setMenuView} />
            )}
            {menuView === 'appearance' && (
                <SettingsMenuAppearance onBack={() => setMenuView('main')} />
            )}
            {menuView === 'sync' && (
                <SettingsMenuSync onBack={() => setMenuView('main')} />
            )}
            {menuView === 'clone' && (
                <SettingsMenuClone onBack={() => setMenuView('main')} />
            )}
            {menuView === 'apiKey' && (
                <SettingsMenuApiKey onBack={() => setMenuView('main')} />
            )}
        </Dropdown>
    );
};
