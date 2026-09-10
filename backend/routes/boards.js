const express = require('express');
const Board = require('../models/Board');
const requireAuth = require('../middleware/auth');
const { getAuthorizedBoard } = require('../utils/authorize');

const router = express.Router();

router.use(requireAuth); // every route below requires a valid JWT

// POST /api/boards - create a board (creator becomes owner)
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

// GET /api/boards - list boards where the user is owner or collaborator
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

// GET /api/boards/:id - get one board, only if authorized
router.get('/:id', async (req, res) => {
  try {
    const board = await getAuthorizedBoard(req.params.id, req.userId);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    console.error('Get board error:', err.message);
    res.status(500).json({ error: 'Something went wrong fetching the board' });
  }
});

module.exports = router;
