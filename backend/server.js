import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import incidentRoutes from './routes/incidents.js';
import emergencyRoutes from './routes/emergency.js';
import trafficRoutes from './routes/traffic.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sih_logistics';

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use('/api/incidents', incidentRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/traffic', trafficRoutes);

// Connect to MongoDB — server keeps running even if this fails,
// so the API stays up and returns clean 503s instead of the process crashing.
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('⚠️  MongoDB connection failed:', err.message);
    console.error('⚠️  Server will keep running. Incident endpoints will return 503 until DB is available.');
  });

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
