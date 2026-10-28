const express = require('express');
const Inspection = require('../models/Inspection');
const MaintenanceTask = require('../models/MaintenanceTask');
const StatusHistory = require('../models/StatusHistory');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  resolveDefaultTeam,
  ensureMaintenanceTaskForInspection,
  syncTasksForUnresolvedInspections,
} = require('../utils/maintenanceHelpers');

const router = express.Router();

/**
 * POST /api/maintenance/assign
 * Body: { inspectionId, assignedTeam?, priority?, dueDate?, notes? }
 * Creates or updates the open task for an inspection (idempotent).
 */
router.post(
  '/assign',
  protect,
  authorize('Officer', 'Maintenance'),
  async (req, res) => {
    try {
      const { inspectionId, assignedTeam, priority, dueDate, notes } = req.body;

      if (!inspectionId) {
        return res.status(400).json({
          success: false,
          message: 'inspectionId is required',
        });
      }

      const inspection = await Inspection.findById(inspectionId);
      if (!inspection) {
        return res.status(404).json({
          success: false,
          message: 'Inspection not found',
        });
      }

      if (inspection.maintenanceStatus === 'Resolved') {
        return res.status(400).json({
          success: false,
          message: 'Cannot assign a resolved inspection',
        });
      }

      const team = assignedTeam || resolveDefaultTeam(inspection.issueType);

      // Reuse open task if present; otherwise create
      let task = await MaintenanceTask.findOne({
        inspectionId: inspection._id,
        taskStatus: { $ne: 'Resolved' },
      }).sort({ createdAt: -1 });

      const previousStatus = inspection.maintenanceStatus;

      if (task) {
        task.assignedTeam = team;
        if (priority && ['Low', 'Medium', 'High', 'Urgent'].includes(priority)) {
          task.priority = priority;
        }
        if (dueDate) task.dueDate = new Date(dueDate);
        if (notes) task.resolutionNotes = notes;
        task.taskStatus = 'Assigned';
        task.assignedAt = new Date();
        task.assignedBy = req.user._id;
        await task.save();
      } else {
        const result = await ensureMaintenanceTaskForInspection(inspection, {
          assignedTeam: team,
          priority,
          assignedBy: req.user._id,
          notes: notes || `Assigned to team: ${team}`,
        });
        task = result.task;
        if (dueDate) {
          task.dueDate = new Date(dueDate);
          await task.save();
        }
      }

      if (inspection.maintenanceStatus !== 'Assigned') {
        inspection.maintenanceStatus = 'Assigned';
        await inspection.save();

        await StatusHistory.create({
          inspectionId: inspection._id,
          previousStatus,
          newStatus: 'Assigned',
          changedBy: req.user._id,
          notes: notes || `Assigned to team: ${team}`,
        });
      }

      const populated = await MaintenanceTask.findById(task._id)
        .populate('inspectionId')
        .populate('assignedBy', 'name email role');

      return res.status(201).json({
        success: true,
        message: 'Maintenance task assigned',
        data: populated,
      });
    } catch (error) {
      console.error('Assign maintenance error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to assign maintenance task',
        error: error.message,
      });
    }
  }
);

/**
 * PATCH /api/maintenance/status
 * Body: { taskId?, inspectionId?, taskStatus, notes? }
 */
router.patch(
  '/status',
  protect,
  authorize('Officer', 'Maintenance'),
  async (req, res) => {
    try {
      const { taskId, inspectionId, taskStatus, notes } = req.body;

      if (!taskStatus || !['Assigned', 'In Progress', 'Resolved'].includes(taskStatus)) {
        return res.status(400).json({
          success: false,
          message: "taskStatus must be one of: 'Assigned', 'In Progress', 'Resolved'",
        });
      }

      if (!taskId && !inspectionId) {
        return res.status(400).json({
          success: false,
          message: 'Provide taskId or inspectionId',
        });
      }

      let task = null;
      if (taskId) {
        task = await MaintenanceTask.findById(taskId);
      } else {
        task = await MaintenanceTask.findOne({ inspectionId }).sort({ createdAt: -1 });
      }

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance task not found',
        });
      }

      const inspection = await Inspection.findById(task.inspectionId);
      if (!inspection) {
        return res.status(404).json({
          success: false,
          message: 'Linked inspection not found',
        });
      }

      const previousTaskStatus = task.taskStatus;
      const previousInspectionStatus = inspection.maintenanceStatus;

      task.taskStatus = taskStatus;
      if (notes) task.resolutionNotes = notes;
      if (taskStatus === 'Resolved') {
        task.resolvedAt = new Date();
      } else {
        task.resolvedAt = undefined;
      }
      await task.save();

      const inspectionStatusMap = {
        Assigned: 'Assigned',
        'In Progress': 'In Progress',
        Resolved: 'Resolved',
      };
      inspection.maintenanceStatus = inspectionStatusMap[taskStatus];
      await inspection.save();

      await StatusHistory.create({
        inspectionId: inspection._id,
        previousStatus: previousInspectionStatus,
        newStatus: inspection.maintenanceStatus,
        changedBy: req.user._id,
        notes:
          notes ||
          `Task status changed from ${previousTaskStatus} to ${taskStatus}`,
      });

      const populated = await MaintenanceTask.findById(task._id)
        .populate('inspectionId')
        .populate('assignedBy', 'name email role');

      return res.json({
        success: true,
        message: 'Maintenance status updated',
        data: populated,
      });
    } catch (error) {
      console.error('Update maintenance status error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update maintenance status',
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/maintenance
 * Lists tasks for Kanban/Table views.
 * Query: taskStatus, priority, assignedTeam, sync=true (backfill missing tasks)
 */
router.get('/', protect, async (req, res) => {
  try {
    const { taskStatus, priority, assignedTeam, sync } = req.query;

    // Backfill tasks for unresolved inspections that never got a MaintenanceTask
    let syncResult = null;
    if (sync !== 'false') {
      syncResult = await syncTasksForUnresolvedInspections(req.user._id);
    }

    const filter = {};
    if (taskStatus) filter.taskStatus = taskStatus;
    if (priority) filter.priority = priority;
    if (assignedTeam) filter.assignedTeam = assignedTeam;

    const tasks = await MaintenanceTask.find(filter)
      .populate('inspectionId')
      .populate('assignedBy', 'name email role')
      .sort({ createdAt: -1 });

    const columns = {
      Assigned: [],
      'In Progress': [],
      Resolved: [],
    };
    for (const task of tasks) {
      const key = columns[task.taskStatus] ? task.taskStatus : 'Assigned';
      columns[key].push(task);
    }

    return res.json({
      success: true,
      count: tasks.length,
      data: tasks,
      // Kanban-friendly grouping for the Maintenance Task Tracker
      columns: {
        Assigned: columns.Assigned.length,
        'In Progress': columns['In Progress'].length,
        Resolved: columns.Resolved.length,
      },
      grouped: columns,
      sync: syncResult
        ? {
            created: syncResult.created,
            inspected: syncResult.inspected,
          }
        : null,
    });
  } catch (error) {
    console.error('List maintenance tasks error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list maintenance tasks',
      error: error.message,
    });
  }
});

/**
 * POST /api/maintenance/sync
 * Explicitly create tasks for unresolved inspections missing a MaintenanceTask.
 */
router.post(
  '/sync',
  protect,
  authorize('Officer', 'Maintenance'),
  async (req, res) => {
    try {
      const result = await syncTasksForUnresolvedInspections(req.user._id);
      return res.json({
        success: true,
        message: `Synced ${result.created} maintenance task(s)`,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Sync failed',
        error: error.message,
      });
    }
  }
);

/**
 * DELETE /api/maintenance/:id
 * Removes a maintenance task by ID. Does not recreate on next list sync
 * (sync only backfills inspections still in "Detected").
 */
router.delete(
  '/:id',
  protect,
  authorize('Officer', 'Maintenance', 'Inspector'),
  async (req, res) => {
    try {
      const task = await MaintenanceTask.findById(req.params.id);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance task not found',
        });
      }

      const inspectionId = task.inspectionId;
      const previousStatus = task.taskStatus;

      await task.deleteOne();

      // Keep inspection as unresolved but without an open task; record history
      if (inspectionId && req.user?._id) {
        const inspection = await Inspection.findById(inspectionId);
        if (inspection && inspection.maintenanceStatus !== 'Resolved') {
          const prev = inspection.maintenanceStatus;
          // Leave status as-is unless it was only Assigned via this task
          await StatusHistory.create({
            inspectionId,
            previousStatus: prev,
            newStatus: prev,
            changedBy: req.user._id,
            notes: `Maintenance task deleted (was ${previousStatus})`,
          }).catch(() => {});
        }
      }

      return res.json({
        success: true,
        message: 'Maintenance task deleted',
        data: { id: req.params.id, inspectionId },
      });
    } catch (error) {
      console.error('Delete maintenance task error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete maintenance task',
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/maintenance/history/:inspectionId
 */
router.get('/history/:inspectionId', protect, async (req, res) => {
  try {
    const history = await StatusHistory.find({
      inspectionId: req.params.inspectionId,
    })
      .populate('changedBy', 'name email role')
      .sort({ changedAt: -1 });

    return res.json({ success: true, count: history.length, data: history });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch status history',
      error: error.message,
    });
  }
});

module.exports = router;
