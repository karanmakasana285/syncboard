require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { initSocket } = require('./socket');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');

const app = express();

// Render (and most hosting platforms) sit behind a reverse proxy. Without
// this, express-rate-limit sees every request as coming from the proxy's
// own IP, not the real client - meaning ONE person hitting the limit would
// block everyone. "1" trusts exactly one hop of proxying, which matches
// Render's setup.
app.set('trust proxy', 1);

const httpServer = http.createServer(app);
initSocket(httpServer);

// FRONTEND_URL is set on the deployment platform to the real deployed
// frontend origin. Locally, it falls back to allowing all origins, since
// local dev has no single fixed origin to lock down to.
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/boards', apiLimiter, require('./routes/boards'));
app.use('/api/columns', apiLimiter, require('./routes/columns'));
app.use('/api/cards', apiLimiter, require('./routes/cards'));

app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbState = mongoose.connection.readyState;
  res.json({
    status: 'ok',
    db: dbState === 1 ? 'connected' : 'not connected',
  });
});

module.exports = { app, httpServer };
