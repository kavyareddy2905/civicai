const Inspection = require('../models/Inspection');
const MaintenanceTask = require('../models/MaintenanceTask');
const StatusHistory = require('../models/StatusHistory');

const SEVERITY_TO_PRIORITY = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
  Critical: 'Urgent',
};

/** Default crew by civic issue type */
const DEFAULT_TEAM_BY_ISSUE = {
  pothole: 'Roads & Pavement Crew',
  garbage: 'Sanitation Crew',
  water_leakage: 'Water Works Crew',
  drainage_blockage: 'Drainage Crew',
  broken_streetlight: 'Street Lighting Crew',
};

const DEFAULT_TEAM = process.env.DEFAULT_MAINTENANCE_TEAM || 'Civic Response Team';

function resolveDefaultTeam(issueType) {
  return DEFAULT_TEAM_BY_ISSUE[issueType] || DEFAULT_TEAM;
}

function resolvePriority(severityLevel, override) {
  if (override && ['Low', 'Medium', 'High', 'Urgent'].includes(override)) {
    return override;
  }
  return SEVERITY_TO_PRIORITY[severityLevel] || 'Medium';
}

function defaultDueDate(priority) {
  const days = { Urgent: 1, High: 3, Medium: 7, Low: 14 }[priority] || 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Create a MaintenanceTask for an inspection if one does not already exist.
 * Sets inspection.maintenanceStatus to Assigned when creating.
 */
async function ensureMaintenanceTaskForInspection(inspection, options = {}) {
  const {
    assignedTeam,
    priority,
    assignedBy = null,
    notes,
    forceNew = false,
  } = options;

  if (!inspection || !inspection._id) {
    throw new Error('Inspection is required');
  }

  if (inspection.maintenanceStatus === 'Resolved' && !forceNew) {
    const existingResolved = await MaintenanceTask.findOne({
      inspectionId: inspection._id,
    }).sort({ createdAt: -1 });
    return { task: existingResolved, created: false, skipped: true };
  }

  const existing = await MaintenanceTask.findOne({
    inspectionId: inspection._id,
    taskStatus: { $ne: 'Resolved' },
  }).sort({ createdAt: -1 });

  if (existing && !forceNew) {
    return { task: existing, created: false, skipped: false };
  }

  const team = assignedTeam || resolveDefaultTeam(inspection.issueType);
  const taskPriority = resolvePriority(inspection.severityLevel, priority);
  const previousStatus = inspection.maintenanceStatus || 'Detected';

  const task = await MaintenanceTask.create({
    inspectionId: inspection._id,
    assignedTeam: team,
    priority: taskPriority,
    taskStatus: 'Assigned',
    assignedAt: new Date(),
    dueDate: defaultDueDate(taskPriority),
    assignedBy: assignedBy || inspection.inspectorId || undefined,
    resolutionNotes:
      notes ||
      `Auto-assigned on inspection upload (${inspection.issueType}, ${inspection.severityLevel})`,
  });

  if (inspection.maintenanceStatus !== 'Assigned' && inspection.maintenanceStatus !== 'In Progress') {
    inspection.maintenanceStatus = 'Assigned';
    await inspection.save();
  }

  if (assignedBy || inspection.inspectorId) {
    await StatusHistory.create({
      inspectionId: inspection._id,
      previousStatus,
      newStatus: 'Assigned',
      changedBy: assignedBy || inspection.inspectorId,
      notes: notes || `Auto-created maintenance task → ${team}`,
    });
  }

  return { task, created: true, skipped: false };
}

/**
 * Backfill MaintenanceTasks only for inspections still in "Detected"
 * that never received a task (e.g. upload auto-assign failed).
 * Does NOT recreate tasks that were intentionally deleted while the
 * inspection was already Assigned / In Progress.
 */
async function syncTasksForUnresolvedInspections(changedBy = null) {
  const pending = await Inspection.find({
    maintenanceStatus: 'Detected',
  }).select('_id issueType severityLevel maintenanceStatus inspectorId');

  let created = 0;
  const tasks = [];

  for (const inspection of pending) {
    const hasTask = await MaintenanceTask.exists({ inspectionId: inspection._id });
    if (hasTask) continue;

    const result = await ensureMaintenanceTaskForInspection(inspection, {
      assignedBy: changedBy || inspection.inspectorId,
      notes: 'Backfilled from unresolved inspection',
    });
    if (result.created) {
      created += 1;
      tasks.push(result.task);
    }
  }

  return { created, inspected: pending.length, tasks };
}

module.exports = {
  SEVERITY_TO_PRIORITY,
  DEFAULT_TEAM_BY_ISSUE,
  DEFAULT_TEAM,
  resolveDefaultTeam,
  resolvePriority,
  ensureMaintenanceTaskForInspection,
  syncTasksForUnresolvedInspections,
};
