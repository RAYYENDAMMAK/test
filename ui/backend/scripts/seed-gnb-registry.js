#!/usr/bin/env node
/**
 * One-time setup: creates gnb_registry + gnb_events collections with
 * proper indexes, and optionally seeds initial gNB entries.
 *
 * Usage:
 *   MONGO_URI=mongodb://192.168.1.102:27017/open5gs node scripts/seed-gnb-registry.js
 *   # or with default URI:
 *   node scripts/seed-gnb-registry.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/open5gs';

const INITIAL_GNBs = [
  {
    gnbId:         '0x00001A',
    name:          'gNB-Tunis-01',
    type:          'gNB',
    vendor:        'srsRAN',
    version:       '23.11.0',
    site:          'Tunis Campus',
    expectedIP:    '192.168.10.11',
    maxUEs:        128,
    allowedSlices: [{ sst: 1, sd: '000001' }, { sst: 2, sd: '000002' }],
    notes:         '',
    createdAt:     new Date(),
    updatedAt:     new Date(),
  },
  {
    gnbId:         '0x00002B',
    name:          'gNB-Sfax-02',
    type:          'gNB',
    vendor:        'OpenAirInterface',
    version:       '2024.w06',
    site:          'Sfax Lab',
    expectedIP:    '192.168.10.22',
    maxUEs:        128,
    allowedSlices: [{ sst: 1, sd: '000001' }],
    notes:         '',
    createdAt:     new Date(),
    updatedAt:     new Date(),
  },
  {
    gnbId:         '0x00003C',
    name:          'gNB-Sousse-03',
    type:          'gNB',
    vendor:        'OpenAirInterface',
    version:       '2024.w06',
    site:          'Sousse Site',
    expectedIP:    '192.168.10.33',
    maxUEs:        64,
    allowedSlices: [{ sst: 1, sd: '000001' }, { sst: 3, sd: '000003' }],
    notes:         '',
    createdAt:     new Date(),
    updatedAt:     new Date(),
  },
  {
    gnbId:         '0x04F3A0',
    name:          'ng-eNB-Monastir-04',
    type:          'ng-eNB',
    vendor:        'Nokia',
    version:       'AirScale 22B',
    site:          'Monastir',
    expectedIP:    '192.168.10.44',
    maxUEs:        32,
    allowedSlices: [{ sst: 1, sd: '000001' }],
    notes:         'NSA/EN-DC capable',
    createdAt:     new Date(),
    updatedAt:     new Date(),
  },
  {
    gnbId:         '0x00005E',
    name:          'gNB-Bizerte-05',
    type:          'gNB',
    vendor:        'srsRAN',
    version:       '23.11.0',
    site:          'Bizerte',
    expectedIP:    '192.168.10.55',
    maxUEs:        128,
    allowedSlices: [{ sst: 1, sd: '000001' }, { sst: 2, sd: '000002' }],
    notes:         '',
    createdAt:     new Date(),
    updatedAt:     new Date(),
  },
];

async function main() {
  console.log(`Connecting to ${MONGO_URI} …`);
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  // ── gnb_registry ────────────────────────────────────────────────────────────
  const existing = await db.listCollections({ name: 'gnb_registry' }).toArray();
  if (existing.length === 0) {
    await db.createCollection('gnb_registry');
    console.log('Created collection: gnb_registry');
  }
  const registry = db.collection('gnb_registry');
  await registry.createIndex({ gnbId: 1 },      { unique: true, background: true });
  await registry.createIndex({ expectedIP: 1 },  { background: true });
  console.log('Indexes ensured on gnb_registry');

  // ── gnb_events ──────────────────────────────────────────────────────────────
  const evExisting = await db.listCollections({ name: 'gnb_events' }).toArray();
  if (evExisting.length === 0) {
    await db.createCollection('gnb_events');
    console.log('Created collection: gnb_events');
  }
  const events = db.collection('gnb_events');
  await events.createIndex({ gnbId: 1 },     { background: true });
  await events.createIndex({ timestamp: -1 }, { background: true });
  // TTL — auto-delete events older than 30 days
  await events.createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: 2592000, background: true, name: 'ttl_30d' }
  );
  console.log('Indexes ensured on gnb_events');

  // ── Seed initial gNBs (skip if already present) ───────────────────────────
  let seeded = 0;
  for (const gnb of INITIAL_GNBs) {
    const result = await registry.updateOne(
      { gnbId: gnb.gnbId },
      { $setOnInsert: gnb },
      { upsert: true }
    );
    if (result.upsertedCount > 0) {
      console.log(`  Inserted: ${gnb.name} (${gnb.gnbId})`);
      seeded++;
    } else {
      console.log(`  Already exists: ${gnb.name} — skipped`);
    }
  }
  console.log(`\nDone — ${seeded} new gNBs inserted, ${INITIAL_GNBs.length - seeded} already existed.`);

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
