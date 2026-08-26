import React from 'react';
import { LayoutDashboard, FileText, Cpu, Users, LogOut } from 'lucide-react';
import type { User } from '../types';
import type { AppView } from '../App';

interface SidebarProps {
  user: User;
  activeView: AppView;
  onNavigate: (view: string) => void;
  onLogout: () => void;
}

const navItems = [
  { id: 'PROJECTS',   label: 'Projects',  icon: LayoutDashboard },
  { id: 'ESTIMATES',  label: 'Estimates', icon: FileText },
  { id: 'AI_TOOLS',   label: 'AI Tools',  icon: Cpu },
  { id: 'TEAM',       label: 'Team',      icon: Users },
];

export const Sidebar: React.FC<SidebarProps> = ({ user, activeView, onNavigate, onLogout }) => {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <div>
          <div className="brand">SPEC_FLOW</div>
          <div className="brand-badge">AI PLATFORM</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Workspace</div>
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item w-full text-left ${activeView === id || (activeView === 'PROJECT_DETAILS' && id === 'PROJECTS') || (activeView === 'CANVAS' && id === 'PROJECTS') ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <Icon className="nav-icon" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* User */}
      <div className="sidebar-user">
        <div className="avatar">{user.name?.charAt(0).toUpperCase() || 'U'}</div>
        <div className="flex-1 min-w-0">
          <div className="user-name truncate">{user.name}</div>
          <div className="user-role truncate">{user.role?.replace(/_/g, ' ') || user.email}</div>
        </div>
        <button
          onClick={onLogout}
          title="Sign out"
          className="text-[var(--txt-dim)] hover:text-[var(--danger)] transition-colors ml-1 flex-shrink-0"
        >
          <LogOut size={13} />
        </button>
      </div>
    </aside>
  );
};
