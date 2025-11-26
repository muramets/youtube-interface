import React from 'react';
import { Menu, Search, Settings, Video, Bell, User } from 'lucide-react';
import { SettingsDropdown } from '../SettingsDropdown';
import { useUserProfile } from '../../context/UserProfileContext';
import { ChannelDropdown } from '../ChannelDropdown';

export const Header: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = React.useState(false);
  const { avatarDataUrl } = useUserProfile();
  const settingsButtonRef = React.useRef<HTMLButtonElement>(null);
  const avatarButtonRef = React.useRef<HTMLDivElement>(null);

  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 16px',
      height: '56px',
      position: 'sticky',
      top: 0,
      backgroundColor: 'var(--bg-primary)',
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <Menu size={24} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', fontSize: '18px' }}>
          <div style={{ width: '30px', height: '20px', background: 'red', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 0, height: 0, borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderLeft: '6px solid white' }}></div>
          </div>
          <span>YouTube</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', flex: 1, maxWidth: '600px', margin: '0 16px' }}>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: '20px', padding: '0 16px', border: '1px solid var(--border)' }}>
          <input
            type="text"
            placeholder="Search"
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              padding: '8px 0',
              color: 'var(--text-primary)',
              outline: 'none',
              fontSize: '16px'
            }}
          />
          <Search size={20} color="var(--text-secondary)" />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
          <Video size={24} />
        </button>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
          <Bell size={24} />
        </button>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button
            ref={settingsButtonRef}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
            title="Settings"
          >
            <Settings size={24} />
          </button>
          {isSettingsOpen && <SettingsDropdown onClose={() => setIsSettingsOpen(false)} anchorEl={settingsButtonRef.current} />}
        </div>
        <div
          ref={avatarButtonRef}
          onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: avatarDataUrl ? 'transparent' : 'purple',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            cursor: 'pointer',
            overflow: 'hidden',
            marginLeft: '8px'
          }}
        >
          {avatarDataUrl ? (
            <img src={avatarDataUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <User size={20} />
          )}
        </div>
        {isChannelDropdownOpen && <ChannelDropdown onClose={() => setIsChannelDropdownOpen(false)} anchorEl={avatarButtonRef.current} />}
      </div>
    </header>
  );
};
