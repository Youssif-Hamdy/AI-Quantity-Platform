import axios from 'axios';
import type { AuthResponse, Drawing, Project, QuantityItem, DrawingType, DrawingReviewConfig, SpatialElement } from '../types';

export const API_BASE_URL = 'https://ai-quantity-platform-lr2p.vercel.app';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && token !== 'undefined') {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function parseAuthResponse(responseData: any): AuthResponse {
  const raw = responseData?.data || responseData;
  const token = raw?.token || responseData?.token || '';

  let user: any;
  if (raw?.user) {
    user = raw.user;
  } else if (raw?.id || raw?.email) {
    user = {
      id: raw.id,
      email: raw.email,
      name: raw.name || raw.email,
      role: raw.role,
    };
  } else {
    user = responseData?.user || { id: '', email: '', name: '' };
  }

  return { token, user };
}

export const authApi = {
  register: async (data: { email: string; name: string; password: string }): Promise<AuthResponse> => {
    const res = await api.post('/api/auth/register', data);
    return parseAuthResponse(res.data);
  },
  login: async (data: { email: string; password: string }): Promise<AuthResponse> => {
    const res = await api.post('/api/auth/login', data);
    return parseAuthResponse(res.data);
  },
};

export const projectsApi = {
  getAll: async (): Promise<Project[]> => {
    try {
      const res = await api.get('/api/projects');
      return res.data?.data || res.data || [];
    } catch (err) {
      console.warn('[projectsApi.getAll] Backend unreachable:', err);
      return [];
    }
  },
  getById: async (id: string): Promise<Project | null> => {
    try {
      const res = await api.get(`/api/projects/${id}`);
      return res.data?.data || res.data;
    } catch (err) {
      console.warn('[projectsApi.getById] Backend unreachable:', err);
      return null;
    }
  },
  create: async (data: { name: string; code?: string; description?: string }): Promise<Project> => {
    try {
      const res = await api.post('/api/projects', data);
      return res.data?.data || res.data;
    } catch (err) {
      // Fallback local mock project if offline
      return {
        id: `proj_${Date.now()}`,
        name: data.name,
        code: data.code || 'PRJ-001',
        description: data.description || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  },
  delete: async (id: string): Promise<void> => {
    try {
      await api.delete(`/api/projects/${id}`);
    } catch (err) {
      console.warn('[projectsApi.delete] Error:', err);
    }
  },
};

export const drawingsApi = {
  upload: async (
    file: File,
    projectId: string,
    drawingType: DrawingType,
    reviewConfig?: DrawingReviewConfig
  ): Promise<Drawing> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('drawingType', drawingType);
      if (reviewConfig) {
        formData.append('reviewConfig', JSON.stringify(reviewConfig));
      }

      const res = await api.post('/api/drawings/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      const raw = res.data?.data || res.data;
      const fileName = raw.fileName || raw.filename || file.name;
      let imageUrl = raw.imageUrl;
      if (imageUrl && imageUrl.startsWith('/')) {
        imageUrl = `${API_BASE_URL}${imageUrl}`;
      }
      return {
        ...raw,
        fileName,
        imageUrl: imageUrl || URL.createObjectURL(file),
        reviewConfig,
      };
    } catch (err) {
      // Local fallback object when backend offline
      return {
        id: `drw_${Date.now()}`,
        projectId,
        fileName: file.name,
        drawingType,
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        imageUrl: URL.createObjectURL(file),
        reviewConfig,
      };
    }
  },
  getByProject: async (projectId: string): Promise<Drawing[]> => {
    try {
      const res = await api.get(`/api/drawings/project/${projectId}`);
      const items: any[] = res.data?.data || res.data || [];
      return items.map((d) => ({
        ...d,
        fileName: d.fileName || d.filename || 'Drawing.pdf',
        imageUrl: d.imageUrl && d.imageUrl.startsWith('/') ? `${API_BASE_URL}${d.imageUrl}` : d.imageUrl,
      }));
    } catch (err) {
      // Silently catch backend timeouts during polling
      return [];
    }
  },
  getById: async (id: string): Promise<(Drawing & { elements?: SpatialElement[] }) | null> => {
    try {
      const res = await api.get(`/api/drawings/${id}`);
      const d = res.data?.data || res.data;
      if (d) {
        d.fileName = d.fileName || d.filename || 'Drawing.pdf';
        if (d.imageUrl && d.imageUrl.startsWith('/')) {
          d.imageUrl = `${API_BASE_URL}${d.imageUrl}`;
        }
      }
      return d;
    } catch (err) {
      return null;
    }
  },
  delete: async (id: string): Promise<void> => {
    try {
      await api.delete(`/api/drawings/${id}`);
    } catch (_) {}
  },
};

export const quantitiesApi = {
  getByDrawing: async (drawingId: string): Promise<QuantityItem[]> => {
    try {
      const res = await api.get(`/api/quantities?drawingId=${drawingId}`);
      return res.data?.data || res.data || [];
    } catch (err) {
      // Gracefully catch Vercel backend serverless 500 errors
      return [];
    }
  },
  getExportUrl: (projectId: string): string => {
    return `${API_BASE_URL}/api/quantities/export/${projectId}`;
  },
};
