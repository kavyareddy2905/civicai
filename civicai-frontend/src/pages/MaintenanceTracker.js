import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, X, StickyNote, Trash2 } from 'lucide-react';
import SeverityBadge from '../components/SeverityBadge';
import {
  getMaintenanceTasks,
  updateMaintenanceStatus,
  deleteMaintenanceTask,
  resolveImageUrl,
} from '../services/api';
import { TASK_STATUSES, formatIssueType } from '../utils/constants';

const COLUMNS = [
  { key: 'Assigned', title: 'Assigned', tint: 'border-t-sky-500' },
  { key: 'In Progress', title: 'In Progress', tint: 'border-t-amber-500' },
  { key: 'Resolved', title: 'Resolved', tint: 'border-t-green-500' },
];

const NEXT_STATUS = {
  Assigned: 'In Progress',
  'In Progress': 'Resolved',
};

export default function MaintenanceTracker() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban'); // kanban | table
  const [notesModal, setNotesModal] = useState(null); // { task, nextStatus }
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getMaintenanceTasks();
      setTasks(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = { Assigned: [], 'In Progress': [], Resolved: [] };
    tasks.forEach((t) => {
      const key = TASK_STATUSES.includes(t.taskStatus) ? t.taskStatus : 'Assigned';
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  const openStatusUpdate = (task, nextStatus) => {
    setNotesModal({ task, nextStatus });
    setNotes(task.resolutionNotes || '');
  };

  const handleDelete = async (task) => {
    const insp = task.inspectionId || {};
    const label = formatIssueType(insp.issueType) || 'this task';
    if (!window.confirm(`Delete maintenance task for ${label}? This cannot be undone.`)) {
      return;
    }

    const taskId = task._id;
    setDeletingId(taskId);
    // Optimistic UI removal
    setTasks((prev) => prev.filter((t) => t._id !== taskId));

    try {
      const { data } = await deleteMaintenanceTask(taskId);
      if (!data.success) throw new Error(data.message || 'Delete failed');
      toast.success('Task deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Delete failed');
      // Roll back by reloading from server
      load();
    } finally {
      setDeletingId(null);
    }
  };

  const submitStatus = async (e) => {
    e.preventDefault();
    if (!notesModal) return;
    setSaving(true);
    try {
      const { data } = await updateMaintenanceStatus({
        taskId: notesModal.task._id,
        taskStatus: notesModal.nextStatus,
        notes: notes.trim() || undefined,
      });
      if (!data.success) throw new Error(data.message);
      toast.success(`Moved to ${notesModal.nextStatus}`);
      setNotesModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-navy-700" />
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900">
            Maintenance Task Tracker
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track assigned work through In Progress to Resolved, with resolution notes.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {['kanban', 'table'].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${
                view === v
                  ? 'bg-navy-800 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => (
            <section key={col.key} className={`rounded-xl border border-slate-200 border-t-4 bg-slate-50/80 ${col.tint}`}>
              <header className="flex items-center justify-between px-4 py-3">
                <h2 className="font-display text-sm font-semibold text-navy-900">
                  {col.title}
                </h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {grouped[col.key].length}
                </span>
              </header>
              <div className="space-y-3 px-3 pb-4">
                {grouped[col.key].length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-xs text-slate-400">
                    No tasks
                  </p>
                )}
                {grouped[col.key].map((task) => (
                  <TaskCard
                    key={task._id}
                    task={task}
                    deleting={deletingId === task._id}
                    onAdvance={
                      NEXT_STATUS[task.taskStatus]
                        ? () => openStatusUpdate(task, NEXT_STATUS[task.taskStatus])
                        : undefined
                    }
                    onNotes={() => openStatusUpdate(task, task.taskStatus)}
                    onDelete={() => handleDelete(task)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="card-panel overflow-x-auto !p-0">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Issue</th>
                <th className="px-4 py-3 font-semibold">Team</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Assigned</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No maintenance tasks yet. Assign from the GIS map.
                  </td>
                </tr>
              )}
              {tasks.map((task) => {
                const insp = task.inspectionId || {};
                return (
                  <tr key={task._id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-navy-900">
                        {formatIssueType(insp.issueType)}
                      </div>
                      <div className="text-xs text-slate-500">Ward {insp.ward || '—'}</div>
                    </td>
                    <td className="px-4 py-3">{task.assignedTeam}</td>
                    <td className="px-4 py-3">
                      <PriorityPill priority={task.priority} />
                    </td>
                    <td className="px-4 py-3">{task.taskStatus}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {task.assignedAt
                        ? new Date(task.assignedAt).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {NEXT_STATUS[task.taskStatus] && (
                          <button
                            type="button"
                            className="btn-primary !px-3 !py-1.5 text-xs"
                            onClick={() =>
                              openStatusUpdate(task, NEXT_STATUS[task.taskStatus])
                            }
                          >
                            → {NEXT_STATUS[task.taskStatus]}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secondary !px-3 !py-1.5 text-xs"
                          onClick={() => openStatusUpdate(task, task.taskStatus)}
                        >
                          Notes
                        </button>
                        <button
                          type="button"
                          title="Delete task"
                          disabled={deletingId === task._id}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          onClick={() => handleDelete(task)}
                        >
                          {deletingId === task._id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {notesModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-navy-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold text-navy-900">
                  {notesModal.nextStatus !== notesModal.task.taskStatus
                    ? `Update to ${notesModal.nextStatus}`
                    : 'Resolution notes'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {notesModal.task.assignedTeam}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                onClick={() => setNotesModal(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitStatus} className="space-y-4">
              <div>
                <label className="label-field" htmlFor="res-notes">
                  Notes
                </label>
                <textarea
                  id="res-notes"
                  rows={4}
                  className="input-field"
                  placeholder="Work performed, materials used, follow-up needed…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setNotesModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PriorityPill({ priority }) {
  const styles = {
    Low: 'bg-green-50 text-green-700',
    Medium: 'bg-yellow-50 text-yellow-800',
    High: 'bg-orange-50 text-orange-700',
    Urgent: 'bg-red-50 text-red-700',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        styles[priority] || styles.Medium
      }`}
    >
      {priority}
    </span>
  );
}

function TaskCard({ task, onAdvance, onNotes, onDelete, deleting }) {
  const insp = task.inspectionId || {};
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex gap-3">
        <div className="h-14 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100">
          {insp.imageUrl ? (
            <img
              src={resolveImageUrl(insp.imageUrl)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="truncate text-sm font-semibold text-navy-900">
              {formatIssueType(insp.issueType)}
            </div>
            <button
              type="button"
              title="Delete task"
              aria-label="Delete task"
              disabled={deleting}
              onClick={onDelete}
              className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Ward {insp.ward || '—'} · {task.assignedTeam}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PriorityPill priority={task.priority} />
            {insp.severityLevel && (
              <SeverityBadge level={insp.severityLevel} size="sm" />
            )}
          </div>
        </div>
      </div>
      {task.resolutionNotes && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-500">
          <StickyNote className="mr-1 inline h-3 w-3" />
          {task.resolutionNotes}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {onAdvance && (
          <button
            type="button"
            className="btn-primary !px-3 !py-1.5 text-xs"
            onClick={onAdvance}
          >
            Mark {NEXT_STATUS[task.taskStatus]}
          </button>
        )}
        <button
          type="button"
          className="btn-secondary !px-3 !py-1.5 text-xs"
          onClick={onNotes}
        >
          Notes
        </button>
      </div>
    </article>
  );
}
