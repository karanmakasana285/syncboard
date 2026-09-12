const express = require('express');
const Card = require('../models/Card');
const Column = require('../models/Column');
const requireAuth = require('../middleware/auth');
const { getAuthorizedBoard } = require('../utils/authorize');
const { getIO } = require('../socket');
const { redisClient } = require('../config/redis');

const router = express.Router();

router.use(requireAuth);

async function authorizeViaColumn(columnId, userId) {
  const column = await Column.findById(columnId);
  if (!column) return null;
  const board = await getAuthorizedBoard(column.board, userId);
  if (!board) return null;
  return column;
}

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

    getIO().to(column.board.toString()).emit('card:created', card);
    await redisClient.del(`board:${column.board}`); // invalidate - board's cached data may now be stale

    res.status(201).json(card);
  } catch (err) {
    console.error('Create card error:', err.message);
    res.status(500).json({ error: 'Something went wrong creating the card' });
  }
});

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

router.patch('/:id', async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const originalColumn = await authorizeViaColumn(card.column, req.userId);
    if (!originalColumn) return res.status(404).json({ error: 'Card not found' });

    // CONFLICT DETECTION: compare the version the client THINKS it's editing
    // against the card's actual current version. If they differ, someone else
    // saved a change after this client last loaded the card.
    // expectedVersion is optional (drag/reorder updates don't send it) -
    // only title/description edits from the modal include it, since that's
    // the only flow where a stale-snapshot conflict can actually happen.
    const { expectedVersion } = req.body;
    const isConflict = expectedVersion !== undefined && expectedVersion !== card.version;

    if (isConflict) {
      // record what's about to be overwritten, before we apply the new values
      card.conflictHistory.push({
        overwrittenBy: req.userId,
        previousTitle: card.title,
        previousDescription: card.description,
      });
    }

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

    card.version += 1;
    await card.save();

    getIO().to(originalColumn.board.toString()).emit('card:updated', card);
    await redisClient.del(`board:${originalColumn.board}`);

    // separate, targeted event just for the conflict itself - frontend clients
    // filter this to only show a toast if THEY currently have this exact card
    // open for editing (Option A from the Step 6 design discussion)
    if (isConflict) {
      getIO().to(originalColumn.board.toString()).emit('card:conflict', {
        cardId: card._id,
        newTitle: card.title,
        overwrittenBy: req.userId,
      });
    }

    res.json(card);
  } catch (err) {
    console.error('Update card error:', err.message);
    res.status(500).json({ error: 'Something went wrong updating the card' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const column = await authorizeViaColumn(card.column, req.userId);
    if (!column) return res.status(404).json({ error: 'Card not found' });

    await card.deleteOne();

    getIO().to(column.board.toString()).emit('card:deleted', { cardId: card._id, columnId: card.column });
    await redisClient.del(`board:${column.board}`);

    res.json({ message: 'Card deleted' });
  } catch (err) {
    console.error('Delete card error:', err.message);
    res.status(500).json({ error: 'Something went wrong deleting the card' });
  }
});

module.exports = router;
