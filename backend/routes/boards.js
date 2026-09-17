const express = require('express');
const Board = require('../models/Board');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');
const { getAuthorizedBoard } = require('../utils/authorize');
const { redisClient } = require('../config/redis');

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
      .populate('collaborators', 'name email');

    await redisClient.set(cacheKey, JSON.stringify(board), { EX: 60 });

    res.json(board);
  } catch (err) {
    console.error('Get board error:', err.message);
    res.status(500).json({ error: 'Something went wrong fetching the board' });
  }
});

// POST /api/boards/:id/invite - add a collaborator by email.
// Only the board owner or an existing collaborator can invite (same
// authorization boundary as everything else on this board).
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

    board.collaborators.push(userToInvite._id);
    await board.save();

    await redisClient.del(`board:${req.params.id}`); // invalidate - collaborator list changed

    const updatedBoard = await Board.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('collaborators', 'name email');

    res.json(updatedBoard);
  } catch (err) {
    console.error('Invite collaborator error:', err.message);
    res.status(500).json({ error: 'Something went wrong sending the invite' });
  }
});

module.exports = router;