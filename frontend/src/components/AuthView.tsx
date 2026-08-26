import React, { useState } from 'react';
import { LogIn, UserPlus, Lock, Mail, User as UserIcon } from 'lucide-react';
import { authApi } from '../services/api';
import type { User as UserType } from '../types';

interface AuthViewProps {
  onSuccess: (user: UserType, token: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isLogin) {
        const res = await authApi.login({ email, password });
        if (res.token && res.user?.id) { localStorage.setItem('token', res.token); onSuccess(res.user, res.token); }
        else setError('Invalid response from server. Missing token.');
      } else {
        const res = await authApi.register({ email, name, password });
        if (res.token && res.user?.id) { localStorage.setItem('token', res.token); onSuccess(res.user, res.token); }
        else setError('Registration response was invalid or missing token.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Authentication failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      {/* Decorative blobs */}
      <div style={{ position: 'fixed', top: '10%', left: '15%', width: 280, height: 280, background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '15%', right: '10%', width: 220, height: 220, background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="auth-card fade-up" style={{ position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#3b82f6,#06b6d4)', marginBottom: 14 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '2px', background: 'linear-gradient(90deg,#3b82f6,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 8 }}>
            SPEC_FLOW
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0', marginBottom: 4 }}>
            {isLogin ? 'Welcome back' : 'Create account'}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--txt-muted)' }}>
            {isLogin ? 'Sign in to your AI quantity takeoff workspace' : 'Start analyzing drawings with AI automatically'}
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 12, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!isLogin && (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', marginBottom: 6 }}>Full Name</label>
              <div style={{ position: 'relative' }}>
                <UserIcon size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} />
                <input type="text" required placeholder="Eng. Ahmed Hassan" value={name} onChange={e => setName(e.target.value)} className="input-field" style={{ paddingLeft: 36 }} />
              </div>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', marginBottom: 6 }}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} />
              <input type="email" required placeholder="engineer@company.com" value={email} onChange={e => setEmail(e.target.value)} className="input-field" style={{ paddingLeft: 36 }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', marginBottom: 6 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} />
              <input type="password" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="input-field" style={{ paddingLeft: 36 }} />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ padding: '10px 0', marginTop: 4, width: '100%', fontSize: 13 }}>
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
            ) : isLogin ? (
              <><LogIn size={15} /> Sign In</>
            ) : (
              <><UserPlus size={15} /> Create Account</>
            )}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <button onClick={() => { setIsLogin(!isLogin); setError(null); }} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {isLogin ? "Don't have an account? Register here" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};
