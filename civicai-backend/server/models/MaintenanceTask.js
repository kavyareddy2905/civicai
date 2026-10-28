const mongoose = require('mongoose');

const maintenanceTaskSchema = new mongoose.Schema(
  {
    inspectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inspection',
      required: true,
      index: true,
    },
    assignedTeam: {
      type: String,
      required: [true, 'Assigned team is required'],
      trim: true,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    taskStatus: {
      type: String,
      enum: ['Assigned', 'In Progress', 'Resolved'],
      default: 'Assigned',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
    },
    resolvedAt: {
      type: Date,
    },
    resolutionNotes: {
      type: String,
      default: '',
      trim: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MaintenanceTask', maintenanceTaskSchema);
