const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const Inspection = require('../models/Inspection');
const MaintenanceTask = require('../models/MaintenanceTask');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  ensureMaintenanceTaskForInspection,
} = require('../utils/maintenanceHelpers');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `inspection-${unique}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image uploads are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
});

/**
 * POST /api/inspections/upload
 * multipart/form-data:
 *   image (file), longitude, latitude, ward,
 *   recurrence_count?, unresolved_days?, inspectorNotes?
 */
router.post(
  '/upload',
  protect,
  authorize('Inspector', 'Officer'),
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Image file is required (field name: image)',
        });
      }

      const {
        longitude,
        latitude,
        ward,
        recurrence_count = 0,
        unresolved_days = 0,
        inspectorNotes = '',
      } = req.body;

      const lng = parseFloat(longitude);
      const lat = parseFloat(latitude);

      if (Number.isNaN(lng) || Number.isNaN(lat)) {
        return res.status(400).json({
          success: false,
          message: 'Valid longitude and latitude are required',
        });
      }

      if (!ward) {
        return res.status(400).json({
          success: false,
          message: 'Ward is required',
        });
      }

      const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
      const form = new FormData();
      form.append('image', fs.createReadStream(req.file.path), {
        filename: req.file.filename,
        contentType: req.file.mimetype,
      });
      form.append('recurrence_count', String(parseInt(recurrence_count, 10) || 0));
      form.append('unresolved_days', String(parseFloat(unresolved_days) || 0));

      let detection;
      try {
        const aiResponse = await axios.post(`${aiUrl}/detect`, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 120000,
        });
        detection = aiResponse.data;
      } catch (aiError) {
        console.error('AI service error:', aiError.message);
        // Clean up uploaded file on AI failure
        fs.unlink(req.file.path, () => {});
        return res.status(502).json({
          success: false,
          message: 'AI detection service unavailable or failed',
          error: aiError.response?.data || aiError.message,
        });
      }

      const imageUrl = `/uploads/${req.file.filename}`;

      const inspection = await Inspection.create({
        inspectorId: req.user._id,
        imageUrl,
        issueType: detection.primary_issue || 'garbage',
        detectionConfidence: detection.confidence ?? 0,
        boundingBoxes: detection.detections || [],
        location: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        severityScore: detection.severity_score ?? 0,
        severityLevel: detection.severity_level || 'Low',
        explainableFactors: detection.explainable_factors || {},
        inspectorNotes,
        verificationStatus: 'Pending',
        maintenanceStatus: 'Detected',
        ward: String(ward).trim(),
        recurrenceCount: parseInt(recurrence_count, 10) || 0,
        unresolvedDays: parseFloat(unresolved_days) || 0,
      });

      // Auto-create a MaintenanceTask so the tracker shows the unresolved issue
      let maintenanceTask = null;
      try {
        const { task } = await ensureMaintenanceTaskForInspection(inspection, {
          assignedBy: req.user._id,
          notes: `Auto-assigned on upload to default crew for ${inspection.issueType}`,
        });
        maintenanceTask = await MaintenanceTask.findById(task._id)
          .populate('inspectionId')
          .populate('assignedBy', 'name email role');
      } catch (taskErr) {
        console.error('Auto maintenance task creation failed:', taskErr.message);
      }

      const populated = await Inspection.findById(inspection._id).populate(
        'inspectorId',
        'name email role department'
      );

      return res.status(201).json({
        success: true,
        message: 'Inspection created successfully',
        data: populated,
        maintenanceTask,
        detectionMeta: {
          note: detection.note || null,
          image_size: detection.image_size || null,
          detection_count: detection.detection_count ?? (detection.detections || []).length,
        },
      });
    } catch (error) {
      console.error('Upload inspection error:', error);
      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to create inspection',
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/inspections
 * Query filters: category (issueType), severity, status (maintenanceStatus), ward, verificationStatus
 */
router.get('/', protect, async (req, res) => {
  try {
    const {
      category,
      severity,
      status,
      ward,
      verificationStatus,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};
    if (category) filter.issueType = category;
    if (severity) filter.severityLevel = severity;
    if (status) filter.maintenanceStatus = status;
    if (ward) filter.ward = ward;
    if (verificationStatus) filter.verificationStatus = verificationStatus;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Inspection.find(filter)
        .populate('inspectorId', 'name email role department')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Inspection.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      count: items.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: items,
    });
  } catch (error) {
    console.error('List inspections error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch inspections',
      error: error.message,
    });
  }
});

/**
 * GET /api/inspections/hotspots
 * Spatio-temporal aggregation of recent issues by ward / geo cell.
 */
router.get('/hotspots', protect, async (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.query.days, 10) || 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cellSize = parseFloat(req.query.cellSize) || 0.01; // ~1km at equator

    const severityWeight = {
      Low: 1,
      Medium: 2,
      High: 3.5,
      Critical: 5,
    };

    const recent = await Inspection.find({
      createdAt: { $gte: since },
      maintenanceStatus: { $ne: 'Resolved' },
    }).select('ward location severityScore severityLevel issueType createdAt');

    // Aggregate by ward
    const wardMap = {};
    // Aggregate by geo cell
    const cellMap = {};

    for (const doc of recent) {
      const [lng, lat] = doc.location?.coordinates || [0, 0];
      const sevW = severityWeight[doc.severityLevel] || 1;
      const scoreContribution = sevW + (doc.severityScore || 0) / 10;

      // Ward
      if (!wardMap[doc.ward]) {
        wardMap[doc.ward] = {
          ward: doc.ward,
          issueCount: 0,
          hotspotScore: 0,
          avgSeverity: 0,
          severitySum: 0,
          categories: {},
        };
      }
      const w = wardMap[doc.ward];
      w.issueCount += 1;
      w.hotspotScore += scoreContribution;
      w.severitySum += doc.severityScore || 0;
      w.categories[doc.issueType] = (w.categories[doc.issueType] || 0) + 1;

      // Geo cell
      const cellLng = Math.floor(lng / cellSize) * cellSize;
      const cellLat = Math.floor(lat / cellSize) * cellSize;
      const cellKey = `${cellLng.toFixed(4)},${cellLat.toFixed(4)}`;
      if (!cellMap[cellKey]) {
        cellMap[cellKey] = {
          cellKey,
          cellCenter: {
            type: 'Point',
            coordinates: [cellLng + cellSize / 2, cellLat + cellSize / 2],
          },
          bounds: {
            sw: [cellLng, cellLat],
            ne: [cellLng + cellSize, cellLat + cellSize],
          },
          issueCount: 0,
          hotspotScore: 0,
          severitySum: 0,
          categories: {},
          wards: new Set(),
        };
      }
      const c = cellMap[cellKey];
      c.issueCount += 1;
      c.hotspotScore += scoreContribution;
      c.severitySum += doc.severityScore || 0;
      c.categories[doc.issueType] = (c.categories[doc.issueType] || 0) + 1;
      c.wards.add(doc.ward);
    }

    const wardHotspots = Object.values(wardMap)
      .map((w) => ({
        ...w,
        avgSeverity: w.issueCount ? +(w.severitySum / w.issueCount).toFixed(2) : 0,
        hotspotScore: +w.hotspotScore.toFixed(2),
        severitySum: undefined,
      }))
      .sort((a, b) => b.hotspotScore - a.hotspotScore);

    const cellHotspots = Object.values(cellMap)
      .map((c) => ({
        cellKey: c.cellKey,
        cellCenter: c.cellCenter,
        bounds: c.bounds,
        issueCount: c.issueCount,
        hotspotScore: +c.hotspotScore.toFixed(2),
        avgSeverity: c.issueCount ? +(c.severitySum / c.issueCount).toFixed(2) : 0,
        categories: c.categories,
        wards: [...c.wards],
      }))
      .sort((a, b) => b.hotspotScore - a.hotspotScore);

    return res.json({
      success: true,
      windowDays: days,
      cellSize,
      totalUnresolvedInWindow: recent.length,
      wardHotspots,
      cellHotspots,
    });
  } catch (error) {
    console.error('Hotspots error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to compute hotspots',
      error: error.message,
    });
  }
});

/**
 * GET /api/inspections/:id
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id).populate(
      'inspectorId',
      'name email role department'
    );
    if (!inspection) {
      return res.status(404).json({ success: false, message: 'Inspection not found' });
    }
    return res.json({ success: true, data: inspection });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch inspection',
      error: error.message,
    });
  }
});

/**
 * PATCH /api/inspections/:id/verify
 * Body: { verificationStatus: 'Verified' | 'Rejected', notes? }
 */
router.patch(
  '/:id/verify',
  protect,
  authorize('Officer'),
  async (req, res) => {
    try {
      const { verificationStatus, notes } = req.body;
      if (!['Verified', 'Rejected'].includes(verificationStatus)) {
        return res.status(400).json({
          success: false,
          message: "verificationStatus must be 'Verified' or 'Rejected'",
        });
      }

      const inspection = await Inspection.findById(req.params.id);
      if (!inspection) {
        return res.status(404).json({ success: false, message: 'Inspection not found' });
      }

      inspection.verificationStatus = verificationStatus;
      if (notes) {
        inspection.inspectorNotes = `${inspection.inspectorNotes || ''}\n[Officer] ${notes}`.trim();
      }
      await inspection.save();

      return res.json({ success: true, data: inspection });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Verification update failed',
        error: error.message,
      });
    }
  }
);

module.exports = router;
