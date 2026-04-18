import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://192.168.1.102:27017/open5gs';

let connected = false;

export async function connectMongo() {
  if (connected) return;
  try {
    await mongoose.connect(MONGO_URI);
    connected = true;
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

const ambrSchema = new mongoose.Schema({
  downlink: { value: Number, unit: Number },
  uplink: { value: Number, unit: Number },
}, { _id: false });

const arpSchema = new mongoose.Schema({
  priority_level: Number,
  pre_emption_capability: Number,
  pre_emption_vulnerability: Number,
}, { _id: false });

const qosSchema = new mongoose.Schema({
  index: Number,
  arp: arpSchema,
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  name: String,
  type: Number,
  pcc_rule: [mongoose.Schema.Types.Mixed],
  ambr: ambrSchema,
  qos: qosSchema,
}, { _id: false });

const sliceSchema = new mongoose.Schema({
  sst: Number,
  sd: String,
  default_indicator: Boolean,
  session: [sessionSchema],
}, { _id: false });

// Open5GS subscriber schema
const subscriberSchema = new mongoose.Schema({
  imsi: { type: String, required: true, unique: true },
  msisdn: [String],
  imeisv: [String],
  mme_host: [String],
  mme_realm: [String],
  purge_flag: [Boolean],
  security: {
    k: String,
    op: String,
    opc: String,
    amf: String,
    sqn: mongoose.Schema.Types.Mixed,
  },
  ambr: ambrSchema,
  slice: [sliceSchema],
  access_restriction_data: Number,
  subscriber_status: Number,
  operator_determined_barring: Number,
  network_access_mode: Number,
  subscribed_rau_tau_timer: Number,
  __v: Number,
}, { collection: 'subscribers', timestamps: true });

export const Subscriber = (mongoose.models.Subscriber || mongoose.model('Subscriber', subscriberSchema)) as mongoose.Model<any>;
