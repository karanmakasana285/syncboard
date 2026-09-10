const mongoose = require('mongoose');

const columnSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
    order: { type: Number, required: true }, // determines left-to-right column position
  },
  { timestamps: true }
);

module.exports = mongoose.model('Column', columnSchema);
