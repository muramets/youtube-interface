import React from 'react';
import { Home, List, Settings, TrendingUp } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SettingsModal } from '../Settings/SettingsModal';
import { useUIStore } from '../../stores/uiStore';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { useChannels } from '../../hooks/useChannels';
import { TrendsSidebarSection } from '../Trends/TrendsSidebarSection';
import { useTrendStore } from '../../stores/trendStore';

// Collapsed sidebar item - icon on top, text below
const CollapsedSidebarItem: React.FC<{
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ icon, activeIcon, label, active, onClick }) => (
  <div
    onClick={onClick}
    className={`flex flex-col items-center justify-center py-4 px-1 cursor-pointer rounded-lg transition-colors
      ${active ? 'bg-sidebar-active' : 'hover:bg-sidebar-hover'}
      ${active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
  >
    {active ? activeIcon : icon}
    <span className="text-[10px] mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap w-full text-center font-medium">
      {label}
    </span>
  </div>
);

// Expanded sidebar item - icon on left, text on right
const ExpandedSidebarItem: React.FC<{
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ icon, activeIcon, label, active, onClick }) => (
  <div
    onClick={onClick}
    className={`flex items-center gap-6 py-2.5 px-3 cursor-pointer rounded-lg transition-colors
      ${active ? 'bg-sidebar-active' : 'hover:bg-sidebar-hover'}
      ${active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
  >
    {active ? activeIcon : icon}
    <span className={`text-sm whitespace-nowrap ${active ? 'font-medium' : 'font-normal'}`}>
      {label}
    </span>
  </div>
);

// Divider component
export const SidebarDivider: React.FC = () => (
  <div className="my-3 mx-3 border-t border-border" />
);

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSettingsOpen, setSettingsOpen, isSidebarExpanded } = useUIStore();
  const { user } = useAuth();
  const { currentChannel, setCurrentChannel } = useChannelStore();
  const { channels: trendChannels, selectedChannelId, setSelectedChannelId } = useTrendStore();

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

  const isHome = location.pathname === '/';
  const isPlaylists = location.pathname.startsWith('/playlists');
  const isTrends = location.pathname.startsWith('/trends');

  // Icons - normal (outline) and active (filled/bold)
  const homeIcon = <Home size={24} strokeWidth={1.5} />;
  const homeActiveIcon = <Home size={24} strokeWidth={2.5} fill="currentColor" />;
  const playlistsIcon = <List size={24} strokeWidth={1.5} />;
  const playlistsActiveIcon = <List size={24} strokeWidth={2.5} />;
  const settingsIcon = <Settings size={24} strokeWidth={1.5} />;
  const settingsActiveIcon = <Settings size={24} strokeWidth={2.5} />;
  const trendsIcon = <TrendingUp size={24} strokeWidth={1.5} />;
  const trendsActiveIcon = <TrendingUp size={24} strokeWidth={2.5} />;

  return (
    <>
      <aside
        className={`h-[calc(100vh-56px)] sticky top-14 flex flex-col py-1 overflow-y-auto hidden sm:flex flex-shrink-0
          ${isSidebarExpanded ? 'w-[256px] px-3' : 'w-[72px] px-1'}`}
      >
        {isSidebarExpanded ? (
          // Expanded view - icon left, text right
          <>
            <div className="flex-1">
              <ExpandedSidebarItem
                icon={homeIcon}
                activeIcon={homeActiveIcon}
                label="Home"
                active={isHome}
                onClick={() => navigate('/')}
              />
              <ExpandedSidebarItem
                icon={playlistsIcon}
                activeIcon={playlistsActiveIcon}
                label="Playlists"
                active={isPlaylists}
                onClick={() => navigate('/playlists')}
              />

              <TrendsSidebarSection expanded={true} />

              <SidebarDivider />
            </div>

            <div className="border-t border-border pt-2">
              <ExpandedSidebarItem
                icon={settingsIcon}
                activeIcon={settingsActiveIcon}
                label="Settings"
                active={isSettingsOpen}
                onClick={() => setSettingsOpen(true)}
              />
            </div>
          </>
        ) : (
          // Collapsed view - icon on top, text below
          <>
            <CollapsedSidebarItem
              icon={homeIcon}
              activeIcon={homeActiveIcon}
              label="Home"
              active={isHome}
              onClick={() => navigate('/')}
            />
            <CollapsedSidebarItem
              icon={playlistsIcon}
              activeIcon={playlistsActiveIcon}
              label="Playlists"
              active={isPlaylists}
              onClick={() => navigate('/playlists')}
            />
            {/* Trends Section */}
            <CollapsedSidebarItem
              icon={trendsIcon}
              activeIcon={trendsActiveIcon}
              label="Trends"
              active={isTrends && !selectedChannelId}
              onClick={() => {
                setSelectedChannelId(null);
                navigate('/trends');
              }}
            />

            {/* Collapsed Trends Channels */}
            {isTrends && trendChannels.map(channel => {
              const isSelected = selectedChannelId === channel.id;
              // Gray if not visible (eye off), unless selected (then force full visibility/color to indicate active context, or keep gray but ringed? User said "icon is gray if...". Let's keep it gray if hidden, but add ring if selected)
              // Actually, if I select a hidden channel, does it become visible? The logic in TrendsPage filters by 'isVisible' UNLESS selected. So if selected, we see its videos. 
              // Let's keep the icon gray if !isVisible, but add the selection ring.

              const imageClasses = `w-6 h-6 rounded-full object-cover transition-all 
                    ${isSelected ? 'ring-2 ring-text-primary' : ''}
                    ${!channel.isVisible ? 'grayscale opacity-50' : 'hover:opacity-80'}
                `;

              return (
                <div
                  key={channel.id}
                  onClick={() => {
                    setSelectedChannelId(channel.id);
                    navigate('/trends');
                  }}
                  className={`flex flex-col items-center justify-center py-4 px-1 cursor-pointer rounded-lg transition-colors
                            ${isSelected ? 'bg-sidebar-active' : 'hover:bg-sidebar-hover'}`}
                  title={channel.title}
                >
                  <img
                    src={channel.avatarUrl}
                    alt={channel.title}
                    className={imageClasses}
                  />
                  <span className={`text-[10px] mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap w-full text-center ${isSelected ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                    {channel.title}
                  </span>
                </div>
              );
            })}

            <div className="mt-auto">
              <CollapsedSidebarItem
                icon={settingsIcon}
                activeIcon={settingsActiveIcon}
                label="Settings"
                active={isSettingsOpen}
                onClick={() => setSettingsOpen(true)}
              />
            </div>
          </>
        )}
      </aside>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
};
