import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  type: { type: String, required: true }, description: { type: String, default: '' },
  latitude: { type: Number, required: true }, longitude: { type: Number, required: true },
  severity: { type: String, default: 'Medium' }, createdAt: { type: Date, default: Date.now },
}, { strict: false });
const Incident = mongoose.models.Incident || mongoose.model('Incident', schema);

async function connect() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI is not configured.');
  if (mongoose.connection.readyState === 1) return;
  if (!globalThis.__nerMongoConnection) globalThis.__nerMongoConnection = mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  await globalThis.__nerMongoConnection;
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    await connect();
    if (req.method === 'GET') {
      const incidents = await Incident.find().select('-reporterId -resolutionEvidence.verifierId -resolutionEvidence.latitude -resolutionEvidence.longitude -resolutionEvidence.proof').sort({ createdAt: -1 }).limit(500).lean();
      return res.status(200).json({ incidents: incidents.map(({ resolutionEvidence = [], ...incident }) => ({ ...incident, resolutionCount: resolutionEvidence.length })) });
    }
    if (req.method === 'PATCH') {
      const id = String(req.query?.id || '');
      const { latitude, longitude, proof, verifierId } = req.body || {};
      const lat = Number(latitude), lon = Number(longitude);
      if (!mongoose.Types.ObjectId.isValid(id) || !Number.isFinite(lat) || !Number.isFinite(lon) || typeof proof !== 'string' || proof.trim().length < 20 || proof.length > 500 || typeof verifierId !== 'string' || verifierId.length < 20 || verifierId.length > 100) {
        return res.status(400).json({ error: 'A nearby GPS position, a proof note (20–500 characters), and a verifier ID are required.' });
      }
      const incident = await Incident.findById(id);
      if (!incident) return res.status(404).json({ error: 'Incident report not found.' });
      if (incident.verificationStatus === 'resolved') return res.status(409).json({ error: 'This incident is already resolved.' });
      if (incident.reporterId && incident.reporterId === verifierId) return res.status(403).json({ error: 'The original reporter cannot verify their own report.' });
      const incLat = Number(incident.latitude ?? incident.lat), incLon = Number(incident.longitude ?? incident.lon);
      const rad = (n) => (n * Math.PI) / 180;
      const dLat = rad(lat - incLat), dLon = rad(lon - incLon);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(incLat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
      const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (!Number.isFinite(distanceKm) || distanceKm > 5) return res.status(403).json({ error: 'You must be within 5 km of this incident to submit resolution proof.' });
      const updated = await Incident.findOneAndUpdate(
        { _id: id, verificationStatus: { $ne: 'resolved' }, 'resolutionEvidence.verifierId': { $ne: verifierId } },
        { $push: { resolutionEvidence: { verifierId, latitude: lat, longitude: lon, proof: proof.trim(), createdAt: new Date() } } },
        { new: true }
      );
      if (!updated) return res.status(409).json({ error: 'You have already submitted proof for this report, or it has been resolved.' });
      const resolutionCount = updated.resolutionEvidence?.length || 0;
      if (resolutionCount >= 2) updated.verificationStatus = 'resolved';
      await updated.save();
      return res.status(200).json({ incident: { _id: String(updated._id), verificationStatus: updated.verificationStatus || 'unverified', resolutionCount, createdAt: updated.createdAt, type: updated.type, severity: updated.severity, description: updated.description, lat: updated.lat, lon: updated.lon } });
    }
    if (req.method === 'DELETE') {
      const id = String(req.query?.id || '');
      const reporterId = String(req.body?.reporterId || '');
      if (!mongoose.Types.ObjectId.isValid(id) || !reporterId) return res.status(400).json({ error: 'A valid incident ID and reporter ownership token are required.' });
      const result = await Incident.deleteOne({ _id: id, reporterId });
      if (!result.deletedCount) return res.status(404).json({ error: 'Report not found or this device is not its owner.' });
      return res.status(200).json({ deleted: true });
    }
    const body = req.body || {};
    const latitude = Number(body.latitude ?? body.lat), longitude = Number(body.longitude ?? body.lon);
    if (!body.type || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ error: 'Incident type and valid coordinates are required.' });
    const { reporterId, ...report } = body;
    const incident = await Incident.create({ ...report, latitude, longitude, ...(typeof reporterId === 'string' && reporterId.length <= 100 ? { reporterId } : {}), verificationStatus: 'unverified', createdAt: new Date() });
    const { reporterId: _privateReporterId, ...publicIncident } = incident.toObject();
    return res.status(201).json({ incident: publicIncident });
  } catch (error) {
    console.error('Incident API failed:', error.message);
    return res.status(error.message.includes('not configured') ? 503 : 502).json({ error: error.message.includes('not configured') ? error.message : 'Incident database is unavailable. Check the MongoDB connection and network access.' });
  }
}
