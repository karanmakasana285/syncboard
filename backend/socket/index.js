const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { createAdapter } = require('@socket.io/redis-adapter');
const { redisClient } = require('../config/redis');
const { getAuthorizedBoard } = require('../utils/authorize');

let io; // module-level singleton so other files (route handlers) can access it later

// Presence = who currently has a board open, and whether they are active or
// idle. One person can have several tabs (several sockets); they count as
// "active" if ANY tab is active and "idle" only if ALL tabs are idle.
// fetchSockets() goes through the adapter, so with the Redis adapter this
// also sees sockets connected to other backend instances.
async function computePresence(boardId, excludeSocketId) {
  const sockets = await io.in(boardId).fetchSockets();
  const byUser = new Map();
  for (const s of sockets) {
    if (s.id === excludeSocketId) continue;
    const { userId, presenceStatus } = s.data;
    if (!userId) continue;
    const status = presenceStatus === 'idle' ? 'idle' : 'active';
    const existing = byUser.get(userId);
    if (!existing || status === 'active') byUser.set(userId, status);
  }
  return [...byUser].map(([userId, status]) => ({ userId, status }));
}

async function broadcastPresence(boardId, excludeSocketId) {
  try {
    const presence = await computePresence(boardId, excludeSocketId);
    io.to(boardId).emit('presence:update', presence);
  } catch (err) {
    console.error('Presence broadcast failed:', err.message);
  }
}

function initSocket(httpServer) {
  // FRONTEND_URL is set on the deployment platform to the real deployed
  // frontend origin (e.g. https://syncboard.vercel.app). Locally, it falls
  // back to '*' since local dev has no fixed origin to lock down to.
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || '*' },
  });

  // Socket.io's default adapter tracks room membership in plain in-memory
  // objects, scoped to THIS process only. That's fine for a single backend
  // instance (today's actual deployment), but if this ever ran as multiple
  // instances behind a load balancer, a client connected to instance A
  // would never see a broadcast fired from instance B, even if both
  // clients are "in the same room" logically - each instance only knows
  // about its own locally-connected sockets.
  //
  // The Redis adapter fixes that: every instance publishes its emits to a
  // shared Redis pub/sub channel, and every instance (including the one
  // that emitted) subscribes to that channel and forwards matching events
  // to its own local sockets. Redis becomes the shared relay connecting
  // otherwise-isolated processes.
  //
  // Two separate connections are required (one for publishing, one for
  // subscribing) because a single Redis connection can't issue normal
  // commands while it's blocked listening for pub/sub messages -
  // .duplicate() clones the existing client's connection config without
  // reusing its actual connection. Attached asynchronously since connecting
  // two new Redis clients can't happen synchronously inside this function;
  // the default in-memory adapter (correct for today's single instance)
  // is in effect during the brief window before this resolves.
  const pubClient = redisClient.duplicate();
  const subClient = pubClient.duplicate();
  pubClient.on('error', (err) => console.error('Redis adapter pub client error:', err.message));
  subClient.on('error', (err) => console.error('Redis adapter sub client error:', err.message));

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('Socket.io Redis adapter attached');
    })
    .catch((err) => {
      console.error('Failed to attach Socket.io Redis adapter:', err.message);
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
      // socket.data (not plain properties) is what fetchSockets() exposes for
      // sockets on OTHER instances when the Redis adapter is attached, which
      // presence needs to read.
      socket.data.userId = decoded.userId;
      socket.data.presenceStatus = 'active';
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (user ${socket.userId})`);

    // Every connected socket automatically joins a room keyed to its own
    // user id - not a board room. This is for events aimed at a specific
    // PERSON regardless of which board they're about (e.g. "you've been
    // invited to a board"), where the recipient isn't a board collaborator
    // yet and so can't be reached via a board room broadcast. Unlike
    // board:join, this needs no explicit client request or authorization
    // check - a user is always allowed to hear about things addressed to
    // themselves.
    socket.join(`user:${socket.userId}`);

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
        socket.data.boardId = boardId; // a socket is only ever on one board page
        console.log(`User ${socket.userId} joined board room ${boardId}`);
        await broadcastPresence(boardId);
      } catch (err) {
        socket.emit('board:error', { error: 'Failed to join board' });
      }
    });

    // Client reports 'active' or 'idle' only when its status CHANGES (the
    // idle timer lives in the browser), so this is low-volume.
    socket.on('presence:status', async (status) => {
      if (status !== 'active' && status !== 'idle') return;
      if (socket.data.presenceStatus === status) return;
      socket.data.presenceStatus = status;
      if (socket.data.boardId) await broadcastPresence(socket.data.boardId);
    });

    // 'disconnecting' (not 'disconnect') because the socket is still in its
    // rooms at this point, so we still know which board to notify; by the
    // time 'disconnect' fires it has already left them. The departing
    // socket is excluded from the list we send.
    socket.on('disconnecting', () => {
      if (socket.data.boardId) broadcastPresence(socket.data.boardId, socket.id);
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