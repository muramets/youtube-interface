import React from 'react';
import { Home, Compass, PlaySquare, Clock, ThumbsUp, Film } from 'lucide-react';

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean }> = ({ icon, label, active }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '10px 24px',
    cursor: 'pointer',
    backgroundColor: active ? 'var(--bg-secondary)' : 'transparent',
    borderRadius: '10px',
    margin: '0 12px',
    color: 'var(--text-primary)'
  }}>
    {icon}
    <span style={{ fontSize: '14px', fontWeight: active ? '500' : '400' }}>{label}</span>
  </div>
);

export const Sidebar: React.FC = () => {
  return (
    <aside style={{
      width: '240px',
      height: 'calc(100vh - 56px)',
      position: 'sticky',
      top: '56px',
      overflowY: 'auto',
      padding: '12px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    }}>
      <SidebarItem icon={<Home size={24} />} label="Home" active />
      <SidebarItem icon={<Compass size={24} />} label="Explore" />
      <SidebarItem icon={<PlaySquare size={24} />} label="Subscriptions" />
      <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '12px 24px' }}></div>
      <SidebarItem icon={<Clock size={24} />} label="History" />
      <SidebarItem icon={<Film size={24} />} label="Your Videos" />
      <SidebarItem icon={<ThumbsUp size={24} />} label="Liked Videos" />
    </aside>
  );
};
