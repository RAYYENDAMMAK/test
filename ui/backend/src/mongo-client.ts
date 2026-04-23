import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://open5gs-mongodb-svc:27017/open5gs';

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
  downlink: {
    value: { type: Number, default: 1000000000 },
    unit:  { type: Number, default: 0 },  // 0=bps, 1=Kbps, 2=Mbps, 3=Gbps, 4=Tbps
  },
  uplink: {
    value: { type: Number, default: 1000000000 },
    unit:  { type: Number, default: 0 },
  },
}, { _id: false });

const arpSchema = new mongoose.Schema({
  priority_level:            { type: Number, default: 8 },
  pre_emption_capability:    { type: Number, default: 1 },  // 1=Disabled
  pre_emption_vulnerability: { type: Number, default: 2 },  // 2=Enabled
}, { _id: false });

const qosSchema = new mongoose.Schema({
  index: { type: Number, default: 9 },  // 5QI
  arp:   { type: arpSchema, default: () => ({}) },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  name:     { type: String, required: true },  // DNN / APN name
  type:     { type: Number, default: 3 },      // 1=IPv4, 2=IPv6, 3=IPv4v6
  pcc_rule: { type: Array, default: [] },
  ambr:     { type: ambrSchema, default: () => ({}) },
  qos:      { type: qosSchema, default: () => ({}) },
}, { _id: false });

const sliceSchema = new mongoose.Schema({
  sst:               { type: Number, required: true },
  // Leave sd undefined (absent) for "no SD" semantics — an empty string is interpreted
  // as SD=0x000000 by Open5GS, which won't match a UE requesting SD=0xffffff (wildcard).
  sd:                { type: String },
  default_indicator: { type: Boolean, default: true },
  session:           { type: [sessionSchema], default: [] },
}, { _id: false });

const securitySchema = new mongoose.Schema({
  k:   { type: String, default: '' },
  op:  { type: String, default: null },
  opc: { type: String, default: '' },
  amf: { type: String, default: '8000' },
  sqn: { type: Number, default: 0 },
}, { _id: false });

// Open5GS subscriber schema — matches Open5GS WebUI / open5gs-dbctl format
const subscriberSchema = new mongoose.Schema({
  imsi:   { type: String, required: true, unique: true, match: /^[0-9]{5,15}$/ },
  msisdn: { type: [String], default: [] },
  imeisv: { type: String, default: '' },

  mme_host:   { type: [String], default: [] },
  mme_realm:  { type: [String], default: [] },
  purge_flag: { type: Array,    default: [] },

  security: { type: securitySchema, default: () => ({}) },
  ambr:     { type: ambrSchema,     default: () => ({}) },
  slice:    { type: [sliceSchema],  default: [] },

  access_restriction_data:     { type: Number, default: 32 },
  subscriber_status:           { type: Number, default: 0 },
  operator_determined_barring: { type: Number, default: 0 },
  network_access_mode:         { type: Number, default: 0 },
  subscribed_rau_tau_timer:    { type: Number, default: 12 },

  // Required by Open5GS >= 2.5
  schema_version: { type: Number, default: 1 },
}, {
  collection: 'subscribers',
  versionKey: false,
});

export const Subscriber = (mongoose.models.Subscriber || mongoose.model('Subscriber', subscriberSchema)) as mongoose.Model<any>;