const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    column: { type: mongoose.Schema.Types.ObjectId, ref: 'Column', required: true },
    order: { type: Number, required: true }, // determines position within its column
    labels: [{ type: String }],
    dueDate: { type: Date },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    version: { type: Number, default: 0 }, // incremented on every update - drives last-write-wins conflict resolution (locked decision)
    conflictHistory: [
      {
        overwrittenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        overwrittenAt: { type: Date, default: Date.now },
        previousTitle: String,
        previousDescription: String,
      },
    ], // populated only when a version mismatch is detected during save - not a full edit log
  },
  { timestamps: true }
);

module.exports = mongoose.model('Card', cardSchema);
