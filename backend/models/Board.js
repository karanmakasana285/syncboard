const mongoose = require('mongoose');

const boardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // users invited but not yet accepted - kept separate from collaborators
    // so getAuthorizedBoard (and everything that depends on it: board reads,
    // socket room auth) does NOT grant access until the invite is accepted.
    pendingInvites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Board', boardSchema);