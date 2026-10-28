const mongoose = require('mongoose');

const boundingBoxSchema = new mongoose.Schema(
  {
    x1: Number,
    y1: Number,
    x2: Number,
    y2: Number,
    class: String,
    civic_class: String,
    confidence: Number,
  },
  { _id: false }
);

const inspectionSchema = new mongoose.Schema(
  {
    inspectorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    issueType: {
      type: String,
      enum: [
        'pothole',
        'garbage',
        'water_leakage',
        'drainage_blockage',
        'broken_streetlight',
      ],
      required: true,
    },
    detectionConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    boundingBoxes: {
      type: [boundingBoxSchema],
      default: [],
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        // GeoJSON: [longitude, latitude]
        type: [Number],
        required: true,
        validate: {
          validator(v) {
            return (
              Array.isArray(v) &&
              v.length === 2 &&
              v[0] >= -180 &&
              v[0] <= 180 &&
              v[1] >= -90 &&
              v[1] <= 90
            );
          },
          message: 'coordinates must be [longitude, latitude]',
        },
      },
    },
    severityScore: {
      type: Number,
      min: 0,
      max: 10,
      default: 0,
    },
    severityLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Low',
    },
    explainableFactors: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    inspectorNotes: {
      type: String,
      default: '',
      trim: true,
    },
    verificationStatus: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected'],
      default: 'Pending',
    },
    maintenanceStatus: {
      type: String,
      enum: ['Detected', 'Assigned', 'In Progress', 'Resolved'],
      default: 'Detected',
    },
    ward: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    recurrenceCount: {
      type: Number,
      default: 0,
    },
    unresolvedDays: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

inspectionSchema.index({ location: '2dsphere' });
inspectionSchema.index({ issueType: 1, severityLevel: 1, maintenanceStatus: 1 });
inspectionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Inspection', inspectionSchema);
