const express = require('express');
const Inspection = require('../models/Inspection');
const MaintenanceTask = require('../models/MaintenanceTask');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * GET /api/analytics/dashboard
 * Card metrics + category breakdown shaped for Recharts.
 */
router.get('/dashboard', protect, async (req, res) => {
  try {
    const [
      total,
      unresolved,
      critical,
      resolved,
      categoryAgg,
      severityAgg,
      statusAgg,
      recentTrend,
      openTasks,
    ] = await Promise.all([
      Inspection.countDocuments(),
      Inspection.countDocuments({ maintenanceStatus: { $ne: 'Resolved' } }),
      Inspection.countDocuments({
        severityLevel: 'Critical',
        maintenanceStatus: { $ne: 'Resolved' },
      }),
      Inspection.countDocuments({ maintenanceStatus: 'Resolved' }),
      Inspection.aggregate([
        { $group: { _id: '$issueType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Inspection.aggregate([
        { $group: { _id: '$severityLevel', count: { $sum: 1 } } },
      ]),
      Inspection.aggregate([
        { $group: { _id: '$maintenanceStatus', count: { $sum: 1 } } },
      ]),
      // Last 14 days trend for line charts
      Inspection.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count: { $sum: 1 },
            avgSeverity: { $avg: '$severityScore' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      MaintenanceTask.countDocuments({ taskStatus: { $ne: 'Resolved' } }),
    ]);

    const categoryBreakdown = categoryAgg.map((c) => ({
      category: c._id,
      count: c.count,
    }));

    const severityBreakdown = ['Low', 'Medium', 'High', 'Critical'].map((level) => ({
      severity: level,
      count: severityAgg.find((s) => s._id === level)?.count || 0,
    }));

    const statusBreakdown = ['Detected', 'Assigned', 'In Progress', 'Resolved'].map(
      (status) => ({
        status,
        count: statusAgg.find((s) => s._id === status)?.count || 0,
      })
    );

    const trendSeries = recentTrend.map((t) => ({
      date: t._id,
      count: t.count,
      avgSeverity: +(t.avgSeverity || 0).toFixed(2),
    }));

    return res.json({
      success: true,
      cards: {
        total,
        unresolved,
        critical,
        resolved,
        openTasks,
      },
      // Recharts-friendly arrays
      categoryBreakdown,
      severityBreakdown,
      statusBreakdown,
      trendSeries,
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load dashboard analytics',
      error: error.message,
    });
  }
});

module.exports = router;
