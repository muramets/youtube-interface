import React from 'react';
import { Menu, Search, Bell, User } from 'lucide-react';
import { useChannelStore } from '../../stores/channelStore';
import { ChannelDropdown } from '../ChannelDropdown';
import { useFilterStore } from '../../stores/filterStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { NotificationDropdown } from '../Notifications/NotificationDropdown';
import { Dropdown } from '../Shared/Dropdown';
import { AddContentMenu } from '../Shared/AddContentMenu';
import { useLocation } from 'react-router-dom';
import { YouTubeCreateIcon } from '../Shared/YouTubeCreateIcon';

export const Header: React.FC = () => {
  const location = useLocation();
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = React.useState(false);
  const { currentChannel } = useChannelStore();
  const { searchQuery, setSearchQuery } = useFilterStore();
  const [channelAnchor, setChannelAnchor] = React.useState<HTMLElement | null>(null);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = React.useState(false);

  // Notification State
  const { unreadCount } = useNotificationStore();
  const [notificationAnchor, setNotificationAnchor] = React.useState<HTMLElement | null>(null);

  return (
    <header className="flex justify-between items-center px-4 h-14 sticky top-0 bg-bg-primary z-[100]">
      <div className="flex items-center gap-4">
        <button className="bg-none border-none text-text-primary cursor-pointer p-2 rounded-full hover:bg-hover-bg">
          <Menu size={24} />
        </button>
        <div className="flex items-center gap-1 font-bold text-lg tracking-tighter text-text-primary cursor-pointer">
          <div className="w-[30px] h-[20px] bg-red-600 rounded flex items-center justify-center">
            <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-white"></div>
          </div>
          <span>YouTube</span>
        </div>
      </div>

      <div className="hidden sm:flex items-center flex-1 max-w-[720px] mx-4">
        <div className="flex flex-1 items-center">
          <div className="flex flex-1 items-center bg-bg-primary rounded-l-full border border-border border-r-0 px-4 py-0.5 h-10 shadow-inner focus-within:border-text-primary focus-within:border-r ml-8 group">
            <div className="flex-1 flex items-center">
              <input
                id="search"
                name="search_query"
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-text-primary text-base font-normal placeholder-text-secondary"
              />
            </div>
          </div>
          <button className="h-10 px-5 bg-bg-secondary border border-border border-l-0 rounded-r-full cursor-pointer hover:bg-hover-bg flex items-center justify-center">
            <Search size={20} className="text-text-primary" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <AddContentMenu
          icon={<YouTubeCreateIcon size={27} />}
          showPlaylist={location.pathname === '/playlists'}
          isOpen={isCreateMenuOpen}
          onOpenChange={(open) => {
            setIsCreateMenuOpen(open);
            if (open) {
              setNotificationAnchor(null);
              setIsChannelDropdownOpen(false);
            }
          }}
        />

        <div className="relative">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              const target = e.currentTarget;
              setNotificationAnchor(prev => prev ? null : target);
              setIsChannelDropdownOpen(false); // Close channel dropdown
              setIsCreateMenuOpen(false); // Close create menu
            }}
            className="bg-none border-none cursor-pointer text-text-primary p-2 rounded-full hover:bg-hover-bg flex items-center justify-center relative"
          >
            <Bell size={24} />
            {unreadCount > 0 && (
              <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-600 border-2 border-bg-primary rounded-full" />
            )}
          </button>

          <Dropdown
            isOpen={Boolean(notificationAnchor)}
            anchorEl={notificationAnchor}
            onClose={() => setNotificationAnchor(null)}
            align="right"
            width={400}
            className="p-0 border-none bg-transparent shadow-none"
          >
            <NotificationDropdown />
          </Dropdown>
        </div>

        <div
          onClick={(e) => {
            setChannelAnchor(e.currentTarget);
            setIsChannelDropdownOpen(!isChannelDropdownOpen);
            setNotificationAnchor(null); // Close notification dropdown
            setIsCreateMenuOpen(false); // Close create menu
          }}
          className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white cursor-pointer overflow-hidden ml-2 hover:opacity-90"
        >
          {currentChannel?.avatar ? (
            <img src={currentChannel.avatar} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <User size={20} />
          )}
        </div>
        {isChannelDropdownOpen && <ChannelDropdown onClose={() => setIsChannelDropdownOpen(false)} anchorEl={channelAnchor} />}
      </div>
    </header>
  );
};
