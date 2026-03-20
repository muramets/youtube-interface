import React from 'react';
import { Home, List, Settings, TrendingUp, Music, BookOpen } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { SettingsModal } from '../../features/Settings/SettingsModal';
import { useUIStore } from '../../core/stores/uiStore';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useChannels } from '../../core/hooks/useChannels';
import { TrendsSidebarSection } from '../../pages/Trends/Sidebar/TrendsSidebarSection';
import { MusicSidebarSection } from '../../pages/Music/Sidebar/MusicSidebarSection';
import { AddChannelModal } from '../../pages/Trends/Sidebar/AddChannelModal';
import { useTrendStore } from '../../core/stores/trends/trendStore';
import { useMusicStore } from '../../core/stores/music/musicStore';
import type { TrendChannel } from '../../core/types/trends';

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
    className={`flex flex-col items-center justify-center py-4 px-1 cursor-pointer rounded-lg hover-trail
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
    className={`flex items-center gap-6 py-2.5 px-3 cursor-pointer rounded-lg hover-trail
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

const AVATAR_CLASSES = 'w-8 h-8 rounded-full object-cover transition-all duration-300 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] hover:scale-110 cursor-pointer';
const AVATAR_FALLBACK_CLASSES = 'w-8 h-8 rounded-full flex items-center justify-center bg-white/10 text-white/80 text-[10px] font-bold transition-all duration-300 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] hover:scale-110 cursor-pointer';

export const TrendsCollapsedGroup: React.FC<{
  isActive: boolean;
  channels: TrendChannel[];
  selectedChannelId: string | null;
  navigate: (path: string) => void;
  setSelectedChannelId: (id: string | null) => void;
  icons: {
    normal: React.ReactNode;
    active: React.ReactNode;
  };
}> = ({ isActive, channels, selectedChannelId, navigate, setSelectedChannelId, icons }) => {
  const [isHovered, setHovered] = React.useState(false);
  const { brokenAvatarChannelIds, markAvatarBroken } = useTrendStore();

  const visibleChannels = isHovered
    ? channels
    : (selectedChannelId ? channels.filter(c => c.id === selectedChannelId) : []);

  return (
    <div
      className="flex flex-col items-center w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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

      {/* Channel avatars — single AnimatePresence, no overflow clipping */}
      <motion.div
        layout
        transition={{ layout: { duration: 0.25 } }}
        className={`relative z-10 w-full flex flex-col items-center ${visibleChannels.length > 0 ? 'gap-3 pt-4 pb-3' : ''}`}
        initial={false}
      >
        <AnimatePresence mode="popLayout">
          {visibleChannels.map((channel) => {
            const isSelected = selectedChannelId === channel.id;
            const isBroken = brokenAvatarChannelIds.has(channel.id);
            return (
              <motion.div
                key={channel.id}
                layout="position"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ opacity: { duration: 0.2 } }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedChannelId(channel.id);
                  navigate('/trends');
                }}
                className="flex flex-col items-center justify-center w-full px-1 relative hover:z-30"
                title={channel.title}
              >
                <div className={`relative transition-all duration-200 ${isSelected ? 'ring-2 ring-text-primary rounded-full p-[2px]' : ''}`}>
                  {channel.avatarUrl && !isBroken ? (
                    <img
                      src={channel.avatarUrl}
                      alt={channel.title}
                      referrerPolicy="no-referrer"
                      onError={() => markAvatarBroken(channel.id)}
                      className={AVATAR_CLASSES}
                    />
                  ) : (
                    <div className={AVATAR_FALLBACK_CLASSES}>
                      {channel.title.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSettingsOpen, setSettingsOpen, isSidebarExpanded, sidebarWidth, setSidebarWidth } = useUIStore();
  const { user } = useAuth();
  const { currentChannel, setCurrentChannel } = useChannelStore();
  const { channels: trendChannels, selectedChannelId, setSelectedChannelId } = useTrendStore();
  const hasAudioPlayer = !!useMusicStore((s) => s.playingTrackId);
  const { data: channels, isLoading } = useChannels(user?.uid || '');

  const [isResizing, setIsResizing] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-hide scrollbar: add .is-scrolling while scrolling, remove after 1s idle
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      el.classList.add('is-scrolling');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('is-scrolling'), 1000);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
  }, []);

  // Resize Logic
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Prevent text selection during drag
      e.preventDefault();

      // Clamp width between 200px (min) and 600px (max)
      // Or 40% of screen width? Let's stick to pixel limits first for simplicity.
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Cleanup in case component unmounts while resizing
      if (isResizing) {
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
      }
    };
  }, [isResizing, setSidebarWidth]);

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
  const isMusic = location.pathname.startsWith('/music');
  const isKnowledge = location.pathname.startsWith('/knowledge');

  // Icons - normal (outline) and active (filled/bold)
  const homeIcon = <Home size={24} strokeWidth={1.5} />;
  const homeActiveIcon = <Home size={24} strokeWidth={2.5} fill="currentColor" />;
  const playlistsIcon = <List size={24} strokeWidth={1.5} />;
  const playlistsActiveIcon = <List size={24} strokeWidth={2.5} />;
  const settingsIcon = <Settings size={24} strokeWidth={1.5} />;
  const settingsActiveIcon = <Settings size={24} strokeWidth={2.5} />;
  const trendsIcon = <TrendingUp size={24} strokeWidth={1.5} />;
  const trendsActiveIcon = <TrendingUp size={24} strokeWidth={2.5} />;
  const musicIcon = <Music size={24} strokeWidth={1.5} />;
  const musicActiveIcon = <Music size={24} strokeWidth={2.5} fill="currentColor" />;
  const knowledgeIcon = <BookOpen size={24} strokeWidth={1.5} />;
  const knowledgeActiveIcon = <BookOpen size={24} strokeWidth={2.5} fill="currentColor" />;

  return (
    <>
      {/* Placeholder to reserve space in flex layout for fixed sidebar */}
      <div
        style={{ width: isSidebarExpanded ? `${sidebarWidth}px` : undefined }}
        className={`hidden sm:block flex-shrink-0 ${isSidebarExpanded ? '' : 'w-[72px]'}`}
      />
      <aside
        style={{ width: isSidebarExpanded ? `${sidebarWidth}px` : undefined }}
        className={`h-[calc(100vh-56px)] fixed top-14 left-0 flex hidden sm:flex flex-shrink-0 z-sticky
          ${isSidebarExpanded ? 'px-0' : 'w-[72px] px-1 py-1 flex-col'}`}
      >
        <div
          ref={scrollRef}
          className={`flex-1 min-w-0 flex flex-col overflow-x-hidden ${isSidebarExpanded ? 'px-3 py-1 overflow-y-auto' : 'w-full overflow-hidden'}`}
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
                <MusicSidebarSection expanded={true} />

                <TrendsSidebarSection expanded={true} />
              </div>

              <div className={`border-t border-border pt-2 transition-[padding] duration-300 ${hasAudioPlayer ? 'pb-14' : ''}`}>
                <ExpandedSidebarItem
                  icon={knowledgeIcon}
                  activeIcon={knowledgeActiveIcon}
                  label="Knowledge"
                  active={isKnowledge}
                  onClick={() => navigate('/knowledge')}
                />
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
              <CollapsedSidebarItem
                icon={musicIcon}
                activeIcon={musicActiveIcon}
                label="Music"
                active={isMusic}
                noBackground={true}
                onClick={() => navigate('/music')}
              />
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

              <div className={`mt-auto transition-[padding] duration-300 ${hasAudioPlayer ? 'pb-14' : ''}`}>
                <CollapsedSidebarItem
                  icon={knowledgeIcon}
                  activeIcon={knowledgeActiveIcon}
                  label="Knowledge"
                  active={isKnowledge}
                  noBackground={true}
                  onClick={() => navigate('/knowledge')}
                />
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
        </div>

        {/* Invisible resize hit area (no visible divider for cleaner UI) */}
        {isSidebarExpanded && (
          <div
            className="absolute top-0 right-0 w-4 h-full cursor-col-resize z-50"
            onMouseDown={() => setIsResizing(true)}
          />
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
