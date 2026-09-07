import mongoose from 'mongoose';

const INCIDENT_TYPES = [
  'Landslide',
  'Flood',
  'Accident',
  'Road Block',
  'Damaged Road',
  'Fallen Tree',
  'Traffic',
  'Other',
];

const SEVERITY_LEVELS = ['Low', 'Medium', 'High'];

const incidentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: INCIDENT_TYPES,
      required: true,
    },
    severity: {
      type: String,
      enum: SEVERITY_LEVELS,
      required: true,
    },
    description: {
      type: String,
      default: '',
      maxlength: 500,
    },
    lat: {
      type: Number,
      required: true,
    },
    lon: {
      type: Number,
      required: true,
    },
    reportedBy: {
      type: String,
      default: 'Anonymous Driver',
    },
  },
  { timestamps: true }
);

export const INCIDENT_TYPE_LIST = INCIDENT_TYPES;
export const SEVERITY_LEVEL_LIST = SEVERITY_LEVELS;

export default mongoose.model('Incident', incidentSchema);
