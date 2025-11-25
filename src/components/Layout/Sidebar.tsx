import React from 'react';
import { Home, List } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean }> = ({ icon, label, active }) => (
  <div className={`sidebar-item ${active ? 'active' : ''}`}>
    {icon}
    <span className="sidebar-item-label">{label}</span>
  </div>
);

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div onClick={() => navigate('/')}>
        <SidebarItem icon={<Home size={24} />} label="Home" active={location.pathname === '/'} />
      </div>
      <div onClick={() => navigate('/playlists')}>
        <SidebarItem icon={<List size={24} />} label="Playlists" active={location.pathname.startsWith('/playlists')} />
      </div>
    </aside>
  );
};
