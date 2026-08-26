import React, { useState } from 'react';
import { Plus, Search, FolderOpen, Calendar, Trash2, ArrowRight } from 'lucide-react';
import type { Project } from '../types';

interface ProjectsViewProps {
  projects: Project[];
  loading: boolean;
  onSelectProject: (p: Project) => void;
  onCreateProject: (name: string, code?: string, description?: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects, loading, onSelectProject, onCreateProject, onDeleteProject,
}) => {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.code && p.code.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onCreateProject(name.trim(), code.trim() || undefined, desc.trim() || undefined);
      setName(''); setCode(''); setDesc('');
      setShowModal(false);
    } finally { setCreating(false); }
  };

  return (
    <>
      {/* Top bar */}
      <div className="topbar">
        <span className="text-sm font-semibold text-[var(--txt)]">Projects</span>
        <div className="topbar-actions">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--txt-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="input-field pl-8 py-1.5 text-xs w-52"
            />
          </div>
          <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm">
            <Plus size={13} /> New Project
          </button>
        </div>
      </div>

      <div className="page-content">
        {/* Stat row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="kpi-card">
            <div className="kpi-value">{projects.length}</div>
            <div className="kpi-label">Total Projects</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: 'var(--accent)' }}>
              {projects.reduce((s, p) => s + (p.drawingsCount || 0), 0)}
            </div>
            <div className="kpi-label">Total Drawings</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: 'var(--success)' }}>Active</div>
            <div className="kpi-label">Platform Status</div>
          </div>
        </div>

        {/* Upload area placeholder */}
        <div className="card mb-6">
          <div className="card-header">
            <span>Upload Drawings</span>
            <span className="text-[10px] text-[var(--txt-muted)] font-normal">Select a project first to upload</span>
          </div>
          <div className="drop-zone m-4" onClick={() => setShowModal(true)}>
            <div className="w-12 h-12 rounded-xl bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.2)] flex items-center justify-center mx-auto mb-3">
              <Plus size={22} className="text-[var(--accent)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--txt)] mb-1">Create a project to start</p>
            <p className="text-xs text-[var(--txt-muted)]">PDF floor plans, architectural drawings supported</p>
            <button className="btn btn-primary btn-sm mt-4">
              <Plus size={12} /> New Project
            </button>
          </div>
        </div>

        {/* Project grid */}
        <div className="card">
          <div className="card-header">
            <span className="flex items-center gap-2">
              <FolderOpen size={14} className="text-[var(--accent)]" />
              All Projects
            </span>
            <span className="text-[10px] text-[var(--txt-muted)] font-normal">{filtered.length} results</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {[1,2,3].map(i => <div key={i} className="h-36 rounded-lg bg-[rgba(255,255,255,0.04)] animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-[var(--txt-muted)] text-sm">
              <FolderOpen size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold mb-1">No projects yet</p>
              <p className="text-xs mb-4">Create your first project to start the AI takeoff workflow</p>
              <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
                <Plus size={12} /> Create Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {filtered.map(proj => (
                <div key={proj.id} className="project-card group" onClick={() => onSelectProject(proj)}>
                  {proj.code && (
                    <span className="tag mb-3 inline-block">{proj.code}</span>
                  )}
                  <h3 className="font-semibold text-[var(--txt)] mb-1.5 group-hover:text-[var(--accent)] transition-colors leading-snug">
                    {proj.name}
                  </h3>
                  <p className="text-xs text-[var(--txt-muted)] mb-4 line-clamp-2">
                    {proj.description || 'No description provided.'}
                  </p>
                  <div className="flex items-center justify-between text-[11px] pt-3 border-t border-[var(--border)]">
                    <div className="flex items-center gap-1.5 text-[var(--txt-dim)]">
                      <Calendar size={11} />
                      {new Date(proj.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm(`Delete "${proj.name}"?`)) onDeleteProject(proj.id); }}
                        className="text-[var(--txt-dim)] hover:text-[var(--danger)] transition-colors p-0.5"
                      >
                        <Trash2 size={11} />
                      </button>
                      <span className="text-[var(--accent)] font-semibold flex items-center gap-0.5">
                        Open <ArrowRight size={11} />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create project modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal fade-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-semibold text-[var(--txt)] flex items-center gap-2">
                <Plus size={16} className="text-[var(--accent)]" /> Create New Project
              </h3>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--txt-muted)] mb-1.5">Project Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g., Cairo Office Tower — Floor 3" className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--txt-muted)] mb-1.5">Reference Code</label>
                  <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g., PRJ-2026-CAI" className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--txt-muted)] mb-1.5">Description</label>
                  <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Architectural and structural shop drawings…" className="input-field" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm">Cancel</button>
                <button type="submit" disabled={creating} className="btn btn-primary btn-sm">
                  {creating ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
