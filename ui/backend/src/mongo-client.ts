import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb-svc:27017/open5gs';

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
  ambr: {
    downlink: { value: Number, unit: Number },
    uplink: { value: Number, unit: Number },
  },
  slice: [
    {
      sst: Number,
      sd: String,
      default_indicator: Boolean,
      session: [
        {
          name: String,
          type: Number,
          pcc_rule: [mongoose.Schema.Types.Mixed],
          ambr: {
            downlink: { value: Number, unit: Number },
            uplink: { value: Number, unit: Number },
          },
          qos: {
            index: Number,
            arp: {
              priority_level: Number,
              pre_emption_capability: Number,
              pre_emption_vulnerability: Number,
            },
          },
        },
      ],
    },
  ],
  access_restriction_data: Number,
  subscriber_status: Number,
  operator_determined_barring: Number,
  network_access_mode: Number,
  subscribed_rau_tau_timer: Number,
  __v: Number,
}, { collection: 'subscribers', timestamps: true });

export const Subscriber = (mongoose.models.Subscriber || mongoose.model('Subscriber', subscriberSchema)) as mongoose.Model<any>;
