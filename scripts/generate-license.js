#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const jwt  = require('jsonwebtoken');

// ─── Parse CLI arguments ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get  = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
};

const clusterId   = get('--cluster-id');
const institution = get('--institution');
const features    = get('--features');
const maxGnbs     = get('--max-gnbs');
const days        = get('--days')  || '365';
const outFile     = get('--out')   || 'license.jwt';

if (!clusterId || !institution || !features || !maxGnbs) {
  console.error(`
Usage:
  node scripts/generate-license.js \\
    --cluster-id  <uuid>           \\
    --institution "My University"  \\
    --features    multus,tracing,gnb_mgmt \\
    --max-gnbs    10               \\
    --days        365              \\
    --out         license.jwt
`);
  process.exit(1);
}

// ─── Read private key ────────────────────────────────────────────────────────
const SCRIPT_DIR   = path.dirname(path.resolve(__filename));
const PRIVATE_KEY_PATH = path.join(SCRIPT_DIR, 'license-private.pem');

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error(`[error] Private key not found at ${PRIVATE_KEY_PATH}`);
  console.error('[error] Run scripts/generate-keypair.sh first.');
  process.exit(1);
}
const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');

// ─── Build and sign payload ──────────────────────────────────────────────────
const now = Math.floor(Date.now() / 1000);

const payload = {
  iss: 'ieee-5g-core',
  sub: clusterId,
  institution,
  features: features.split(',').map(f => f.trim()),
  max_gnbs: parseInt(maxGnbs),
  cluster_id: clusterId,
  iat: now,
  exp: now + (parseInt(days) * 86400),
};

const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

// ─── Write output ────────────────────────────────────────────────────────────
fs.writeFileSync(outFile, token, 'utf8');

// ─── Summary table ───────────────────────────────────────────────────────────
const expiryDate = new Date((now + parseInt(days) * 86400) * 1000)
  .toISOString()
  .slice(0, 10);

console.log('');
console.log('  License generated successfully');
console.log('  ─────────────────────────────────────────────');
console.log(`  Institution : ${institution}`);
console.log(`  Cluster ID  : ${clusterId}`);
console.log(`  Features    : ${features}`);
console.log(`  Max gNBs    : ${maxGnbs}`);
console.log(`  Valid days  : ${days}`);
console.log(`  Expires on  : ${expiryDate}`);
console.log(`  Output file : ${outFile}`);
console.log('');
