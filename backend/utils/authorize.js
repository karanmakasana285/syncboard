const Board = require('../models/Board');

// Returns the board if the user is owner or collaborator, otherwise null.
async function getAuthorizedBoard(boardId, userId) {
  const board = await Board.findById(boardId);
  if (!board) return null;

  const isOwner = board.owner.toString() === userId;
  const isCollaborator = board.collaborators.some((c) => c.toString() === userId);

  if (!isOwner && !isCollaborator) return null;
  return board;
}

module.exports = { getAuthorizedBoard };
