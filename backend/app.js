require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { initSocket } = require('./socket');

const app = express();
const httpServer = http.createServer(app);
initSocket(httpServer);

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/boards', require('./routes/boards'));
app.use('/api/columns', require('./routes/columns'));
app.use('/api/cards', require('./routes/cards'));

app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbState = mongoose.connection.readyState;
  res.json({
    status: 'ok',
    db: dbState === 1 ? 'connected' : 'not connected',
  });
});

module.exports = { app, httpServer };
