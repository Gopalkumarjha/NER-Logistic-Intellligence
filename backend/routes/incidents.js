import express from 'express';
import mongoose from 'mongoose';
import Incident, { INCIDENT_TYPE_LIST, SEVERITY_LEVEL_LIST } from '../models/Incident.js';

const router = express.Router();

// Guard: if MongoDB is not connected, fail gracefully instead of hanging/crashing
function requireDB(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'Database unavailable. Incident data cannot be saved/fetched right now.',
    });
  }
  next();
}

// GET /api/incidents - list all incidents (most recent first)
router.get('/', requireDB, async (req, res) => {
  try {
    const incidents = await Incident.find().sort({ createdAt: -1 }).limit(200);
    res.json({ incidents });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch incidents.' });
  }
});

// POST /api/incidents - report a new incident
router.post('/', requireDB, async (req, res) => {
  try {
    const { type, severity, description, lat, lon, reportedBy } = req.body;

    if (!type || !INCIDENT_TYPE_LIST.includes(type)) {
      return res.status(400).json({ error: 'Invalid or missing incident type.' });
    }
    if (!severity || !SEVERITY_LEVEL_LIST.includes(severity)) {
      return res.status(400).json({ error: 'Invalid or missing severity level.' });
    }
    if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }

    const incident = await Incident.create({
      type,
      severity,
      description: description || '',
      lat,
      lon,
      reportedBy: reportedBy || 'Anonymous Driver',
    });

    res.status(201).json({ incident });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save incident.' });
  }
});

export default router;
