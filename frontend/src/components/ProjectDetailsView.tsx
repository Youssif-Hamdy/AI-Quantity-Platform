import React, { useState } from 'react';
import {
  UploadCloud, FileText, FileSpreadsheet, ArrowLeft,
  CheckCircle2, AlertCircle, Clock, RefreshCw, Eye, Trash2, Layers,
} from 'lucide-react';
import type { Project, Drawing, DrawingType, DrawingReviewConfig } from '../types';
import { quantitiesApi } from '../services/api';
import { CadReviewModal } from './CadReviewModal';

interface ProjectDetailsViewProps {
  project: Project;
  drawings: Drawing[];
  uploading: boolean;
  onBack: () => void;
  onUploadDrawing: (file: File, drawingType: DrawingType, reviewConfig?: DrawingReviewConfig) => Promise<void>;
  onSelectDrawing: (drawing: Drawing) => void;
  onDeleteDrawing: (id: string) => Promise<void>;
}

const DRAWING_TYPES: DrawingType[] = ['ARCHITECTURAL', 'CIVIL', 'MIXED'];

export const ProjectDetailsView: React.FC<ProjectDetailsViewProps> = ({
  project, drawings, uploading, onBack,
  onUploadDrawing, onSelectDrawing, onDeleteDrawing,
}) => {
  const [selectedType, setSelectedType] = useState<DrawingType>('ARCHITECTURAL');
  const [dragActive, setDragActive] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      setStagedFile(e.dataTransfer.files[0]);
      setIsReviewOpen(true);
    }
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setStagedFile(e.target.files[0]);
      setIsReviewOpen(true);
    }
  };

  const handleConfirmReview = (reviewConfig: DrawingReviewConfig) => {
    if (stagedFile) {
      onUploadDrawing(stagedFile, reviewConfig.drawingType, reviewConfig);
    }
    setIsReviewOpen(false);
    setStagedFile(null);
  };

  const exportUrl = quantitiesApi.getExportUrl(project.id);
  const completed = drawings.filter(d => d.status === 'COMPLETED').length;

  return (
    <>
      {/* Top bar */}
      <div className="topbar">
        <button onClick={onBack} className="btn btn-ghost btn-sm flex items-center gap-1.5">
          <ArrowLeft size={13} /> Projects
        </button>
        <div className="topbar-breadcrumb">
          {project.code && <span className="tag">{project.code}</span>}
          <span className="topbar-sep">/</span>
          <span className="current">{project.name}</span>
        </div>
        <div className="topbar-actions">
          <a href={exportUrl} target="_blank" rel="noopener noreferrer" className="btn btn-success btn-sm">
            <FileSpreadsheet size={13} /> Export BOQ
          </a>
        </div>
      </div>

      <div className="page-content space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="kpi-card">
            <div className="kpi-value">{drawings.length}</div>
            <div className="kpi-label">Drawings</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: 'var(--success)' }}>{completed}</div>
            <div className="kpi-label">Analyzed</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: 'var(--warning)' }}>{drawings.length - completed}</div>
            <div className="kpi-label">In Queue</div>
          </div>
        </div>

        {/* Upload card */}
        <div className="card">
          <div className="card-header">
            <span className="flex items-center gap-2">
              <UploadCloud size={14} className="text-[var(--accent)]" /> Upload Drawing (PDF)
            </span>
          </div>
          <div className="p-4 space-y-3">
            {/* Drawing type selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--txt-muted)] font-semibold w-28">Drawing type:</span>
              <div className="flex gap-1.5">
                {DRAWING_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setSelectedType(t)}
                    className={`btn btn-sm ${selectedType === t ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
              onDrop={handleFileDrop}
              className={`drop-zone ${dragActive ? 'active' : ''}`}
            >
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.svg,.webp,.dwg,image/*"
                onChange={handleFileInput}
                className="hidden"
                id="pdf-upload-input"
              />
              <label htmlFor="pdf-upload-input" className="cursor-pointer block">
                <UploadCloud size={30} className="text-[var(--accent)] mx-auto mb-2 opacity-80" />
                <p className="text-sm font-semibold text-[var(--txt)] mb-1">Click to upload or drag & drop Drawing</p>
                <p className="text-xs text-[var(--txt-muted)]">PDF, PNG, JPG, JPEG, DWG floor plans up to 50 MB</p>
              </label>
              {uploading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--accent)]">
                  <span className="w-4 h-4 border-2 border-[rgba(59,130,246,0.3)] border-t-[var(--accent)] rounded-full animate-spin" />
                  Uploading to AI engine…
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drawings table */}
        <div className="card">
          <div className="card-header">
            <span className="flex items-center gap-2">
              <Layers size={14} className="text-[var(--accent-2)]" />
              Drawings ({drawings.length})
            </span>
          </div>
          {drawings.length === 0 ? (
            <div className="text-center py-12 text-[var(--txt-muted)] text-sm">
              <FileText size={32} className="mx-auto mb-3 opacity-25" />
              <p className="font-semibold mb-1">No drawings yet</p>
              <p className="text-xs">Upload a PDF drawing above to start AI quantity takeoff</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>Type</th>
                    <th>Uploaded</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drawings.map(d => (
                    <tr key={d.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <FileText size={13} className="text-[var(--accent)] flex-shrink-0" />
                          <span className="font-medium truncate max-w-xs">{d.fileName}</span>
                        </div>
                      </td>
                      <td><span className="tag">{d.drawingType}</span></td>
                      <td className="text-[var(--txt-muted)]">{new Date(d.createdAt).toLocaleDateString()}</td>
                      <td>
                        {d.status === 'COMPLETED'  && <span className="badge badge-completed"><CheckCircle2 size={11} /> Completed</span>}
                        {d.status === 'ANALYZING'  && <span className="badge badge-analyzing"><RefreshCw size={11} className="animate-spin" /> Analyzing…</span>}
                        {d.status === 'PENDING'    && <span className="badge badge-pending"><Clock size={11} /> Queued</span>}
                        {d.status === 'FAILED'     && <span className="badge badge-failed" title={d.errorMessage}><AlertCircle size={11} /> Failed</span>}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onSelectDrawing({ ...d, status: 'COMPLETED' })}
                            className="btn btn-sm btn-primary"
                          >
                            <Eye size={12} /> Open Canvas
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete "${d.fileName}"?`)) onDeleteDrawing(d.id); }}
                            className="text-[var(--txt-dim)] hover:text-[var(--danger)] transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Interactive CAD Review & Inspection Modal */}
      <CadReviewModal
        isOpen={isReviewOpen}
        file={stagedFile}
        onClose={() => {
          setIsReviewOpen(false);
          setStagedFile(null);
        }}
        onConfirm={handleConfirmReview}
      />
    </>
  );
};
