export const ISSUE_TYPES = [
  { value: 'pothole', label: 'Pothole' },
  { value: 'garbage', label: 'Garbage' },
  { value: 'water_leakage', label: 'Water Leakage' },
  { value: 'drainage_blockage', label: 'Drainage Blockage' },
  { value: 'broken_streetlight', label: 'Broken Streetlight' },
];

export const SEVERITY_LEVELS = ['Low', 'Medium', 'High', 'Critical'];

export const MAINTENANCE_STATUSES = ['Detected', 'Assigned', 'In Progress', 'Resolved'];

export const TASK_STATUSES = ['Assigned', 'In Progress', 'Resolved'];

export const SEVERITY_COLORS = {
  Low: '#16a34a',
  Medium: '#ca8a04',
  High: '#ea580c',
  Critical: '#dc2626',
};

export const SEVERITY_MARKER_HEX = {
  Low: '#22c55e',
  Medium: '#eab308',
  High: '#f97316',
  Critical: '#ef4444',
};

export const TEAMS = [
  'Roads & Pavement Unit',
  'Sanitation Crew A',
  'Sanitation Crew B',
  'Water Works Team',
  'Drainage Response Unit',
  'Electrical / Streetlight Team',
  'Ward Rapid Response',
];

export const DEFAULT_MAP_CENTER = [17.385, 78.4867]; // Hyderabad
export const DEFAULT_MAP_ZOOM = 12;

export const formatIssueType = (type) => {
  if (!type) return '—';
  return ISSUE_TYPES.find((t) => t.value === type)?.label
    || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export const formatPercent = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
};

export const roleHomePath = (role) => {
  if (role === 'Inspector') return '/upload';
  if (role === 'Officer' || role === 'Maintenance') return '/dashboard';
  return '/login';
};

export const canAccessRoute = (role, path) => {
  if (!role) return false;
  if (path === '/login') return true;
  if (path === '/map') return true;
  if (path === '/upload') return role === 'Inspector' || role === 'Officer';
  if (path === '/dashboard') return role === 'Officer' || role === 'Maintenance';
  if (path === '/maintenance') return role === 'Officer' || role === 'Maintenance';
  return false;
};
