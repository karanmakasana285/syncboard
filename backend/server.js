const connectDB = require('./config/db');
const { app, httpServer } = require('./app');

connectDB();

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
