import React from 'react';
import { Home, List } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean }> = ({ icon, label, active }) => (
  <div className="hover-bg" style={{
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '10px 24px',
    cursor: 'pointer',
    backgroundColor: active ? 'var(--bg-secondary)' : 'transparent',
    borderRadius: '10px',
    margin: '0 12px',
    color: 'var(--text-primary)',
    transition: 'background-color 0.2s'
  }}>
    {icon}
    <span style={{ fontSize: '14px', fontWeight: active ? '500' : '400' }}>{label}</span>
  </div>
);

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside style={{
      width: '240px',
      height: '100%',
      overflowY: 'auto',
      padding: '12px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      flexShrink: 0
    }}>
      <div onClick={() => navigate('/')}>
        <SidebarItem icon={<Home size={24} />} label="Home" active={location.pathname === '/'} />
      </div>
      <div onClick={() => navigate('/playlists')}>
        <SidebarItem icon={<List size={24} />} label="Playlists" active={location.pathname.startsWith('/playlists')} />
      </div>
    </aside>
  );
};
