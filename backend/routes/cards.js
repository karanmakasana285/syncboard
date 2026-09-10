const express = require('express');
const Card = require('../models/Card');
const Column = require('../models/Column');
const requireAuth = require('../middleware/auth');
const { getAuthorizedBoard } = require('../utils/authorize');

const router = express.Router();

router.use(requireAuth);

// helper: given a column id, find its board and authorize the user
async function authorizeViaColumn(columnId, userId) {
  const column = await Column.findById(columnId);
  if (!column) return null;
  const board = await getAuthorizedBoard(column.board, userId);
  if (!board) return null;
  return column;
}

// POST /api/cards - create a card in a column
router.post('/', async (req, res) => {
  try {
    const { title, description, columnId, order, labels, dueDate, assignees } = req.body;
    if (!title || !columnId || order === undefined) {
      return res.status(400).json({ error: 'title, columnId, and order are required' });
    }

    const column = await authorizeViaColumn(columnId, req.userId);
    if (!column) return res.status(404).json({ error: 'Column not found' });

    const card = await Card.create({
      title,
      description,
      column: columnId,
      order,
      labels,
      dueDate,
      assignees,
    });
    res.status(201).json(card);
  } catch (err) {
    console.error('Create card error:', err.message);
    res.status(500).json({ error: 'Something went wrong creating the card' });
  }
});

// GET /api/cards/column/:columnId - list cards in a column
router.get('/column/:columnId', async (req, res) => {
  try {
    const column = await authorizeViaColumn(req.params.columnId, req.userId);
    if (!column) return res.status(404).json({ error: 'Column not found' });

    const cards = await Card.find({ column: req.params.columnId }).sort('order');
    res.json(cards);
  } catch (err) {
    console.error('List cards error:', err.message);
    res.status(500).json({ error: 'Something went wrong fetching cards' });
  }
});

// PATCH /api/cards/:id - update a card (title, description, column/order for moves, labels, dueDate, assignees)
router.patch('/:id', async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const column = await authorizeViaColumn(card.column, req.userId);
    if (!column) return res.status(404).json({ error: 'Card not found' });

    // if moving to a different column, verify the target column is on an authorized board too
    if (req.body.columnId && req.body.columnId !== card.column.toString()) {
      const targetColumn = await authorizeViaColumn(req.body.columnId, req.userId);
      if (!targetColumn) return res.status(404).json({ error: 'Target column not found' });
      card.column = req.body.columnId;
    }

    const { title, description, order, labels, dueDate, assignees } = req.body;
    if (title !== undefined) card.title = title;
    if (description !== undefined) card.description = description;
    if (order !== undefined) card.order = order;
    if (labels !== undefined) card.labels = labels;
    if (dueDate !== undefined) card.dueDate = dueDate;
    if (assignees !== undefined) card.assignees = assignees;

    card.version += 1; // every successful update bumps version - this is what Step 6's conflict resolution will key off of
    await card.save();

    res.json(card);
  } catch (err) {
    console.error('Update card error:', err.message);
    res.status(500).json({ error: 'Something went wrong updating the card' });
  }
});

// DELETE /api/cards/:id
router.delete('/:id', async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const column = await authorizeViaColumn(card.column, req.userId);
    if (!column) return res.status(404).json({ error: 'Card not found' });

    await card.deleteOne();
    res.json({ message: 'Card deleted' });
  } catch (err) {
    console.error('Delete card error:', err.message);
    res.status(500).json({ error: 'Something went wrong deleting the card' });
  }
});

module.exports = router;
