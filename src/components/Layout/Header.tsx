import React from 'react';
import { Menu, Search, Settings, Video, Bell, User } from 'lucide-react';
import { SettingsDropdown } from '../SettingsDropdown';
import { useUserProfile } from '../../context/UserProfileContext';
import { ChannelDropdown } from '../ChannelDropdown';
import { useVideos } from '../../context/VideosContext';

export const Header: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = React.useState(false);
  const { avatarDataUrl } = useUserProfile();
  const { searchQuery, setSearchQuery } = useVideos();
  const settingsButtonRef = React.useRef<HTMLButtonElement>(null);
  const avatarButtonRef = React.useRef<HTMLDivElement>(null);

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
          <div className="flex flex-1 items-center bg-[#121212] dark:bg-[#121212] bg-opacity-5 rounded-l-full border border-border border-r-0 px-4 py-0.5 h-10 shadow-inner focus-within:border-blue-500 focus-within:border-r ml-8 group">
            <div className="flex-1 flex items-center">
              <input
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
        <button className="bg-none border-none cursor-pointer text-text-primary p-2 rounded-full hover:bg-hover-bg flex items-center justify-center">
          <Video size={24} />
        </button>
        <button className="bg-none border-none cursor-pointer text-text-primary p-2 rounded-full hover:bg-hover-bg flex items-center justify-center">
          <Bell size={24} />
        </button>
        <div className="relative flex items-center">
          <button
            ref={settingsButtonRef}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="bg-none border-none cursor-pointer text-text-primary p-2 rounded-full hover:bg-hover-bg flex items-center justify-center"
            title="Settings"
          >
            <Settings size={24} />
          </button>
          {isSettingsOpen && <SettingsDropdown onClose={() => setIsSettingsOpen(false)} anchorEl={settingsButtonRef.current} />}
        </div>
        <div
          ref={avatarButtonRef}
          onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
          className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white cursor-pointer overflow-hidden ml-2 hover:opacity-90"
        >
          {avatarDataUrl ? (
            <img src={avatarDataUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <User size={20} />
          )}
        </div>
        {isChannelDropdownOpen && <ChannelDropdown onClose={() => setIsChannelDropdownOpen(false)} anchorEl={avatarButtonRef.current} />}
      </div>
    </header>
  );
};
