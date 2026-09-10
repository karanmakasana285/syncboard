require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());

connectDB();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/boards', require('./routes/boards'));
app.use('/api/columns', require('./routes/columns'));
app.use('/api/cards', require('./routes/cards'));

app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbState = mongoose.connection.readyState; // 1 = connected
  res.json({
    status: 'ok',
    db: dbState === 1 ? 'connected' : 'not connected',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
