import React from 'react';
import { Home, List, Settings } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SettingsModal } from '../Settings/SettingsModal';

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean }> = ({ icon, label, active }) => (
  <div className={`flex flex-col items-center justify-center py-4 px-1 cursor-pointer rounded-lg hover:bg-hover-bg ${active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
    {icon}
    <span className="text-[10px] mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap w-full text-center">{label}</span>
  </div>
);

import { useUIStore } from '../../stores/uiStore';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { useChannels } from '../../hooks/useChannels';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSettingsOpen, setSettingsOpen } = useUIStore();
  const { user } = useAuth();
  const { currentChannel, setCurrentChannel } = useChannelStore();

  // Use TanStack Query hook for channels
  const { data: channels, isLoading } = useChannels(user?.uid || '');

  // Select channel logic with persistence
  React.useEffect(() => {
    if (isLoading || !channels || channels.length === 0) return;

    if (!currentChannel) {
      // Try to restore from localStorage
      const savedChannelId = localStorage.getItem(`lastSelectedChannelId_${user?.uid}`);
      const savedChannel = savedChannelId ? channels.find(c => c.id === savedChannelId) : null;

      if (savedChannel) {
        setCurrentChannel(savedChannel);
      } else {
        // Fallback to first channel
        setCurrentChannel(channels[0]);
      }
    }
  }, [channels, isLoading, currentChannel, setCurrentChannel, user?.uid]);

  // Save selection to localStorage
  React.useEffect(() => {
    if (user?.uid && currentChannel) {
      localStorage.setItem(`lastSelectedChannelId_${user.uid}`, currentChannel.id);
    }
  }, [currentChannel, user?.uid]);

  return (
    <>
      <aside className="w-[72px] h-[calc(100vh-56px)] sticky top-14 bg-bg-primary flex flex-col px-1 py-2 overflow-y-auto hidden sm:flex">
        <div onClick={() => navigate('/')}>
          <SidebarItem icon={<Home size={24} />} label="Home" active={location.pathname === '/'} />
        </div>
        <div onClick={() => navigate('/playlists')}>
          <SidebarItem icon={<List size={24} />} label="Playlists" active={location.pathname.startsWith('/playlists')} />
        </div>

        <div className="mt-auto" onClick={() => setSettingsOpen(true)}>
          <SidebarItem icon={<Settings size={24} />} label="Settings" active={isSettingsOpen} />
        </div>
      </aside>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
};
