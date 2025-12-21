import React, { useState } from 'react';
import { Dropdown } from '../../components/Shared/Dropdown';
import { SettingsMenuMain } from './SettingsMenuMain';
import { SettingsMenuAppearance } from './SettingsMenuAppearance';
import { SettingsMenuSync } from './SettingsMenuSync';
import { SettingsMenuClone } from './SettingsMenuClone';
import { SettingsMenuApiKey } from './SettingsMenuApiKey';

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
