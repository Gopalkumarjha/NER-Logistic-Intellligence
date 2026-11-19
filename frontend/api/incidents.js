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
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    await connect();
    if (req.method === 'GET') {
      const incidents = await Incident.find().sort({ createdAt: -1 }).limit(500).lean();
      return res.status(200).json({ incidents: incidents.map(({ reporterId, ...incident }) => incident) });
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
