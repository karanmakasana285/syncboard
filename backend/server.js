const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');
const { app, httpServer } = require('./app');

connectDB();
connectRedis();

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
