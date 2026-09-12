const express = require('express');
const Column = require('../models/Column');
const Card = require('../models/Card');
const requireAuth = require('../middleware/auth');
const { getAuthorizedBoard } = require('../utils/authorize');
const { getIO } = require('../socket');
const { redisClient } = require('../config/redis');

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const { name, boardId, order } = req.body;
    if (!name || !boardId || order === undefined) {
      return res.status(400).json({ error: 'name, boardId, and order are required' });
    }

    const board = await getAuthorizedBoard(boardId, req.userId);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const column = await Column.create({ name, board: boardId, order });

    getIO().to(boardId).emit('column:created', column);
    await redisClient.del(`board:${boardId}`);

    res.status(201).json(column);
  } catch (err) {
    console.error('Create column error:', err.message);
    res.status(500).json({ error: 'Something went wrong creating the column' });
  }
});

router.get('/board/:boardId', async (req, res) => {
  try {
    const board = await getAuthorizedBoard(req.params.boardId, req.userId);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const columns = await Column.find({ board: req.params.boardId }).sort('order');
    res.json(columns);
  } catch (err) {
    console.error('List columns error:', err.message);
    res.status(500).json({ error: 'Something went wrong fetching columns' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const column = await Column.findById(req.params.id);
    if (!column) return res.status(404).json({ error: 'Column not found' });

    const board = await getAuthorizedBoard(column.board, req.userId);
    if (!board) return res.status(404).json({ error: 'Column not found' });

    const { name, order } = req.body;
    if (name !== undefined) column.name = name;
    if (order !== undefined) column.order = order;
    await column.save();

    getIO().to(column.board.toString()).emit('column:updated', column);
    await redisClient.del(`board:${column.board}`);

    res.json(column);
  } catch (err) {
    console.error('Update column error:', err.message);
    res.status(500).json({ error: 'Something went wrong updating the column' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const column = await Column.findById(req.params.id);
    if (!column) return res.status(404).json({ error: 'Column not found' });

    const board = await getAuthorizedBoard(column.board, req.userId);
    if (!board) return res.status(404).json({ error: 'Column not found' });

    await Card.deleteMany({ column: column._id }); // cascade delete - prevent orphaned cards
    await column.deleteOne();

    getIO().to(column.board.toString()).emit('column:deleted', { columnId: column._id });
    await redisClient.del(`board:${column.board}`);

    res.json({ message: 'Column deleted' });
  } catch (err) {
    console.error('Delete column error:', err.message);
    res.status(500).json({ error: 'Something went wrong deleting the column' });
  }
});

module.exports = router;
