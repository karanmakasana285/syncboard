const express = require('express');
const Board = require('../models/Board');
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
router.get('/:id', async (req, res) => {
  try {
    const cacheKey = `board:${req.params.id}`;

    // check the "whiteboard" (Redis) first - if we already wrote this board's
    // data there recently, hand it back immediately without touching MongoDB at all
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached)); // Redis stores everything as plain text, so we parse it back into an object
    }

    // cache miss - fall back to the real database, same authorization check as before
    const board = await getAuthorizedBoard(req.params.id, req.userId);
    if (!board) return res.status(404).json({ error: 'Board not found' });


    // write it to Redis for next time, with a 60 second expiry ("TTL" - time to
    // live) so stale data can't live forever even if we ever miss an invalidation
    await redisClient.set(cacheKey, JSON.stringify(board), { EX: 60 });

    res.json(board);
  } catch (err) {
    console.error('Get board error:', err.message);
    res.status(500).json({ error: 'Something went wrong fetching the board' });
  }
});

module.exports = router;
