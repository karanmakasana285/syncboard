const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { getAuthorizedBoard } = require('../utils/authorize');

let io; // module-level singleton so other files (route handlers) can access it later

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' }, // fine for local dev; tighten to your real frontend URL before deploying
  });

  // runs once per new socket connection, BEFORE 'connection' fires - this is
  // where we verify the JWT, since sockets don't have per-request headers
  // the way REST calls do. Client sends the token once at connect time.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId; // attach for use in event handlers below
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (user ${socket.userId})`);

    // client asks to join a specific board's room. We re-check authorization
    // HERE too (locked decision #5) - a valid JWT alone isn't enough, the user
    // must actually be the board's owner or a collaborator.
    socket.on('board:join', async (boardId) => {
      try {
        const board = await getAuthorizedBoard(boardId, socket.userId);
        if (!board) {
          socket.emit('board:error', { error: 'Not authorized for this board' });
          return;
        }
        socket.join(boardId);
        console.log(`User ${socket.userId} joined board room ${boardId}`);
      } catch (err) {
        socket.emit('board:error', { error: 'Failed to join board' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized yet');
  return io;
}

module.exports = { initSocket, getIO };
