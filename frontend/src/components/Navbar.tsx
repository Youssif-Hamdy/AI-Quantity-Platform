import React from 'react';
import { Layers, LogOut, PlusCircle, Sparkles } from 'lucide-react';
import type { User } from '../types';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  onNewProject: () => void;
  onNavigateHome: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onNewProject,
  onNavigateHome,
}) => {
  return (
    <header className="glass-panel sticky top-0 z-40 px-6 py-3 border-b border-slate-800/80 flex items-center justify-between">
      <div className="flex items-center gap-3 cursor-pointer" onClick={onNavigateHome}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Layers className="w-6 h-6 text-slate-950" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-300 leading-tight">
              KREO Takeoff AI
            </h1>
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-mono font-bold">
              PRO
            </span>
          </div>
          <p className="text-xs text-teal-400 font-medium tracking-wide">
            AI Quantity Surveying & CAD Workstation
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <>
            <button
              onClick={onNewProject}
              className="btn btn-primary text-xs py-2 px-4 shadow-md shadow-cyan-500/20"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Takeoff Project</span>
            </button>

            <div className="h-6 w-px bg-slate-800" />

            <div className="flex items-center gap-3 bg-slate-900/80 py-1.5 px-3 rounded-lg border border-slate-800">
              <div className="w-7 h-7 rounded-full bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold text-xs">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-xs font-semibold text-slate-200">{user.name}</p>
                <p className="text-[10px] text-teal-400 font-mono">
                  {user.role ? user.role.replace(/_/g, ' ') : user.email}
                </p>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            <span>AI Cloud Engine Ready</span>
          </div>
        )}
      </div>
    </header>
  );
};
