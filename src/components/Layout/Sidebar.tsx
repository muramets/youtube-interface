import React from 'react';
import { Home, List, Settings, TrendingUp } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SettingsModal } from '../Settings/SettingsModal';
import { useUIStore } from '../../stores/uiStore';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { useChannels } from '../../hooks/useChannels';
import { TrendsSidebarSection } from '../Trends/TrendsSidebarSection';
import { AddChannelModal } from '../Trends/AddChannelModal';
import { useTrendStore } from '../../stores/trendStore';

// Collapsed sidebar item - icon on top, text below
const CollapsedSidebarItem: React.FC<{
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  label: string;
  active?: boolean;
  noBackground?: boolean;
  onClick?: () => void;
}> = ({ icon, activeIcon, label, active, noBackground, onClick }) => (
  <div
    onClick={onClick}
    className={`flex flex-col items-center justify-center py-4 px-1 cursor-pointer rounded-lg transition-colors
      ${active && !noBackground ? 'bg-sidebar-active' : 'hover:bg-sidebar-hover'}
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

import { AnimatePresence, motion } from 'framer-motion';

// Expanded sidebar item - icon on left, text on right
export const TrendsCollapsedGroup: React.FC<{
  isActive: boolean;
  channels: any[]; // Avoid circular dep or import type
  selectedChannelId: string | null;
  navigate: (path: string) => void;
  setSelectedChannelId: (id: string | null) => void;
  icons: {
    normal: React.ReactNode;
    active: React.ReactNode;
  };
}> = ({ isActive, channels, selectedChannelId, navigate, setSelectedChannelId, icons }) => {
  const [isHovered, setHovered] = React.useState(false);

  // Robust single-list approach
  const showDropdown = isHovered;

  // Determine which channels to show
  // If hovering: Show ALL channels
  // If not hovering: Show ONLY selected channel (if any)
  const visibleChannels = showDropdown
    ? channels
    : (selectedChannelId ? channels.filter(c => c.id === selectedChannelId) : []);

  return (
    <div
      className="flex flex-col items-center w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Main Trigger */}
      <div className="w-full relative z-20">
        <CollapsedSidebarItem
          icon={icons.normal}
          activeIcon={icons.active}
          label="Trends"
          active={isActive && !selectedChannelId}
          noBackground={true}
          onClick={() => {
            setSelectedChannelId(null);
            navigate('/trends');
          }}
        />
      </div>

      {/* Single Unified Channel List */}
      <motion.div
        layout
        className="relative z-10 w-full flex flex-col items-center overflow-hidden"
        initial={false}
      >
        <AnimatePresence mode="popLayout">
          {visibleChannels.length > 0 && (
            <motion.div
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              className="flex flex-col items-center gap-3 pt-4 pb-4 w-full"
            >
              <AnimatePresence mode="popLayout">
                {visibleChannels.map(channel => {
                  const isSelected = selectedChannelId === channel.id;

                  const imageClasses = `w-8 h-8 rounded-full object-cover transition-all duration-300
                                        hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] hover:scale-110
                                    `;

                  return (
                    <motion.div
                      key={channel.id}
                      layout="position"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{
                        opacity: { duration: 0.2 }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedChannelId(channel.id);
                        navigate('/trends');
                      }}
                      className="flex flex-col items-center justify-center w-full px-1 relative hover:z-30"
                      title={channel.title}
                    >
                      <div className={`relative transition-all duration-200 ${isSelected ? 'ring-2 ring-text-primary rounded-full p-[2px]' : ''}`}>
                        <img
                          src={channel.avatarUrl}
                          alt={channel.title}
                          className={imageClasses}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

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

  // Clear Trends channel selection when navigating away
  React.useEffect(() => {
    if (!location.pathname.startsWith('/trends')) {
      setSelectedChannelId(null);
    }
  }, [location.pathname, setSelectedChannelId]);

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
              noBackground={true}
              onClick={() => navigate('/')}
            />
            <CollapsedSidebarItem
              icon={playlistsIcon}
              activeIcon={playlistsActiveIcon}
              label="Playlists"
              active={isPlaylists}
              noBackground={true}
              onClick={() => navigate('/playlists')}
            />
            {/* Trends Section with Hover Dropdown */}
            <div
              className="flex flex-col w-full"
              onMouseEnter={() => {
                // Preload or ensure logic is ready if needed
              }}
            >
              {/* Main Trends Icon - acts as hover trigger for the group if we wrap it? 
                    Actually, we want the list to stay open when hovering the list too.
                    So we need a wrapper around both.
                */}
              <TrendsCollapsedGroup
                isActive={isTrends && !selectedChannelId}
                channels={trendChannels}
                selectedChannelId={selectedChannelId}
                navigate={navigate}
                setSelectedChannelId={setSelectedChannelId}
                icons={{
                  normal: trendsIcon,
                  active: trendsActiveIcon
                }}
              />
            </div>

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
      <AddChannelModal
        isOpen={useTrendStore((state) => state.isAddChannelModalOpen)}
        onClose={() => useTrendStore.getState().setAddChannelModalOpen(false)}
      />
    </>
  );
};
