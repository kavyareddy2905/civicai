import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
export const ASSET_BASE = process.env.REACT_APP_ASSET_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('civicai_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== '/login') {
        localStorage.removeItem('civicai_token');
        localStorage.removeItem('civicai_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const resolveImageUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) {
    return path;
  }
  return `${ASSET_BASE}${path.startsWith('/') ? path : `/${path}`}`;
};

/* ---------- Auth ---------- */
export const login = (email, password) =>
  api.post('/auth/login', { email, password });

export const register = (payload) => api.post('/auth/register', payload);

export const getMe = () => api.get('/auth/me');

/* ---------- Inspections ---------- */
export const uploadInspection = (formData) =>
  api.post('/inspections/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const getInspections = (params = {}) =>
  api.get('/inspections', { params });

export const getInspection = (id) => api.get(`/inspections/${id}`);

export const getHotspots = (params = {}) =>
  api.get('/inspections/hotspots', { params });

export const verifyInspection = (id, body) =>
  api.patch(`/inspections/${id}/verify`, body);

/* ---------- Maintenance ---------- */
export const getMaintenanceTasks = (params = {}) =>
  api.get('/maintenance', { params });

export const assignMaintenance = (body) =>
  api.post('/maintenance/assign', body);

export const updateMaintenanceStatus = (body) =>
  api.patch('/maintenance/status', body);

export const deleteMaintenanceTask = (id) =>
  api.delete(`/maintenance/${id}`);

export const getStatusHistory = (inspectionId) =>
  api.get(`/maintenance/history/${inspectionId}`);

/* ---------- Analytics ---------- */
export const getDashboardAnalytics = () => api.get('/analytics/dashboard');

export default api;
