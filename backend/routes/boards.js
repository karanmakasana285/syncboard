const express = require('express');
const Board = require('../models/Board');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');
const { getAuthorizedBoard } = require('../utils/authorize');
const { redisClient } = require('../config/redis');
const { getIO } = require('../socket');

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const board = await Board.create({ name, owner: req.userId, collaborators: [] });
    res.status(201).json(board);
  } catch (err) {
    console.error('Create board error:', err.message);
    res.status(500).json({ error: 'Something went wrong creating the board' });
  }
});

router.get('/', async (req, res) => {
  try {
    const boards = await Board.find({
      $or: [{ owner: req.userId }, { collaborators: req.userId }],
    });
    res.json(boards);
  } catch (err) {
    console.error('List boards error:', err.message);
    res.status(500).json({ error: 'Something went wrong fetching boards' });
  }
});

// GET /api/boards/invites - boards where the CURRENT user has a pending
// invite waiting on them. Populates owner (name+email) so the boards list
// page can show "X invited you to <board name>". This is a literal route
// and must be declared before GET /:id, otherwise Express would match
// "invites" as the :id param instead.
router.get('/invites', async (req, res) => {
  try {
    const boards = await Board.find({ pendingInvites: req.userId }).populate(
      'owner',
      'name email'
    );
    res.json(boards);
  } catch (err) {
    console.error('List pending invites error:', err.message);
    res.status(500).json({ error: 'Something went wrong fetching your invites' });
  }
});

// GET /api/boards/:id - get one board, only if authorized.
// checks Redis first (fast path) before falling back to MongoDB.
// NOTE: owner/collaborators are populated with name+email so the frontend
// can actually display who's on the board, not just raw ObjectIds.
router.get('/:id', async (req, res) => {
  try {
    // Authorization is checked FIRST, before the cache lookup, on every
    // request - regardless of whether this ends up being a cache hit or a
    // cache miss. Checking it only on the miss path (after the cache lookup)
    // would mean a cache hit skips authorization entirely, letting any
    // logged-in user read a cached board they have no access to just by
    // knowing/guessing its id. getAuthorizedBoard uses raw ids (fast, no
    // populate needed here) - once authorized, we separately fetch WITH
    // populate for the actual response, since the frontend needs real names.
    const authorized = await getAuthorizedBoard(req.params.id, req.userId);
    if (!authorized) return res.status(404).json({ error: 'Board not found' });

    const cacheKey = `board:${req.params.id}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const board = await Board.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('collaborators', 'name email')
      .populate('pendingInvites', 'name email');

    await redisClient.set(cacheKey, JSON.stringify(board), { EX: 60 });

    res.json(board);
  } catch (err) {
    console.error('Get board error:', err.message);
    res.status(500).json({ error: 'Something went wrong fetching the board' });
  }
});

// POST /api/boards/:id/invite - invite a collaborator by email.
// Only the board owner or an existing collaborator can invite (same
// authorization boundary as everything else on this board).
//
// This does NOT add them to the board immediately. It adds them to
// pendingInvites; they only become a real collaborator (and gain board
// access) once they explicitly accept via /invites/accept. Membership is
// persistent, not a one-time share, so an unreviewed instant-add isn't the
// right default - this matches how GitHub/Slack handle workspace invites.
router.post('/:id/invite', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const board = await getAuthorizedBoard(req.params.id, req.userId);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const userToInvite = await User.findOne({ email });
    if (!userToInvite) {
      return res.status(404).json({ error: 'No user found with that email - they need to sign up first' });
    }

    const alreadyOnBoard =
      board.owner.toString() === userToInvite._id.toString() ||
      board.collaborators.some((c) => c.toString() === userToInvite._id.toString());

    if (alreadyOnBoard) {
      return res.status(409).json({ error: 'That person is already on this board' });
    }

    const alreadyInvited = board.pendingInvites.some(
      (c) => c.toString() === userToInvite._id.toString()
    );
    if (alreadyInvited) {
      return res.status(409).json({ error: 'That person already has a pending invite' });
    }

    board.pendingInvites.push(userToInvite._id);
    await board.save();

    // membership-adjacent list changed (pendingInvites), so the cached read
    // is stale the same way it would be for a collaborators change.
    await redisClient.del(`board:${req.params.id}`);

    const updatedBoard = await Board.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('collaborators', 'name email')
      .populate('pendingInvites', 'name email');

    // Push this live to the invited user specifically, in case they're
    // sitting on the boards page right now - without this, they'd only see
    // the new invite the next time that page happens to load/refetch.
    // Sent to their personal room (user:<id>), not a board room, since
    // they're not authorized on this board's room yet.
    getIO().to(`user:${userToInvite._id}`).emit('invite:received', updatedBoard);

    res.json(updatedBoard);
  } catch (err) {
    console.error('Invite collaborator error:', err.message);
    res.status(500).json({ error: 'Something went wrong sending the invite' });
  }
});

// POST /api/boards/:id/invites/accept - the CURRENT user accepts a pending
// invite on this board. Moves them from pendingInvites to collaborators.
// Deliberately does NOT reuse getAuthorizedBoard, since that function's
// whole point is to return null for exactly this case (pending, not yet a
// member) - we need the opposite check here.
router.post('/:id/invites/accept', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const isPending = board.pendingInvites.some((c) => c.toString() === req.userId);
    if (!isPending) {
      return res.status(403).json({ error: 'You do not have a pending invite to this board' });
    }

    board.pendingInvites = board.pendingInvites.filter((c) => c.toString() !== req.userId);
    board.collaborators.push(req.userId);
    await board.save();

    // collaborators changed - this board's cached read is now stale for
    // everyone who already had access.
    await redisClient.del(`board:${req.params.id}`);

    const updatedBoard = await Board.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('collaborators', 'name email')
      .populate('pendingInvites', 'name email');

    res.json(updatedBoard);
  } catch (err) {
    console.error('Accept invite error:', err.message);
    res.status(500).json({ error: 'Something went wrong accepting the invite' });
  }
});

// POST /api/boards/:id/invites/decline - the CURRENT user declines a
// pending invite. Just removes them from pendingInvites; nothing else on
// the board changes, and no cache invalidation is needed since the
// declining user never had access and so was never part of any cached
// board payload anyone with actual access would see differently.
router.post('/:id/invites/decline', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const isPending = board.pendingInvites.some((c) => c.toString() === req.userId);
    if (!isPending) {
      return res.status(403).json({ error: 'You do not have a pending invite to this board' });
    }

    board.pendingInvites = board.pendingInvites.filter((c) => c.toString() !== req.userId);
    await board.save();

    res.json({ ok: true });
  } catch (err) {
    console.error('Decline invite error:', err.message);
    res.status(500).json({ error: 'Something went wrong declining the invite' });
  }
});

module.exports = router;