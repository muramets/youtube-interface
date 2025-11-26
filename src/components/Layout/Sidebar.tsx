import React from 'react';
import { Home, List } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean }> = ({ icon, label, active }) => (
  <div className={`flex flex-col items-center justify-center py-4 px-1 cursor-pointer rounded-lg hover:bg-hover-bg ${active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
    {icon}
    <span className="text-[10px] mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap w-full text-center">{label}</span>
  </div>
);

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="w-[72px] h-[calc(100vh-56px)] sticky top-14 bg-bg-primary flex flex-col px-1 py-1 overflow-y-auto hidden sm:flex">
      <div onClick={() => navigate('/')}>
        <SidebarItem icon={<Home size={24} />} label="Home" active={location.pathname === '/'} />
      </div>
      <div onClick={() => navigate('/playlists')}>
        <SidebarItem icon={<List size={24} />} label="Playlists" active={location.pathname.startsWith('/playlists')} />
      </div>
    </aside>
  );
};
