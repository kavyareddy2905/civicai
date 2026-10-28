import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Filter, Loader2, X } from 'lucide-react';
import GISMap from '../components/GISMap';
import {
  getInspections,
  getMaintenanceTasks,
  assignMaintenance,
} from '../services/api';
import {
  ISSUE_TYPES,
  SEVERITY_LEVELS,
  MAINTENANCE_STATUSES,
  TEAMS,
} from '../utils/constants';
import { useAuth } from '../context/AuthContext';

// Local priority hint map (severity → task priority)
const PRIORITY_FROM_SEVERITY = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
  Critical: 'Urgent',
};

export default function GISMapView() {
  const { user } = useAuth();
  const canAssign = user?.role === 'Officer' || user?.role === 'Maintenance';

  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: '',
    severity: '',
    status: '',
    ward: '',
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [assignTarget, setAssignTarget] = useState(null);
  const [assignForm, setAssignForm] = useState({
    assignedTeam: TEAMS[0],
    priority: 'Medium',
    dueDate: '',
    notes: '',
  });
  const [assigning, setAssigning] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.category) params.category = filters.category;
      if (filters.severity) params.severity = filters.severity;
      if (filters.status) params.status = filters.status;
      if (filters.ward) params.ward = filters.ward.trim();

      const [inspRes, taskRes] = await Promise.all([
        getInspections({ ...params, limit: 100 }),
        getMaintenanceTasks(),
      ]);

      const tasks = taskRes.data?.data || [];
      const teamMap = {};
      tasks.forEach((t) => {
        const id = t.inspectionId?._id || t.inspectionId;
        if (id && !teamMap[id]) teamMap[id] = t.assignedTeam;
      });

      const items = (inspRes.data?.data || []).map((item) => ({
        ...item,
        assignedTeam: teamMap[item._id] || null,
      }));
      setInspections(items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load map data');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const wards = useMemo(() => {
    const set = new Set(inspections.map((i) => i.ward).filter(Boolean));
    return [...set].sort();
  }, [inspections]);

  const openAssign = (inspection) => {
    if (!canAssign) {
      toast.error('Only officers can assign maintenance tasks');
      return;
    }
    setAssignTarget(inspection);
    setAssignForm({
      assignedTeam: TEAMS[0],
      priority: PRIORITY_FROM_SEVERITY[inspection.severityLevel] || 'Medium',
      dueDate: '',
      notes: '',
    });
  };

  const submitAssign = async (e) => {
    e.preventDefault();
    if (!assignTarget) return;
    setAssigning(true);
    try {
      const { data } = await assignMaintenance({
        inspectionId: assignTarget._id,
        assignedTeam: assignForm.assignedTeam,
        priority: assignForm.priority,
        dueDate: assignForm.dueDate || undefined,
        notes: assignForm.notes || undefined,
      });
      if (!data.success) throw new Error(data.message);
      toast.success('Task assigned successfully');
      setAssignTarget(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Assign failed');
    } finally {
      setAssigning(false);
    }
  };

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col lg:flex-row">
      {/* Filters sidebar */}
      <aside
        className={`border-b border-slate-200 bg-white lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r ${
          sidebarOpen ? 'block' : 'hidden lg:block'
        }`}
      >
        <div className="sticky top-16 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-navy-900">
              <Filter className="h-4 w-4" />
              Map filters
            </h2>
            <button
              type="button"
              className="text-xs font-medium text-navy-600 hover:underline"
              onClick={() =>
                setFilters({ category: '', severity: '', status: '', ward: '' })
              }
            >
              Clear
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label-field" htmlFor="f-category">
                Category
              </label>
              <select
                id="f-category"
                className="input-field"
                value={filters.category}
                onChange={(e) => updateFilter('category', e.target.value)}
              >
                <option value="">All categories</option>
                {ISSUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field" htmlFor="f-severity">
                Severity
              </label>
              <select
                id="f-severity"
                className="input-field"
                value={filters.severity}
                onChange={(e) => updateFilter('severity', e.target.value)}
              >
                <option value="">All severities</option>
                {SEVERITY_LEVELS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field" htmlFor="f-status">
                Status
              </label>
              <select
                id="f-status"
                className="input-field"
                value={filters.status}
                onChange={(e) => updateFilter('status', e.target.value)}
              >
                <option value="">All statuses</option>
                {MAINTENANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field" htmlFor="f-ward">
                Ward
              </label>
              <input
                id="f-ward"
                list="ward-options"
                className="input-field"
                placeholder="Filter by ward"
                value={filters.ward}
                onChange={(e) => updateFilter('ward', e.target.value)}
              />
              <datalist id="ward-options">
                {wards.map((w) => (
                  <option key={w} value={w} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <div className="mb-2 font-semibold text-navy-800">Severity legend</div>
            <ul className="space-y-1.5">
              {[
                ['Low', 'bg-green-500'],
                ['Medium', 'bg-yellow-500'],
                ['High', 'bg-orange-500'],
                ['Critical', 'bg-red-500'],
              ].map(([label, cls]) => (
                <li key={label} className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${cls}`} />
                  {label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-slate-500">
              Showing <strong className="text-navy-800">{inspections.length}</strong> inspections
            </p>
          </div>
        </div>
      </aside>

      <div className="relative flex-1">
        <button
          type="button"
          className="absolute left-3 top-3 z-[500] btn-secondary !py-2 lg:hidden"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <Filter className="h-4 w-4" />
          Filters
        </button>

        {loading ? (
          <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-slate-100">
            <Loader2 className="h-8 w-8 animate-spin text-navy-700" />
          </div>
        ) : (
          <GISMap
            inspections={inspections}
            onAssign={canAssign ? openAssign : undefined}
            height="calc(100vh - 64px)"
            className="!rounded-none !border-0"
          />
        )}
      </div>

      {/* Assign Task modal */}
      {assignTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-navy-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold text-navy-900">
                  Assign Task
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Ward {assignTarget.ward} · {assignTarget.severityLevel} severity
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setAssignTarget(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitAssign} className="space-y-3">
              <div>
                <label className="label-field" htmlFor="team">
                  Assigned team
                </label>
                <select
                  id="team"
                  className="input-field"
                  value={assignForm.assignedTeam}
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, assignedTeam: e.target.value }))
                  }
                >
                  {TEAMS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field" htmlFor="priority">
                  Priority
                </label>
                <select
                  id="priority"
                  className="input-field"
                  value={assignForm.priority}
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, priority: e.target.value }))
                  }
                >
                  {['Low', 'Medium', 'High', 'Urgent'].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field" htmlFor="due">
                  Due date
                </label>
                <input
                  id="due"
                  type="date"
                  className="input-field"
                  value={assignForm.dueDate}
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, dueDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="label-field" htmlFor="anotes">
                  Notes
                </label>
                <textarea
                  id="anotes"
                  rows={2}
                  className="input-field"
                  value={assignForm.notes}
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setAssignTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={assigning}>
                  {assigning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Assign'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
