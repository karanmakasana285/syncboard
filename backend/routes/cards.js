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
      activityLog: [{ type: 'created', message: 'created this card', by: req.userId }],
    });

    await card.populate('assignees', 'name email');
    await card.populate('activityLog.by', 'name');

    getIO().to(column.board.toString()).emit('card:created', card);
    await redisClient.del(`board:${column.board}`);

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

    const cards = await Card.find({ column: req.params.columnId })
      .sort('order')
      .populate('assignees', 'name email')
      .populate('activityLog.by', 'name');
    res.json(cards);
  } catch (err) {
    console.error('List cards error:', err.message);
    res.status(500).json({ error: 'Something went wrong fetching cards' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    // preliminary read - used ONLY for authorization (does this user have
    // access to this card's board / the target column if moving). This read
    // is not used to decide field values or version comparisons, so it does
    // not reintroduce the race condition described below.
    const preliminaryCard = await Card.findById(req.params.id);
    if (!preliminaryCard) return res.status(404).json({ error: 'Card not found' });

    const originalColumn = await authorizeViaColumn(preliminaryCard.column, req.userId);
    if (!originalColumn) return res.status(404).json({ error: 'Card not found' });

    const { expectedVersion, title, description, order, labels, dueDate, assignees } = req.body;

    const setFields = {};
    if (title !== undefined) setFields.title = title;
    if (description !== undefined) setFields.description = description;
    if (order !== undefined) setFields.order = order;
    if (labels !== undefined) setFields.labels = labels;
    if (dueDate !== undefined) setFields.dueDate = dueDate;
    if (assignees !== undefined) setFields.assignees = assignees;

    let movingToColumnId = null;
    if (req.body.columnId && req.body.columnId !== preliminaryCard.column.toString()) {
      const targetColumn = await authorizeViaColumn(req.body.columnId, req.userId);
      if (!targetColumn) return res.status(404).json({ error: 'Target column not found' });
      movingToColumnId = req.body.columnId;
      setFields.column = req.body.columnId;
    }

    // ATOMIC UPDATE: findOneAndUpdate + $inc runs as a single indivisible
    // operation in MongoDB. Concurrent requests hitting the same document are
    // serialized internally by the database itself - whichever request's
    // update actually executes second will see the FIRST request's already-
    // applied changes reflected in `previousState` below (since this returns
    // the document as it existed immediately before THIS update was applied,
    // not a snapshot read earlier in the request). This is what closes the
    // gap that existed in the old read-then-save pattern: two genuinely
    // simultaneous requests could previously both read the same stale
    // version before either wrote, causing an undetected lost update.
    const previousState = await Card.findOneAndUpdate(
      { _id: req.params.id },
      { $set: setFields, $inc: { version: 1 } },
      { returnDocument: 'before' } // return the document as it was BEFORE this update
    );

    if (!previousState) return res.status(404).json({ error: 'Card not found' });

    const isConflict = expectedVersion !== undefined && expectedVersion !== previousState.version;

    const changeDescriptions = [];
    if (title !== undefined && title !== previousState.title) changeDescriptions.push('changed the title');
    if (description !== undefined && description !== previousState.description) changeDescriptions.push('updated the description');
    if (labels !== undefined) changeDescriptions.push('updated labels');
    if (dueDate !== undefined) changeDescriptions.push(dueDate ? 'set a due date' : 'removed the due date');
    if (assignees !== undefined) changeDescriptions.push('updated assignees');
    if (movingToColumnId) changeDescriptions.push('moved this card');

    // conflictHistory/activityLog entries are appended in a small follow-up
    // update - this doesn't need to be part of the same atomic operation,
    // since by this point we already have a correct, race-free `previousState`
    // to base these log entries on.
    const logUpdates = {};
    if (isConflict) {
      logUpdates.$push = {
        conflictHistory: {
          overwrittenBy: req.userId,
          previousTitle: previousState.title,
          previousDescription: previousState.description,
        },
      };
    }
    if (changeDescriptions.length > 0) {
      const activityEntry = {
        type: isConflict ? 'conflict' : 'updated',
        message: isConflict
          ? `overwrote a concurrent edit while ${changeDescriptions.join(', ')}`
          : changeDescriptions.join(', '),
        by: req.userId,
      };
      logUpdates.$push = { ...(logUpdates.$push || {}), activityLog: activityEntry };
    }

    let card;
    if (Object.keys(logUpdates).length > 0) {
      card = await Card.findByIdAndUpdate(req.params.id, logUpdates, { returnDocument: 'after' });
    } else {
      card = await Card.findById(req.params.id);
    }
    await card.populate('assignees', 'name email');
    await card.populate('activityLog.by', 'name');

    const broadcastBoardId = movingToColumnId ? originalColumn.board.toString() : originalColumn.board.toString();
    getIO().to(broadcastBoardId).emit('card:updated', card);
    await redisClient.del(`board:${originalColumn.board}`);
    if (movingToColumnId) {
      // card may now belong to a column on a different board in theory, but
      // since columns/boards aren't cross-linked in this app's data model,
      // both source and destination columns always share the same board -
      // invalidating once above is sufficient.
    }

    if (isConflict) {
      getIO().to(broadcastBoardId).emit('card:conflict', {
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
